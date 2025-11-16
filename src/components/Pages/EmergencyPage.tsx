import React, { useEffect, useState } from 'react';
import { AlertTriangle, Phone, MapPin, Share, Clock, Shield, Zap, Users, Heart } from 'lucide-react';
import { EMERGENCY_NUMBERS } from '../../utils/constants';
import { EmergencyContactsData } from '../../services/api';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';
import { useAuth } from '../../hooks/useAuth';
import { getMedicalProfile, MedicalProfile } from '../../services/medicalProfileRepository';

const EmergencyPage: React.FC = () => {
  const { user } = useAuth();
  const [sosActivated, setSosActivated] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [latestPlanName, setLatestPlanName] = useState<string | null>(null);
  const [emergencyData, setEmergencyData] = useState<EmergencyContactsData | null>(null);
  // Add state to track current destination
  const [currentDestination, setCurrentDestination] = useState<string | null>(null);
  const [loadingEmergency, setLoadingEmergency] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  
  // Group selection states
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [medicalProfile, setMedicalProfile] = useState<MedicalProfile | null>(null);

  // Fetch user groups
  useEffect(() => {
    const fetchGroups = async () => {
      if (!user?.uid) return;
      
      setLoadingGroups(true);
      setGroupsError(null);
      
      try {
        const supabase = await getAuthenticatedSupabaseClient();
        // First get user's group memberships
        const { data: userGroupData, error: userGroupError } = await supabase
          .from('user_groups')
          .select('group_id')
          .eq('user_id', user.uid);
          
        if (userGroupError) throw userGroupError;
        
        if (!userGroupData || userGroupData.length === 0) {
          setGroups([]);
          return;
        }
        
        // Then get the actual groups
        const groupIds = userGroupData.map(ug => ug.group_id);
        const { data, error } = await supabase
          .from('groups')
          .select('*')
          .in('id', groupIds);
          
        if (error) throw error;
        setGroups(data || []);
        
        // Load saved selected group from localStorage
        const savedGroupId = localStorage.getItem('selectedGroupId');
        if (savedGroupId && data?.find(g => g.id === savedGroupId)) {
          handleGroupSelect(savedGroupId);
        }
      } catch (error) {
        console.error('Error fetching groups:', error);
        setGroupsError('Failed to load groups');
      } finally {
        setLoadingGroups(false);
      }
    };

    fetchGroups();
  }, [user?.uid]);

  // Load medical profile for emergency display (Supabase first, then localStorage fallback)
  useEffect(() => {
    const loadMedical = async () => {
      if (!user?.uid) return;

      // If offline, prefer local cache directly
      if (isOffline) {
        try {
          const cachedRaw = localStorage.getItem('medical_profile_cached');
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as MedicalProfile;
            if (cached.userId === user.uid) {
              setMedicalProfile(cached);
              return;
            }
          }
        } catch (e) {
          console.error('Error reading cached medical profile (emergency page):', e);
        }
        return;
      }

      try {
        const profile = await getMedicalProfile(user.uid);
        if (profile) {
          setMedicalProfile(profile);
        }
      } catch (e) {
        console.error('Error loading medical profile on emergency page:', e);
        // Fallback to cache
        try {
          const cachedRaw = localStorage.getItem('medical_profile_cached');
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as MedicalProfile;
            if (cached.userId === user.uid) {
              setMedicalProfile(cached);
            }
          }
        } catch (e2) {
          console.error('Error reading cached medical profile (fallback):', e2);
        }
      }
    };

    loadMedical();
  }, [user?.uid, isOffline]);
  
  // Fetch finalized plan when group is selected
  useEffect(() => {
    const fetchFinalizedPlan = async () => {
      if (!selectedGroupId) return;
      
      try {
        const supabase = await getAuthenticatedSupabaseClient();
        const { data, error } = await supabase
          .from('group_finalized_plans')
          .select('*')
          .eq('group_id', selectedGroupId)
          .eq('status', 'fixed')
          .single();
          
        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
          throw error;
        }
        
        if (data) {
          // setFinalizedPlan(data); // Not needed currently
          setLatestPlanName(data.plan_name);
          setCurrentDestination(data.destination);
          
          console.log('Finalized plan data:', data);
          console.log('Destination from plan:', data.destination);
          console.log('Plan name:', data.plan_name);
          console.log('Group ID:', selectedGroupId);
          
          // Fetch emergency contacts for the destination
          if (data.destination && !isOffline) {
            console.log('Fetching emergency contacts for destination:', data.destination);
            await fetchEmergencyContacts(data.destination);
          } else if (data.destination && isOffline) {
            // Load from localStorage if offline
            const cachedData = localStorage.getItem(`emergency_contacts_cached_${data.destination}`);
            if (cachedData) {
              setEmergencyData(JSON.parse(cachedData));
            }
          }
        } else {
          // setFinalizedPlan(null); // Not needed currently
          setLatestPlanName(null);
          setEmergencyError('No trip plan finalized yet.');
        }
      } catch (error) {
        console.error('Error fetching finalized plan:', error);
        setEmergencyError('Failed to load trip plan.');
      }
    };
    
    fetchFinalizedPlan();
  }, [selectedGroupId, isOffline]);
  
  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  const fetchEmergencyContacts = async (destination: string) => {
    if (!selectedGroupId) return;
    
    console.log('fetchEmergencyContacts called with destination:', destination);
    
    setLoadingEmergency(true);
    setEmergencyError(null);
    
    try {
      // Check if OpenAI API key is available
      if (!import.meta.env.VITE_OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured. Please add VITE_OPENAI_API_KEY to your environment variables.');
      }
      
      // Use OpenAI API to generate emergency contacts for the destination
      console.log('Generating emergency contacts for:', destination);
      
      const prompt = `Generate emergency contacts for ${destination}. Return a JSON object with the following structure:
{
  "general": {
    "police": { "number": "100", "note": "Emergency police number" },
    "ambulance": { "number": "108", "note": "Emergency ambulance" },
    "fire": { "number": "101", "note": "Fire department" },
    "womenHelpline": { "number": "181", "note": "Women's helpline" },
    "touristHelpline": { "number": "1363", "note": "Tourist helpline" }
  },
  "local": {
    "primaryCity": "${destination}",
    "nearestHospitals": [
      { "name": "Hospital Name", "address": "Full address", "phone": "Phone number", "open24x7": true }
    ],
    "nearestPoliceStations": [
      { "name": "Police Station Name", "address": "Full address", "phone": "Phone number" }
    ]
  },
  "tips": ["Tip 1", "Tip 2", "Tip 3"]
}

Provide real, accurate emergency information for ${destination}, India. Include at least 3 hospitals and 3 police stations with actual addresses and phone numbers.`;
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that provides accurate emergency contact information. Always return valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        }),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid OpenAI API key. Please check your VITE_OPENAI_API_KEY environment variable.');
        }
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json();
      const jsonStr = data.choices[0].message.content;
      
      // Extract JSON from the response
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      const emergencyData = JSON.parse(jsonMatch[0]) as EmergencyContactsData;

      setEmergencyData(emergencyData);

      // Cache in localStorage by destination
      localStorage.setItem(`emergency_contacts_cached_${destination}`, JSON.stringify(emergencyData));
      console.log(`Generated emergency contacts for ${destination}`);
    } catch (e) {
      console.error('Error generating emergency contacts:', e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      setEmergencyError(`Unable to generate emergency contacts for ${destination}. ${errorMessage} Showing general numbers.`);
      
      // Try to load from cache first
      const cachedData = destination
        ? localStorage.getItem(`emergency_contacts_cached_${destination}`)
        : null;
      if (cachedData) {
        setEmergencyData(JSON.parse(cachedData));
      }
    } finally {
      setLoadingEmergency(false);
    }
  };
  
  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    localStorage.setItem('selectedGroupId', groupId);
    // const group = groups.find(g => g.id === groupId);
    // setSelectedGroup(group || null); // Not needed currently
  };

  
  const activateSOS = () => {
    if (sosActivated) return;
    
    setSosActivated(true);
    
    // Get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setLocationError(null);
        },
        () => {
          setLocationError('Unable to get your location. Please enable location services.');
        }
      );
    } else {
      setLocationError('Geolocation is not supported by this browser.');
    }

    // In a real app, this would:
    // 1. Send location to emergency services
    // 2. Notify emergency contacts
    // 3. Alert travel group members
    // 4. Start recording audio/video if needed

    // Auto-deactivate after 30 seconds for demo
    setTimeout(() => {
      setSosActivated(false);
    }, 30000);
  };

  const shareLocation = () => {
    if (location) {
      const locationUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
      navigator.clipboard.writeText(locationUrl);
      alert('Location copied to clipboard! Share this with your contacts.');
    } else {
      alert('Location not available. Please try again.');
    }
  };

  const formatPhoneNumber = (number: string) => {
    return number;
  };

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Offline Banner */}
        {isOffline && (
          <div className="mb-6 p-4 glass-card border border-yellow-500/30 bg-yellow-500/10">
            <div className="flex items-center text-yellow-400">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <span className="font-medium">You are offline. Showing cached medical information and emergency data.</span>
            </div>
          </div>
        )}
        
        {/* Group Selector */}
        {groups.length > 0 && (
          <div className="mb-8">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-primary">Select Group Trip</h3>
              </div>
              
              <select
                value={selectedGroupId || ''}
                onChange={(e) => handleGroupSelect(e.target.value)}
                className="w-full glass-input px-4 py-3 rounded-lg"
                disabled={loadingGroups}
              >
                <option value="">Choose a group...</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} - {group.destination || 'No destination'}
                  </option>
                ))}
              </select>
              
              {groupsError && (
                <div className="mt-2 text-sm text-red-400">{groupsError}</div>
              )}
            </div>
          </div>
        )}
        
        {groups.length === 0 && !loadingGroups && (
          <div className="mb-8 p-4 glass-card border border-white/20">
            <div className="text-center text-secondary">No groups found.</div>
          </div>
        )}
        
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-2">
            Emergency Assistance
            {latestPlanName && (
              <span className="text-2xl block mt-2">for: {latestPlanName}</span>
            )}
          </h1>
          <p className="text-xl text-secondary">
            Quick access to emergency services and safety features
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* SOS Section */}
          <div className="space-y-6">
            {/* SOS Button */}
            <div className="glass-card p-8 text-center">
              <h2 className="text-2xl font-bold text-primary mb-6">Emergency SOS</h2>
              
              {sosActivated ? (
                <div className="space-y-4">
                  <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <AlertTriangle className="h-16 w-16 text-white" />
                  </div>
                  <div className="text-red-600 font-bold text-lg">SOS ACTIVATED</div>
                  <div className="text-sm text-secondary">
                    Emergency services and contacts have been notified
                  </div>
                  {location && (
                    <div className="glass-card border border-red-500/30 p-4">
                      <div className="flex items-center justify-center text-sm text-red-400 mb-2">
                        <MapPin className="h-4 w-4 mr-1" />
                        Location Shared
                      </div>
                      <div className="text-xs text-red-400 font-mono">
                        {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    onClick={activateSOS}
                    className="w-32 h-32 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full flex items-center justify-center mx-auto hover:scale-105 transform transition-all duration-300 shadow-lg"
                  >
                    <div className="text-center">
                      <AlertTriangle className="h-12 w-12 mb-2" />
                      <div className="text-sm font-bold">SOS</div>
                    </div>
                  </button>
                  <div className="text-secondary">
                    Press to send emergency alert with your location
                  </div>
                </div>
              )}

              {locationError && (
                <div className="mt-4 p-3 glass-card border border-yellow-500/30">
                  <div className="text-sm text-yellow-400">{locationError}</div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Quick Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={shareLocation}
                  disabled={!location}
                  className="w-full flex items-center justify-center p-4 glass-card hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Share className="h-5 w-5 mr-3 text-blue-400" />
                  <span className="font-medium text-primary">Share Live Location</span>
                </button>

                <button
                  className="w-full flex items-center justify-center p-4 glass-card hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!medicalProfile?.emergencyContactPhone}
                  onClick={() => {
                    if (medicalProfile?.emergencyContactPhone) {
                      window.location.href = `tel:${medicalProfile.emergencyContactPhone}`;
                    }
                  }}
                >
                  <Phone className="h-5 w-5 mr-3 text-green-400" />
                  <span className="font-medium text-primary">
                    {medicalProfile?.emergencyContactName
                      ? `Call ${medicalProfile.emergencyContactName}`
                      : 'Call Emergency Contact'}
                  </span>
                </button>

                <button className="w-full flex items-center justify-center p-4 glass-card hover:bg-white/10 rounded-xl transition-colors">
                  <Zap className="h-5 w-5 mr-3 text-purple-400" />
                  <span className="font-medium text-primary">Send Group Alert</span>
                </button>
              </div>
            </div>

            {/* AI Emergency Contacts */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-4">
                Emergency Contacts {latestPlanName ? `for ${latestPlanName}` : 'for Your Trip'}
                {currentDestination && <span className="text-sm text-secondary block">Destination: {currentDestination}</span>}
              </h3>
              {loadingEmergency && (
                <div className="text-secondary text-sm">Fetching emergency contacts...</div>
              )}
              {emergencyError && (
                <div className="text-sm text-red-400 mb-4">{emergencyError}</div>
              )}
              {emergencyData && emergencyData.general && (
                <div className="space-y-4 text-sm mb-6">
                  <div>
                    <div className="font-semibold text-primary mb-2">General</div>
                    <div className="space-y-1">
                      {Object.entries(emergencyData.general).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-secondary capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className="text-primary font-medium">
                            {typeof value === 'object' && value !== null ? 
                              (value as any).number || JSON.stringify(value) : 
                              value
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {emergencyData.local?.nearestHospitals && emergencyData.local.nearestHospitals.length > 0 && (
                    <div>
                      <div className="font-semibold text-primary mb-2">Nearby Hospitals</div>
                      <div className="space-y-1">
                        {emergencyData.local.nearestHospitals.map((hospital, idx) => (
                          <div key={idx} className="text-secondary">
                            <span className="text-primary">{hospital.name}</span>
                            {hospital.address && <span className="text-xs block ml-4">{hospital.address}</span>}
                            {hospital.phone && <span className="text-xs block ml-4">📞 {hospital.phone}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {emergencyData.local?.nearestPoliceStations && emergencyData.local.nearestPoliceStations.length > 0 && (
                    <div>
                      <div className="font-semibold text-primary mb-2">Nearby Police Stations</div>
                      <div className="space-y-1">
                        {emergencyData.local.nearestPoliceStations.map((station, idx) => (
                          <div key={idx} className="text-secondary">
                            <span className="text-primary">{station.name}</span>
                            {station.address && <span className="text-xs block ml-4">{station.address}</span>}
                            {station.phone && <span className="text-xs block ml-4">📞 {station.phone}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {emergencyData.tips?.length > 0 && (
                    <div>
                      <div className="font-semibold text-primary mb-2">Tips</div>
                      <ul className="list-disc list-inside text-secondary space-y-1">
                        {emergencyData.tips.map((t, i) => (<li key={i}>{t}</li>))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              
              {/* Always show basic emergency numbers */}
              <div className="border-t border-white/20 pt-4">
                <div className="font-semibold text-primary mb-2">General Emergency Numbers (India)</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {EMERGENCY_NUMBERS.map((service, index) => (
                    <div key={index} className="flex justify-between">
                      <span className="text-secondary">{service.icon} {service.name}:</span>
                      <a
                        href={`tel:${service.number}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {service.number}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Safety Tips */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-primary mb-4 flex items-center">
                <Shield className="h-5 w-5 mr-2 text-green-400" />
                Safety Tips
              </h3>
              <div className="space-y-2 text-sm text-secondary">
                <p>• Always inform someone about your travel plans</p>
                <p>• Keep emergency contacts easily accessible</p>
                <p>• Download offline maps for your destination</p>
                <p>• Carry copies of important documents</p>
                <p>• Trust your instincts and stay alert</p>
              </div>
            </div>
          </div>

          {/* Emergency Numbers (AI / destination-specific) */}
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-1">Emergency Numbers</h3>
              {currentDestination && (
                <p className="text-xs text-secondary mb-4">
                  Destination-specific numbers for {currentDestination}.
                </p>
              )}

              <div className="space-y-3">
                {emergencyData?.general ? (
                  Object.entries(emergencyData.general).map(([key, value]) => {
                    const label = key
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, (c) => c.toUpperCase())
                      .trim();
                    const number = (value as any).number ?? '';
                    const note = (value as any).note ?? '';

                    if (!number) return null;

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-4 glass-card hover:bg-white/10 transition-all duration-300"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-primary">{label}</span>
                          {note && (
                            <span className="text-xs text-secondary mt-1">{note}</span>
                          )}
                        </div>
                        <a
                          href={`tel:${number}`}
                          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-2 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 flex items-center"
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          {formatPhoneNumber(number)}
                        </a>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-secondary">
                    Destination-specific emergency numbers will appear here once a finalized plan is loaded
                    and emergency contacts are generated.
                  </div>
                )}
              </div>
            </div>

            {/* Medical Info */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-2 flex items-center">
                <Heart className="h-5 w-5 mr-2 text-red-400" />
                Your Medical Information
              </h3>
              <p className="text-sm text-secondary mb-4">
                This helps responders assist you during emergencies.
              </p>

              {user ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between p-3 glass-card">
                    <span className="text-secondary">Blood Type</span>
                    <span className="text-primary font-medium">
                      {medicalProfile?.bloodType || 'Not specified'}
                    </span>
                  </div>

                  <div className="p-3 glass-card">
                    <div className="flex justify-between mb-1">
                      <span className="text-secondary">Allergies</span>
                    </div>
                    <div className="text-primary text-xs">
                      {medicalProfile?.allergies && medicalProfile.allergies.length > 0
                        ? medicalProfile.allergies.join(', ')
                        : 'None specified'}
                    </div>
                  </div>

                  <div className="p-3 glass-card">
                    <div className="flex justify-between mb-1">
                      <span className="text-secondary">Medical Conditions</span>
                    </div>
                    <div className="text-primary text-xs">
                      {medicalProfile?.medicalConditions && medicalProfile.medicalConditions.length > 0
                        ? medicalProfile.medicalConditions.join(', ')
                        : 'None specified'}
                    </div>
                  </div>

                  <div className="p-3 glass-card">
                    <div className="flex justify-between mb-1">
                      <span className="text-secondary">Emergency Contact</span>
                    </div>
                    <div className="text-primary text-xs">
                      {medicalProfile?.emergencyContactName || 'Not specified'}
                      {medicalProfile?.emergencyContactPhone && (
                        <span className="block mt-1">
                          📞 {medicalProfile.emergencyContactPhone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-secondary mt-2">
                    To update this information, go to your Profile &gt; Medical Information.
                  </div>
                </div>
              ) : (
                <div className="text-secondary text-sm">
                  Sign in and add your medical information in your profile so it appears here.
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-4 flex items-center">
                <Clock className="h-5 w-5 mr-2 text-blue-400" />
                Recent Activity
              </h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between p-3 glass-card border border-green-500/30">
                  <span className="text-green-400">Location shared with group</span>
                  <span className="text-green-400">2 min ago</span>
                </div>
                
                <div className="flex items-center justify-between p-3 glass-card border border-blue-500/30">
                  <span className="text-blue-400">Emergency contact updated</span>
                  <span className="text-blue-400">1 hour ago</span>
                </div>
                
                <div className="flex items-center justify-between p-3 glass-card">
                  <span className="text-secondary">Safety checklist completed</span>
                  <span className="text-muted">Yesterday</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyPage;