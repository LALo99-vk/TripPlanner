import React, { useEffect, useState, useRef, useCallback } from 'react';
import { AlertTriangle, Phone, MapPin, Share, Clock, Shield, Zap, Users, Heart, RefreshCw, XCircle, CheckCircle, Car } from 'lucide-react';
import { EMERGENCY_NUMBERS } from '../../utils/constants';
import { EmergencyContactsData } from '../../services/api';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';
import { useAuth } from '../../hooks/useAuth';
import { getMedicalProfile, MedicalProfile } from '../../services/medicalProfileRepository';
import { sendSOSAlert, sendLocationUpdate } from '../../services/chatRepository';
import { sendCompleteSOSAlert, sendLocationUpdateSMS } from '../../services/sosAlertService';
import { 
  createSOSSession, 
  cancelSOSSession, 
  getSOSSession,
  getAcknowledgements,
  getResponseTypeDisplay,
  formatAckTime,
  type Acknowledgement,
  type SOSSession 
} from '../../services/sosSessionService';

// Location update interval (3 minutes in milliseconds)
const LOCATION_UPDATE_INTERVAL = 3 * 60 * 1000;

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
  
  // SOS tracking states for automatic location updates
  const [sosStartTime, setSosStartTime] = useState<Date | null>(null);
  const [locationUpdateCount, setLocationUpdateCount] = useState(0);
  const [nextUpdateIn, setNextUpdateIn] = useState<number>(0);
  const locationUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // SOS session and acknowledgement tracking
  const [sosSession, setSosSession] = useState<SOSSession | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<Acknowledgement[]>([]);
  const ackPollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(false);

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
          const newDestination = data.destination;
          
          console.log('Finalized plan data:', data);
          console.log('Destination from plan:', newDestination);
          console.log('Plan name:', data.plan_name);
          console.log('Group ID:', selectedGroupId);
          
          // Check if destination changed
          const destinationChanged = currentDestination !== newDestination;
          setCurrentDestination(newDestination);
          
          if (newDestination) {
            // Try to load from cache first
            const cachedData = localStorage.getItem(`emergency_contacts_cached_${newDestination}`);
            const cachedTimestamp = localStorage.getItem(`emergency_contacts_timestamp_${newDestination}`);
            
            if (cachedData) {
              console.log('✅ Loading emergency contacts from cache for:', newDestination);
              setEmergencyData(JSON.parse(cachedData));
              setEmergencyError(null);
              
              // Check if cache is older than 24 hours
              const cacheAge = cachedTimestamp ? Date.now() - parseInt(cachedTimestamp) : Infinity;
              const isCacheStale = cacheAge > 24 * 60 * 60 * 1000; // 24 hours
              
              // Only fetch if destination changed OR cache is stale AND we're online
              if ((destinationChanged || isCacheStale) && !isOffline) {
                console.log('🔄 Cache is stale or destination changed, refreshing in background...');
                // Fetch in background to update cache, but don't block UI
                fetchEmergencyContacts(newDestination, true);
              }
            } else if (!isOffline) {
              // No cache available, fetch new data
              console.log('📡 No cache found, fetching emergency contacts for:', newDestination);
              await fetchEmergencyContacts(newDestination);
            } else {
              // Offline and no cache
              setEmergencyError('Emergency contacts not available offline. Connect to internet to load.');
            }
          }
        } else {
          // setFinalizedPlan(null); // Not needed currently
          setLatestPlanName(null);
          setCurrentDestination(null);
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
  
  const fetchEmergencyContacts = async (destination: string, isBackgroundRefresh: boolean = false) => {
    if (!selectedGroupId) return;
    
    console.log('fetchEmergencyContacts called with destination:', destination, 'background:', isBackgroundRefresh);
    
    // Only show loading state if it's not a background refresh
    if (!isBackgroundRefresh) {
    setLoadingEmergency(true);
    setEmergencyError(null);
    }
    
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

      // Cache in localStorage by destination with timestamp
      localStorage.setItem(`emergency_contacts_cached_${destination}`, JSON.stringify(emergencyData));
      localStorage.setItem(`emergency_contacts_timestamp_${destination}`, Date.now().toString());
      
      if (isBackgroundRefresh) {
        console.log(`✅ Background refresh completed for ${destination}`);
      } else {
        console.log(`✅ Generated emergency contacts for ${destination}`);
      }
    } catch (e) {
      console.error('Error generating emergency contacts:', e);
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      
      // Only show error if it's not a background refresh
      if (!isBackgroundRefresh) {
      setEmergencyError(`Unable to generate emergency contacts for ${destination}. ${errorMessage} Showing general numbers.`);
      
      // Try to load from cache first
      const cachedData = destination
        ? localStorage.getItem(`emergency_contacts_cached_${destination}`)
        : null;
      if (cachedData) {
        setEmergencyData(JSON.parse(cachedData));
        }
      } else {
        console.log(`Background refresh failed, keeping cached data for ${destination}`);
      }
    } finally {
      if (!isBackgroundRefresh) {
      setLoadingEmergency(false);
      }
    }
  };
  
  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    localStorage.setItem('selectedGroupId', groupId);
    // const group = groups.find(g => g.id === groupId);
    // setSelectedGroup(group || null); // Not needed currently
  };

  
  // Function to send periodic location updates
  // Function to trigger location update (called by interval and on restore)
  const triggerLocationUpdate = useCallback(() => {
    console.log('🔔 triggerLocationUpdate called!');
    
    // Get current values from localStorage since state might not be updated
    const savedSession = localStorage.getItem('activeSosSession');
    if (!savedSession) {
      console.log('⚠️ No active session found in localStorage');
      return;
    }
    
    const sessionData = JSON.parse(savedSession);
    const updateNumber = (sessionData.locationUpdateCount || 0) + 1;
    
    console.log(`📍 Triggering location update #${updateNumber}...`);
    console.log('📋 Session data:', sessionData);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        setLocation(currentLocation);
        const timestamp = new Date().toISOString();
        setLocationUpdateCount(updateNumber);
        
        // Update localStorage with latest location, count, and time
        sessionData.lastLocation = currentLocation;
        sessionData.locationUpdateCount = updateNumber;
        sessionData.lastUpdateTime = timestamp;
        localStorage.setItem('activeSosSession', JSON.stringify(sessionData));
        
        try {
          // Send location update to group chat
          if (selectedGroupId && user) {
            await sendLocationUpdate(
              selectedGroupId,
              user.uid,
              user.displayName || user.email || 'Unknown User',
              {
                location: currentLocation,
                timestamp: timestamp,
                updateNumber: updateNumber,
              }
            );
            console.log(`✅ Location update #${updateNumber} sent to group`);
          }
          
          // Send SMS location update to emergency contact
          const contacts = sessionData.emergencyContacts || [];
          if (contacts.length > 0) {
            await sendLocationUpdateSMS({
              userName: user?.displayName || user?.email || 'User',
              location: currentLocation,
              timestamp: timestamp,
              updateNumber: updateNumber,
              emergencyContacts: contacts,
            });
            console.log(`✅ SMS location update #${updateNumber} sent`);
          }
        } catch (error) {
          console.error('Error sending location update:', error);
        }
      },
      (error) => {
        console.error('Location update error:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [user, selectedGroupId]);

  // Legacy function for backward compatibility
  const sendPeriodicLocationUpdate = useCallback(() => {
    triggerLocationUpdate();
  }, [triggerLocationUpdate]);

  // Cancel SOS and stop location updates
  const cancelSOS = useCallback(async () => {
    // Clear intervals
    if (locationUpdateIntervalRef.current) {
      clearInterval(locationUpdateIntervalRef.current);
      locationUpdateIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (ackPollingIntervalRef.current) {
      clearInterval(ackPollingIntervalRef.current);
      ackPollingIntervalRef.current = null;
    }
    
    // Cancel session on backend
    if (sosSession?.id) {
      await cancelSOSSession(sosSession.id);
    }
    
    // Clear localStorage
    localStorage.removeItem('activeSosSession');
    console.log('🗑️ SOS session cleared from localStorage');
    
    // Reset states
    setSosActivated(false);
    setSosStartTime(null);
    setLocationUpdateCount(0);
    setNextUpdateIn(0);
    setSosSession(null);
    setAcknowledgements([]);
    
    console.log('🛑 SOS cancelled, location updates stopped');
    alert('✅ SOS Cancelled\n\nLocation updates have been stopped.');
  }, [sosSession]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (ackPollingIntervalRef.current) {
        clearInterval(ackPollingIntervalRef.current);
      }
    };
  }, []);

  // Restore SOS session from localStorage on mount
  useEffect(() => {
    const restoreSOSSession = async () => {
      const savedSession = localStorage.getItem('activeSosSession');
      if (!savedSession) return;

      try {
        setIsRestoringSession(true);
        const sessionData = JSON.parse(savedSession);
        
        // Check if session is still active (not older than 1 hour)
        const sessionAge = Date.now() - new Date(sessionData.startedAt).getTime();
        const ONE_HOUR = 60 * 60 * 1000;
        
        if (sessionAge > ONE_HOUR) {
          // Session expired, clear it
          localStorage.removeItem('activeSosSession');
          console.log('🕐 SOS session expired, cleared');
          return;
        }

        // Verify session is still active on server
        const serverSession = await getSOSSession(sessionData.id);
        if (!serverSession || serverSession.status !== 'active') {
          localStorage.removeItem('activeSosSession');
          console.log('🛑 SOS session no longer active on server');
          return;
        }

        console.log('🔄 Restoring SOS session:', sessionData.id);
        
        // Restore states
        setSosActivated(true);
        setSosSession(serverSession);
        setSosStartTime(new Date(sessionData.startedAt));
        setLocationUpdateCount(sessionData.locationUpdateCount || 0);
        
        // Restore location if available
        if (sessionData.lastLocation) {
          setLocation(sessionData.lastLocation);
        }

        // Restore acknowledgements
        const acks = await getAcknowledgements(sessionData.id);
        setAcknowledgements(acks);

        // Clear any existing intervals first
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        if (locationUpdateIntervalRef.current) {
          clearInterval(locationUpdateIntervalRef.current);
          locationUpdateIntervalRef.current = null;
        }
        
        // Calculate remaining time until next update
        const lastUpdateTime = sessionData.lastUpdateTime ? new Date(sessionData.lastUpdateTime).getTime() : new Date(sessionData.startedAt).getTime();
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const remainingTime = Math.max(0, LOCATION_UPDATE_INTERVAL - timeSinceLastUpdate);
        let countdown = Math.ceil(remainingTime / 1000);
        
        // If time has passed, set to full interval
        if (countdown <= 0) {
          countdown = LOCATION_UPDATE_INTERVAL / 1000;
        }
        
        setNextUpdateIn(countdown);
        console.log(`🔄 Restored timer: ${countdown} seconds until next update`);
        
        // Restart countdown timer
        countdownIntervalRef.current = setInterval(() => {
          countdown = countdown - 1;
          if (countdown <= 0) {
            countdown = LOCATION_UPDATE_INTERVAL / 1000;
            // Trigger location update when countdown reaches 0
            triggerLocationUpdate();
          }
          setNextUpdateIn(countdown);
        }, 1000);

        // Restart acknowledgement polling
        startAcknowledgementPolling(sessionData.id);

        console.log('✅ SOS session restored successfully');
      } catch (error) {
        console.error('Error restoring SOS session:', error);
        localStorage.removeItem('activeSosSession');
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSOSSession();
  }, []); // Run only on mount

  // Poll for acknowledgements when SOS is active
  const startAcknowledgementPolling = useCallback((sessionId: string) => {
    // Clear existing interval if any
    if (ackPollingIntervalRef.current) {
      clearInterval(ackPollingIntervalRef.current);
    }
    
    // Poll every 10 seconds for acknowledgements
    ackPollingIntervalRef.current = setInterval(async () => {
      try {
        const acks = await getAcknowledgements(sessionId);
        setAcknowledgements(prevAcks => {
          if (acks.length > prevAcks.length) {
            // Play notification sound for new acknowledgements
            const latestAck = acks[acks.length - 1];
            const { text } = getResponseTypeDisplay(latestAck.responseType);
            console.log(`🔔 New acknowledgement: ${latestAck.contactName} - ${text}`);
          }
          return acks;
        });
      } catch (error) {
        console.error('Error polling acknowledgements:', error);
      }
    }, 10000);
    
    // Also fetch immediately
    getAcknowledgements(sessionId).then(acks => {
      setAcknowledgements(acks);
    }).catch(console.error);
  }, []);

  const activateSOS = async () => {
    if (sosActivated) return;
    
    if (!user) {
      alert('Please sign in to use SOS feature');
      return;
    }

    if (!selectedGroupId) {
      alert('Please select a group to send SOS alert');
      return;
    }
    
    setSosActivated(true);
    setSosStartTime(new Date());
    setLocationUpdateCount(0);
    setNextUpdateIn(LOCATION_UPDATE_INTERVAL / 1000);
    
    // Step 1: Get current GPS location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const currentLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          setLocation(currentLocation);
          setLocationError(null);
          
          const timestamp = new Date().toISOString();
          
          try {
            // Step 2: Send SOS alert to group chat (WebApp)
            console.log('📱 Sending SOS alert to group chat...');
            await sendSOSAlert(
              selectedGroupId,
              user.uid,
              user.displayName || user.email || 'Unknown User',
              {
                location: currentLocation,
                timestamp: timestamp,
              }
            );
            console.log('✅ SOS alert sent to group chat');
            
            // Step 3: Send SMS to emergency contacts and create session
            const emergencyContacts = medicalProfile?.emergencyContactPhone && medicalProfile?.emergencyContactName
              ? [{
                  name: medicalProfile.emergencyContactName,
                  phone: medicalProfile.emergencyContactPhone,
                }]
              : [];

            if (emergencyContacts.length > 0) {
              console.log('📞 Sending emergency SMS...');
              
              await sendCompleteSOSAlert({
                userName: user.displayName || user.email || 'Unknown User',
                location: currentLocation,
                timestamp: timestamp,
                emergencyContacts: emergencyContacts,
              });
              
              console.log('✅ Emergency SMS sent');
            }
            
            // Step 4: Create SOS session for acknowledgement tracking
            try {
              console.log('📝 Creating SOS session for acknowledgement tracking...');
              const session = await createSOSSession(
                user.uid,
                user.displayName || user.email || 'Unknown User',
                selectedGroupId,
                currentLocation,
                emergencyContacts
              );
              setSosSession(session);
              setAcknowledgements([]);
              
              // Save session to localStorage for persistence across page refresh
              const sessionToStore = {
                id: session.id,
                startedAt: new Date().toISOString(),
                lastLocation: currentLocation,
                locationUpdateCount: 0,
                lastUpdateTime: new Date().toISOString(),
                emergencyContacts: emergencyContacts,
              };
              localStorage.setItem('activeSosSession', JSON.stringify(sessionToStore));
              console.log('💾 SOS session saved to localStorage');
              
              // Start polling for acknowledgements
              startAcknowledgementPolling(session.id);
              console.log('✅ SOS session created:', session.id);
            } catch (sessionError) {
              console.error('Failed to create SOS session (non-critical):', sessionError);
            }

            if (emergencyContacts.length > 0) {
              alert('🆘 SOS Alert Sent!\n\n✅ Group members notified\n✅ Emergency SMS sent to ' + medicalProfile?.emergencyContactName + '\n\n📍 Location updates every 3 minutes\n💬 Waiting for acknowledgements...\n🛑 Press "Cancel SOS" to stop');
            } else {
              console.warn('No emergency contact configured');
              alert('🆘 SOS Alert Sent to Group!\n\n⚠️ No emergency contact configured.\n\n📍 Location updates every 3 minutes to group.\n🛑 Press "Cancel SOS" to stop');
            }
            
            // Clear any existing intervals first (important for React StrictMode)
            if (locationUpdateIntervalRef.current) {
              clearInterval(locationUpdateIntervalRef.current);
              locationUpdateIntervalRef.current = null;
            }
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            
            // Step 5: Start countdown timer that triggers location updates
            console.log('⏰ Starting automatic location updates every 3 minutes...');
            let countdown = LOCATION_UPDATE_INTERVAL / 1000;
            setNextUpdateIn(countdown);
            
            // Single interval that handles both countdown AND triggers updates
            countdownIntervalRef.current = setInterval(() => {
              countdown = countdown - 1;
              if (countdown <= 0) {
                // Time to send update!
                console.log('📍 Countdown reached 0, sending location update...');
                triggerLocationUpdate();
                countdown = LOCATION_UPDATE_INTERVAL / 1000;
              }
              setNextUpdateIn(countdown);
            }, 1000);
            
          } catch (error) {
            console.error('Error sending SOS alert:', error);
            alert('Failed to send SOS alert. Please call emergency services directly.');
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          setLocationError('Unable to get your location. Please enable location services.');
          
          // Still try to send alert without exact location
          if (selectedGroupId && user) {
            const timestamp = new Date().toISOString();
            sendSOSAlert(
              selectedGroupId,
              user.uid,
              user.displayName || user.email || 'Unknown User',
              {
                location: { lat: 0, lng: 0 }, // No location available
                timestamp: timestamp,
              }
            ).catch(err => console.error('Failed to send SOS without location:', err));
            
            alert('⚠️ SOS sent without location. Enable GPS for better emergency response.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } else {
      setLocationError('Geolocation is not supported by this browser.');
      alert('Geolocation not supported. Please call emergency services directly.');
    }
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
            <div className="glass-card p-4 sm:p-6">
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
              
              {isRestoringSession ? (
                <div className="space-y-4">
                  <div className="w-32 h-32 bg-yellow-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <RefreshCw className="h-16 w-16 text-white animate-spin" />
                  </div>
                  <div className="text-yellow-500 font-bold text-lg">Restoring Session...</div>
                  <div className="text-sm text-secondary">
                    Checking for active SOS alert
                  </div>
                </div>
              ) : sosActivated ? (
                <div className="space-y-4">
                  <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <AlertTriangle className="h-16 w-16 text-white" />
                  </div>
                  <div className="text-red-600 font-bold text-lg">SOS ACTIVATED</div>
                  <div className="text-sm text-secondary">
                    Emergency services and contacts have been notified
                  </div>
                  
                  {/* Auto Location Update Status */}
                  <div className="glass-card border border-orange-500/30 bg-orange-500/10 p-4 rounded-xl">
                    <div className="flex items-center justify-center text-orange-400 mb-2">
                      <Clock className="h-4 w-4 mr-2" />
                      <span className="font-semibold">Auto Location Updates Active</span>
                    </div>
                    <div className="text-xs text-orange-300 space-y-1">
                      {sosStartTime && (
                        <div>Started: {sosStartTime.toLocaleTimeString()}</div>
                      )}
                      <div>Updates sent: {locationUpdateCount}</div>
                      <div>Next update in: {Math.floor(nextUpdateIn / 60)}:{(nextUpdateIn % 60).toString().padStart(2, '0')}</div>
                    </div>
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
                  
                  {/* Contact Acknowledgements */}
                  <div className="glass-card border border-blue-500/30 bg-blue-500/5 p-4 rounded-xl">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center text-blue-400">
                        <Users className="h-4 w-4 mr-2" />
                        <span className="font-semibold text-sm">Contact Responses</span>
                      </div>
                      {medicalProfile?.emergencyContactName && (
                        <span className="text-xs text-secondary">
                          Waiting for: {medicalProfile.emergencyContactName}
                        </span>
                      )}
                    </div>
                    
                    {acknowledgements.length > 0 ? (
                      <div className="space-y-2">
                        {acknowledgements.map((ack) => {
                          const { text, emoji, color } = getResponseTypeDisplay(ack.responseType);
                          return (
                            <div 
                              key={ack.id}
                              className="flex items-center justify-between p-3 glass-card rounded-lg border border-green-500/30 bg-green-500/10"
                            >
                              <div className="flex items-center">
                                <span className="text-xl mr-2">{emoji}</span>
                                <div>
                                  <div className={`font-semibold ${color}`}>
                                    {ack.contactName}
                                  </div>
                                  <div className="text-xs text-secondary">
                                    {text}
                                    {ack.responseMessage && ack.responseType === 'other' && (
                                      <span className="ml-1">: "{ack.responseMessage}"</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-xs text-secondary">
                                {formatAckTime(ack.acknowledgedAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-3">
                        <div className="text-xs text-secondary animate-pulse">
                          📱 Waiting for responses...
                        </div>
                        <div className="text-xs text-muted mt-1">
                          Contact can reply: SAFE, ON MY WAY, OK
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Cancel SOS Button */}
                  <button
                    onClick={cancelSOS}
                    className="mt-4 w-full flex items-center justify-center p-4 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all duration-300"
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Cancel SOS</span>
                  </button>
                  <div className="text-xs text-secondary mt-2">
                    Press to stop location updates
                  </div>
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
            <div className="glass-card p-4 sm:p-6">
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

            {/* Consolidated Emergency Contacts */}
            <div className="glass-card p-4 sm:p-6">
              <div className="mb-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-primary mb-2">
                      Emergency Contacts
              </h3>
                    {currentDestination && (
                      <p className="text-sm text-secondary">
                        📍 {currentDestination}
                        {latestPlanName && <span className="ml-2">• {latestPlanName}</span>}
                      </p>
              )}
                  </div>
                  {currentDestination && !isOffline && (
                    <button
                      onClick={() => fetchEmergencyContacts(currentDestination, false)}
                      disabled={loadingEmergency}
                      className="flex items-center gap-2 px-3 py-2 glass-card hover:bg-white/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Refresh emergency contacts"
                    >
                      <RefreshCw className={`h-4 w-4 text-primary ${loadingEmergency ? 'animate-spin' : ''}`} />
                      <span className="text-sm text-primary">Refresh</span>
                    </button>
                  )}
                    </div>
                  </div>
                  
              {loadingEmergency && (
                <div className="text-secondary text-sm mb-4 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Fetching emergency contacts...
                    </div>
                  )}
                  
              {/* Cache info */}
              {emergencyData && currentDestination && !loadingEmergency && (
                <div className="text-xs text-secondary mb-4 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400"></span>
                  <span>
                    {(() => {
                      const timestamp = localStorage.getItem(`emergency_contacts_timestamp_${currentDestination}`);
                      if (timestamp) {
                        const age = Date.now() - parseInt(timestamp);
                        const hours = Math.floor(age / (1000 * 60 * 60));
                        const minutes = Math.floor((age % (1000 * 60 * 60)) / (1000 * 60));
                        
                        if (hours > 0) {
                          return `Last updated ${hours} hour${hours > 1 ? 's' : ''} ago`;
                        } else if (minutes > 0) {
                          return `Last updated ${minutes} minute${minutes > 1 ? 's' : ''} ago`;
                        } else {
                          return 'Just updated';
                        }
                      }
                      return 'Emergency contacts loaded';
                    })()}
                  </span>
                </div>
              )}
              
              {emergencyError && !emergencyData && (
                <div className="text-sm text-yellow-400 mb-4 p-3 glass-card border border-yellow-500/30">
                  ℹ️ {emergencyError}
                    </div>
              )}

              {/* Main Emergency Numbers */}
              <div className="space-y-3 mb-6">
                <h4 className="text-lg font-semibold text-primary mb-3">🚨 Emergency Hotlines</h4>
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
                        className="flex items-center justify-between p-4 glass-card hover:bg-white/10 transition-all duration-300 rounded-xl"
                      >
                        <div className="flex flex-col flex-1">
                          <span className="font-semibold text-primary text-base">{label}</span>
                          {note && (
                            <span className="text-xs text-secondary mt-1">{note}</span>
                          )}
                        </div>
                        <a
                          href={`tel:${number}`}
                          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 flex items-center ml-4"
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          {formatPhoneNumber(number)}
                        </a>
                      </div>
                    );
                  })
                ) : (
                  <>
                    {EMERGENCY_NUMBERS.map((service, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 glass-card hover:bg-white/10 transition-all duration-300 rounded-xl"
                      >
                        <div className="flex items-center flex-1">
                          <span className="text-2xl mr-3">{service.icon}</span>
                          <span className="font-semibold text-primary text-base">{service.name}</span>
                  </div>
                        <a
                          href={`tel:${service.number}`}
                          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 flex items-center ml-4"
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          {service.number}
                        </a>
                      </div>
                    ))}
                  </>
                )}
              </div>
              
              {/* Nearby Hospitals */}
              {emergencyData?.local?.nearestHospitals && emergencyData.local.nearestHospitals.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-primary mb-3 flex items-center">
                    <Heart className="h-5 w-5 mr-2 text-red-400" />
                    Nearby Hospitals
                  </h4>
                  <div className="space-y-3">
                    {emergencyData.local.nearestHospitals.map((hospital, idx) => (
                      <div key={idx} className="p-4 glass-card rounded-xl hover:bg-white/10 transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-primary text-base">{hospital.name}</div>
                            {hospital.address && (
                              <div className="text-xs text-secondary mt-1 flex items-start">
                                <MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                                {hospital.address}
            </div>
                            )}
                            {hospital.open24x7 && (
                              <span className="inline-block mt-2 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                                24/7 Open
                              </span>
                            )}
                          </div>
                          {hospital.phone && (
                            <a
                              href={`tel:${hospital.phone}`}
                              className="ml-4 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-xl transition-all duration-300 flex items-center"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Nearby Police Stations */}
              {emergencyData?.local?.nearestPoliceStations && emergencyData.local.nearestPoliceStations.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-lg font-semibold text-primary mb-3 flex items-center">
                    <Shield className="h-5 w-5 mr-2 text-blue-400" />
                    Nearby Police Stations
                  </h4>
                  <div className="space-y-3">
                    {emergencyData.local.nearestPoliceStations.map((station, idx) => (
                      <div key={idx} className="p-4 glass-card rounded-xl hover:bg-white/10 transition-all">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-primary text-base">{station.name}</div>
                            {station.address && (
                              <div className="text-xs text-secondary mt-1 flex items-start">
                                <MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                                {station.address}
                              </div>
                            )}
                          </div>
                          {station.phone && (
                            <a
                              href={`tel:${station.phone}`}
                              className="ml-4 bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-xl transition-all duration-300 flex items-center"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Safety Tips */}
              {emergencyData?.tips && emergencyData.tips.length > 0 && (
                <div className="border-t border-white/20 pt-4">
                  <h4 className="text-lg font-semibold text-primary mb-3">💡 Safety Tips</h4>
                  <ul className="space-y-2 text-sm text-secondary">
                    {emergencyData.tips.map((tip, i) => (
                      <li key={i} className="flex items-start">
                        <span className="text-green-400 mr-2">✓</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

          </div>

          {/* Right Column */}
          <div className="space-y-6">

            {/* Medical Info */}
            <div className="glass-card p-4 sm:p-6">
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
            <div className="glass-card p-4 sm:p-6">
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