import React, { useEffect, useState } from 'react';
import { AlertTriangle, Phone, MapPin, Share, Clock, Shield, Zap } from 'lucide-react';
import { EMERGENCY_NUMBERS } from '../../utils/constants';
import { planStore } from '../../services/planStore';
import { apiService, EmergencyContactsData } from '../../services/api';

const EmergencyPage: React.FC = () => {
  const [sosActivated, setSosActivated] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [latestPlanName, setLatestPlanName] = useState<string | null>(null);
  const [emergencyData, setEmergencyData] = useState<EmergencyContactsData | null>(null);
  const [loadingEmergency, setLoadingEmergency] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  useEffect(() => {
    const plan = planStore.getPlan();
    if (plan) setLatestPlanName(`${plan.overview.to} (${plan.overview.durationDays}D)`);
    // Fetch AI-generated emergency contacts for the destination
    const fetchEmergency = async () => {
      if (!plan?.overview?.to) return;
      setLoadingEmergency(true);
      setEmergencyError(null);
      try {
        const resp = await apiService.getEmergencyContacts({ destination: plan.overview.to });
        setEmergencyData(resp.data);
      } catch (e) {
        setEmergencyError('Unable to fetch emergency contacts at the moment.');
      } finally {
        setLoadingEmergency(false);
      }
    };
    fetchEmergency();
  }, []);

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
        (error) => {
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
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-2">Emergency Assistance</h1>
          {latestPlanName && (
            <div className="text-sm text-secondary">For trip: <span className="text-primary font-semibold">{latestPlanName}</span></div>
          )}
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

                <button className="w-full flex items-center justify-center p-4 glass-card hover:bg-white/10 rounded-xl transition-colors">
                  <Phone className="h-5 w-5 mr-3 text-green-400" />
                  <span className="font-medium text-primary">Call Emergency Contact</span>
                </button>

                <button className="w-full flex items-center justify-center p-4 glass-card hover:bg-white/10 rounded-xl transition-colors">
                  <Zap className="h-5 w-5 mr-3 text-purple-400" />
                  <span className="font-medium text-primary">Send Group Alert</span>
                </button>
              </div>
            </div>

            {/* AI Emergency Contacts */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Emergency Contacts for {latestPlanName || 'Your Trip'}</h3>
              {loadingEmergency && (
                <div className="text-secondary text-sm">Fetching emergency contacts...</div>
              )}
              {emergencyError && (
                <div className="text-sm text-red-400">{emergencyError}</div>
              )}
              {emergencyData && (
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="font-semibold text-primary mb-2">General</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="glass-card p-3">Police: {emergencyData.general.police.number} <span className="text-secondary">• {emergencyData.general.police.note}</span></div>
                      <div className="glass-card p-3">Ambulance: {emergencyData.general.ambulance.number} <span className="text-secondary">• {emergencyData.general.ambulance.note}</span></div>
                      <div className="glass-card p-3">Fire: {emergencyData.general.fire.number} <span className="text-secondary">• {emergencyData.general.fire.note}</span></div>
                      <div className="glass-card p-3">Women Helpline: {emergencyData.general.womenHelpline.number} <span className="text-secondary">• {emergencyData.general.womenHelpline.note}</span></div>
                      <div className="glass-card p-3">Tourist Helpline: {emergencyData.general.touristHelpline.number} <span className="text-secondary">• {emergencyData.general.touristHelpline.note}</span></div>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-primary mb-2">Nearest Hospitals ({emergencyData.local.primaryCity})</div>
                    <div className="space-y-2">
                      {emergencyData.local.nearestHospitals.map((h, idx) => (
                        <div key={idx} className="glass-card p-3">
                          <div className="font-semibold">{h.name}</div>
                          <div className="text-secondary">{h.phone} • {h.address} {h.open24x7 ? '• 24x7' : ''}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-primary mb-2">Nearest Police Stations</div>
                    <div className="space-y-2">
                      {emergencyData.local.nearestPoliceStations.map((p, idx) => (
                        <div key={idx} className="glass-card p-3">
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-secondary">{p.phone} • {p.address}</div>
                        </div>
                      ))}
                    </div>
                  </div>
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

          {/* Emergency Numbers */}
          <div className="space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-6">Emergency Numbers</h3>
              
              <div className="space-y-3">
                {EMERGENCY_NUMBERS.map((service, index) => (
                  <div key={index} className="flex items-center justify-between p-4 glass-card hover:bg-white/10 transition-all duration-300">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{service.icon}</span>
                      <span className="font-semibold text-primary">{service.name}</span>
                    </div>
                    <a
                      href={`tel:${service.number}`}
                      className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-2 rounded-xl font-semibold hover:shadow-lg transition-all duration-300 flex items-center"
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      {formatPhoneNumber(service.number)}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Medical Info */}
            <div className="glass-card p-6">
              <h3 className="text-xl font-bold text-primary mb-4">Medical Information</h3>
              
              <div className="space-y-4">
                <div className="p-4 glass-card">
                  <h4 className="font-semibold text-primary mb-2">Blood Type</h4>
                  <div className="text-secondary">Not specified - <button className="text-blue-400 hover:underline">Add</button></div>
                </div>

                <div className="p-4 glass-card">
                  <h4 className="font-semibold text-primary mb-2">Allergies</h4>
                  <div className="text-secondary">None specified - <button className="text-blue-400 hover:underline">Add</button></div>
                </div>

                <div className="p-4 glass-card">
                  <h4 className="font-semibold text-primary mb-2">Emergency Contact</h4>
                  <div className="text-secondary">Not specified - <button className="text-blue-400 hover:underline">Add</button></div>
                </div>

                <button className="w-full premium-button-primary py-3 px-6 rounded-xl font-semibold">
                  Update Medical Info
                </button>
              </div>
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