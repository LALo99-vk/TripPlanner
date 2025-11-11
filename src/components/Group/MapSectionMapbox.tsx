import React, { useEffect, useState, useRef, useCallback } from 'react';
import Map, { Marker, Popup, Source, Layer, NavigationControl, FullscreenControl, MapRef } from 'react-map-gl';
import type { ViewState } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
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

// Mapbox access token - Get your free token from https://account.mapbox.com/
// Add it to your .env file as VITE_MAPBOX_ACCESS_TOKEN=your_token_here
const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

// Default center (Delhi, India)
const defaultCenter = {
  longitude: 77.2090,
  latitude: 28.6139,
};

const MapSection: React.FC<MapSectionProps> = ({ groupId, leaderId }) => {
  const { user } = useAuth();
  const mapRef = useRef<MapRef>(null);

  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [meetups, setMeetups] = useState<MeetupPoint[]>([]);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [viewState, setViewState] = useState<ViewState>({
    longitude: defaultCenter.longitude,
    latitude: defaultCenter.latitude,
    zoom: 15,
    pitch: 45, // 3D tilt
    bearing: 0, // rotation
  });
  const [showMeetupModal, setShowMeetupModal] = useState(false);
  const [meetupName, setMeetupName] = useState('');
  const [clickedPosition, setClickedPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedMeetup, setSelectedMeetup] = useState<MeetupPoint | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<MemberLocation | null>(null);
  const [route, setRoute] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
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
        setViewState((prev) => ({
          ...prev,
          longitude: pos.lng,
          latitude: pos.lat,
        }));
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
  const handleMapClick = useCallback((event: any) => {
    if (event.lngLat) {
      setClickedPosition({
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
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

  // Calculate route to meetup (using Mapbox Directions API)
  const calculateRoute = useCallback(async (meetup: MeetupPoint) => {
    if (!currentPosition || !MAPBOX_ACCESS_TOKEN) {
      setError('Unable to calculate route. Location services may not be available.');
      return;
    }

    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentPosition.lng},${currentPosition.lat};${meetup.lng},${meetup.lat}?geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const routeData: GeoJSON.Feature<GeoJSON.LineString> = {
          type: 'Feature',
          geometry: data.routes[0].geometry,
          properties: {},
        };
        setRoute(routeData);
        setSelectedMeetup(meetup);
      } else {
        setError('Unable to calculate route');
      }
    } catch (err) {
      console.error('Error calculating route:', err);
      setError('Failed to calculate route');
    }
  }, [currentPosition]);

  // Resolve alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      await resolveAlert(alertId);
    } catch (err) {
      console.error('Error resolving alert:', err);
    }
  };

  // Go to my location
  const goToMyLocation = () => {
    if (currentPosition && mapRef.current) {
      setViewState((prev) => ({
        ...prev,
        longitude: currentPosition.lng,
        latitude: currentPosition.lat,
        zoom: 15,
      }));
    }
  };

  if (!MAPBOX_ACCESS_TOKEN) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-primary mb-2">Mapbox Access Token Required</p>
        <p className="text-sm text-muted">
          Please add VITE_MAPBOX_ACCESS_TOKEN to your .env file.
          <br />
          Get your free token from{' '}
          <a
            href="https://account.mapbox.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 underline"
          >
            Mapbox Account
          </a>
          <br />
          <span className="text-xs text-muted mt-2 block">
            Free tier: 50,000 map loads/month - No credit card required!
          </span>
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
      <div className="relative rounded-lg overflow-hidden border border-white/10" style={{ height: '600px' }}>
        <Map
          {...viewState}
          onMove={(evt) => setViewState(evt.viewState)}
          mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          onClick={handleMapClick}
          ref={mapRef}
        >
          <NavigationControl position="top-left" />
          <FullscreenControl position="top-left" />

          {/* Member location markers */}
          {locations.map((location) => (
            <Marker
              key={location.id}
              longitude={location.lng}
              latitude={location.lat}
              anchor="center"
            >
              <div
                className="w-8 h-8 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center cursor-pointer shadow-lg"
                onClick={() => setSelectedLocation(location)}
                style={{ transform: 'translate(-50%, -50%)' }}
              >
                <span className="text-white text-xs font-bold">
                  {location.userName.charAt(0).toUpperCase()}
                </span>
              </div>
            </Marker>
          ))}

          {/* Meetup markers */}
          {meetups.map((meetup) => (
            <Marker
              key={meetup.id}
              longitude={meetup.lng}
              latitude={meetup.lat}
              anchor="center"
            >
              <div
                className="w-6 h-6 bg-green-500 border-2 border-white rounded-sm cursor-pointer shadow-lg flex items-center justify-center"
                onClick={() => setSelectedMeetup(meetup)}
                style={{ transform: 'translate(-50%, -50%) rotate(-45deg)' }}
              >
                <MapPin className="h-4 w-4 text-white" style={{ transform: 'rotate(45deg)' }} />
              </div>
            </Marker>
          ))}

          {/* Alert markers */}
          {alerts.map((alert) => (
            <Marker
              key={alert.id}
              longitude={alert.lng}
              latitude={alert.lat}
              anchor="center"
            >
              <div
                className="w-12 h-12 rounded-full bg-red-600 border-3 border-white cursor-pointer shadow-lg animate-pulse"
                style={{ transform: 'translate(-50%, -50%)' }}
              >
                <AlertTriangle className="h-6 w-6 text-white m-auto mt-2.5" />
              </div>
            </Marker>
          ))}

          {/* Route line */}
          {route && (
            <Source id="route" type="geojson" data={route}>
              <Layer
                id="route"
                type="line"
                layout={{
                  'line-join': 'round',
                  'line-cap': 'round',
                }}
                paint={{
                  'line-color': '#3b82f6',
                  'line-width': 4,
                  'line-opacity': 0.75,
                }}
              />
            </Source>
          )}

          {/* Popups */}
          {selectedLocation && (
            <Popup
              longitude={selectedLocation.lng}
              latitude={selectedLocation.lat}
              anchor="bottom"
              onClose={() => setSelectedLocation(null)}
              closeButton={true}
              closeOnClick={false}
            >
              <div className="p-2">
                <p className="font-semibold text-primary">{selectedLocation.userName}</p>
                <p className="text-xs text-muted">
                  Last updated: {new Date(selectedLocation.lastUpdated).toLocaleTimeString()}
                </p>
              </div>
            </Popup>
          )}

          {selectedMeetup && (
            <Popup
              longitude={selectedMeetup.lng}
              latitude={selectedMeetup.lat}
              anchor="bottom"
              onClose={() => setSelectedMeetup(null)}
              closeButton={true}
              closeOnClick={false}
            >
              <div className="p-2">
                <p className="font-semibold text-primary">{selectedMeetup.name}</p>
                <p className="text-xs text-muted">Added by {selectedMeetup.addedByName}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => calculateRoute(selectedMeetup)}
                    className="text-xs premium-button-primary px-2 py-1"
                  >
                    Get Route
                  </button>
                  {(user?.uid === selectedMeetup.addedBy || user?.uid === leaderId) && (
                    <button
                      onClick={() => handleDeleteMeetup(selectedMeetup.id)}
                      className="text-xs premium-button-secondary px-2 py-1"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          )}
        </Map>
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
          onClick={goToMyLocation}
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

