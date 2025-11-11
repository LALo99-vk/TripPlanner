import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LoadScript, GoogleMap, Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { MapPin, AlertTriangle, X, Navigation, Users } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  MemberLocation,
  MeetupPoint,
  EmergencyAlert,
  updateMemberLocation,
  setLocationActive,
  subscribeMemberLocations,
  createMeetup,
  deleteMeetup,
  subscribeMeetups,
  createEmergencyAlert,
  resolveAlert,
  subscribeAlerts,
} from '../../services/mapRepository';

interface MapSectionProps {
  groupId: string;
  leaderId: string;
}

// Google Maps API key - Replace with your own key from https://console.cloud.google.com/
// Add it to your .env file as VITE_GOOGLE_MAPS_API_KEY=your_key_here
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Map container style
const mapContainerStyle = {
  width: '100%',
  height: '600px',
};

const defaultCenter = {
  lat: 28.6139, // Delhi, India default
  lng: 77.2090,
};

// Map options for 3D view
const mapOptions = {
  zoom: 15,
  tilt: 45,
  heading: 0,
  mapTypeControl: true,
  streetViewControl: true,
  fullscreenControl: true,
  zoomControl: true,
};

const MapSection: React.FC<MapSectionProps> = ({ groupId, leaderId }) => {
  const { user } = useAuth();
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);

  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [meetups, setMeetups] = useState<MeetupPoint[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [showMeetupModal, setShowMeetupModal] = useState(false);
  const [meetupName, setMeetupName] = useState('');
  const [clickedPosition, setClickedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedMeetup, setSelectedMeetup] = useState<MeetupPoint | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<MemberLocation | null>(null);
  const [route, setRoute] = useState<google.maps.DirectionsResult | null>(null);
  const [membersOnline, setMembersOnline] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get user's current location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentPosition(pos);
        if (mapRef.current) {
          mapRef.current.setCenter(pos);
        }
      },
      (err) => {
        console.error('Error getting location:', err);
        setError('Unable to get your location');
      }
    );
  }, []);

  // Subscribe to locations
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeMemberLocations(groupId, (locs) => {
      setLocations(locs);
      setMembersOnline(locs.length);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [groupId]);

  // Subscribe to meetups
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeMeetups(groupId, (meetupPoints) => {
      setMeetups(meetupPoints);
    });

    return () => unsubscribe();
  }, [groupId]);

  // Subscribe to alerts
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeAlerts(groupId, (alertList) => {
      setAlerts(alertList);
      
      // Play alert sound for new alerts
      if (alertList.length > 0 && user) {
        const latestAlert = alertList[0];
        if (latestAlert.senderId !== user.uid) {
          // Vibrate if supported
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [groupId, user]);

  // Start/stop location sharing
  const toggleLocationSharing = useCallback(async () => {
    if (!user || !groupId) return;

    if (isSharingLocation) {
      // Stop sharing
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }
      await setLocationActive(groupId, user.uid, false);
      setIsSharingLocation(false);
    } else {
      // Start sharing
      if (!navigator.geolocation) {
        setError('Geolocation is not supported');
        return;
      }

      const id = navigator.geolocation.watchPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          try {
            await updateMemberLocation(
              groupId,
              user.uid,
              user.displayName || 'User',
              lat,
              lng,
              true
            );
            setCurrentPosition({ lat, lng });
          } catch (err) {
            console.error('Error updating location:', err);
          }
        },
        (err) => {
          console.error('Error watching position:', err);
          setError('Error tracking location');
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );

      setWatchId(id);
      setIsSharingLocation(true);
    }
  }, [user, groupId, isSharingLocation, watchId]);

  // Handle map click for meetup
  const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    if (event.latLng) {
      setClickedPosition({
        lat: event.latLng.lat(),
        lng: event.latLng.lng(),
      });
      setShowMeetupModal(true);
    }
  }, []);

  // Create meetup
  const handleCreateMeetup = async () => {
    if (!user || !clickedPosition || !meetupName.trim()) return;

    try {
      await createMeetup(
        groupId,
        user.uid,
        user.displayName || 'User',
        meetupName.trim(),
        clickedPosition.lat,
        clickedPosition.lng
      );
      setShowMeetupModal(false);
      setMeetupName('');
      setClickedPosition(null);
    } catch (err) {
      console.error('Error creating meetup:', err);
      setError('Failed to create meetup');
    }
  };

  // Delete meetup
  const handleDeleteMeetup = async (meetupId: string) => {
    try {
      await deleteMeetup(meetupId);
      setSelectedMeetup(null);
    } catch (err) {
      console.error('Error deleting meetup:', err);
    }
  };

  // Create emergency alert
  const handleEmergencyAlert = async () => {
    if (!user || !currentPosition) {
      setError('Location not available');
      return;
    }

    try {
      await createEmergencyAlert(
        groupId,
        user.uid,
        user.displayName || 'User',
        currentPosition.lat,
        currentPosition.lng
      );
      
      // Vibrate
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }
    } catch (err) {
      console.error('Error creating alert:', err);
      setError('Failed to send emergency alert');
    }
  };

  // Calculate route to meetup
  const calculateRoute = useCallback(async (meetup: MeetupPoint) => {
    if (!currentPosition || !directionsServiceRef.current) {
      setError('Unable to calculate route. Location services may not be available.');
      return;
    }

    const directionsService = directionsServiceRef.current;

    directionsService.route(
      {
        origin: { lat: currentPosition.lat, lng: currentPosition.lng },
        destination: { lat: meetup.lat, lng: meetup.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          setRoute(result);
          setSelectedMeetup(meetup);
        } else {
          console.error('Error calculating route:', status);
          setError(`Unable to calculate route: ${status}`);
        }
      }
    );
  }, [currentPosition]);

  // Resolve alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      await resolveAlert(alertId);
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  };

  // Map load handler
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    directionsServiceRef.current = new google.maps.DirectionsService();

    // Set 3D view
    map.setTilt(45);
    map.setHeading(0);
  }, []);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-primary mb-2">Google Maps API Key Required</p>
        <p className="text-sm text-muted">
          Please add VITE_GOOGLE_MAPS_API_KEY to your .env file.
          <br />
          Get your key from{' '}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 underline"
          >
            Google Cloud Console
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Members Online Badge */}
      <div className="absolute top-4 right-4 z-10 glass-card p-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-orange-500" />
        <span className="text-sm text-primary font-medium">
          Members Online: {membersOnline}
        </span>
      </div>

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border border-white/10">
        <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={currentPosition || defaultCenter}
            zoom={mapOptions.zoom}
            onLoad={onMapLoad}
            onClick={handleMapClick}
            options={mapOptions}
          >
            {/* Member location markers */}
            {locations.map((location) => (
              <Marker
                key={location.id}
                position={{ lat: location.lat, lng: location.lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#FF9933',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                }}
                label={{
                  text: location.userName.charAt(0).toUpperCase(),
                  color: '#ffffff',
                  fontSize: '12px',
                }}
                onClick={() => setSelectedLocation(location)}
              >
                {selectedLocation?.id === location.id && (
                  <InfoWindow onCloseClick={() => setSelectedLocation(null)}>
                    <div className="p-2">
                      <p className="font-semibold text-primary">{location.userName}</p>
                      <p className="text-xs text-muted">
                        Last updated: {new Date(location.lastUpdated).toLocaleTimeString()}
                      </p>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            ))}

            {/* Meetup markers */}
            {meetups.map((meetup) => (
              <Marker
                key={meetup.id}
                position={{ lat: meetup.lat, lng: meetup.lng }}
                icon={{
                  path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                  scale: 10,
                  fillColor: '#10B981',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                }}
                onClick={() => setSelectedMeetup(meetup)}
              >
                {selectedMeetup?.id === meetup.id && (
                  <InfoWindow onCloseClick={() => setSelectedMeetup(null)}>
                    <div className="p-2">
                      <p className="font-semibold text-primary">{meetup.name}</p>
                      <p className="text-xs text-muted">Added by {meetup.addedByName}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => calculateRoute(meetup)}
                          className="text-xs premium-button-primary px-2 py-1"
                        >
                          Get Route
                        </button>
                        {(user?.uid === meetup.addedBy || user?.uid === leaderId) && (
                          <button
                            onClick={() => handleDeleteMeetup(meetup.id)}
                            className="text-xs premium-button-secondary px-2 py-1"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            ))}

            {/* Alert markers */}
            {alerts.map((alert) => (
              <Marker
                key={alert.id}
                position={{ lat: alert.lat, lng: alert.lng }}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 12,
                  fillColor: '#EF4444',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                }}
                animation={google.maps.Animation.BOUNCE}
              />
            ))}

            {/* Directions Renderer */}
            {route && <DirectionsRenderer directions={route} />}
          </GoogleMap>
        </LoadScript>
      </div>

      {/* Control Buttons */}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={toggleLocationSharing}
          className={`premium-button-${isSharingLocation ? 'secondary' : 'primary'} flex items-center gap-2`}
        >
          <Navigation className="h-4 w-4" />
          {isSharingLocation ? 'Stop Sharing' : 'Share Location'}
        </button>

        <button
          onClick={() => {
            if (currentPosition && mapRef.current) {
              mapRef.current.setCenter(currentPosition);
              mapRef.current.setZoom(15);
            }
          }}
          className="premium-button-secondary flex items-center gap-2"
          disabled={!currentPosition}
        >
          <MapPin className="h-4 w-4" />
          My Location
        </button>
      </div>

      {/* Emergency Button */}
      <button
        onClick={handleEmergencyAlert}
        className="fixed bottom-6 right-6 z-20 bg-red-600 hover:bg-red-700 text-white p-4 rounded-full shadow-lg flex items-center gap-2 font-semibold transition-transform hover:scale-110"
      >
        <AlertTriangle className="h-5 w-5" />
        Emergency
      </button>

      {/* Meetup Modal */}
      {showMeetupModal && clickedPosition && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-primary">Add Meet-up Point</h3>
              <button
                onClick={() => {
                  setShowMeetupModal(false);
                  setMeetupName('');
                  setClickedPosition(null);
                }}
                className="text-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-secondary mb-2">Name</label>
                <input
                  type="text"
                  className="glass-input w-full px-3 py-2 rounded"
                  value={meetupName}
                  onChange={(e) => setMeetupName(e.target.value)}
                  placeholder="e.g., Meeting Point, Restaurant"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateMeetup}
                  className="flex-1 premium-button-primary"
                  disabled={!meetupName.trim()}
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowMeetupModal(false);
                    setMeetupName('');
                    setClickedPosition(null);
                  }}
                  className="flex-1 premium-button-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Popups */}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="fixed top-20 left-1/2 transform -translate-x-1/2 z-30 glass-card p-4 border-2 border-red-500 max-w-md animate-pulse"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-400">Emergency Alert!</p>
              <p className="text-sm text-primary">{alert.senderName} needs help</p>
              <p className="text-xs text-muted mt-1">
                Location: {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
              </p>
              <button
                onClick={() => handleResolveAlert(alert.id)}
                className="mt-2 text-xs premium-button-secondary"
              >
                Mark as Resolved
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Error Message */}
      {error && (
        <div className="mt-4 glass-card p-4 border border-red-500/20">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs premium-button-secondary"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

export default MapSection;

