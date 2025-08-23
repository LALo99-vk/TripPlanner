import React, { useState, useEffect } from 'react';
import { Plus, MapPin, Calendar, Users, ArrowRight, Share2 } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

interface Trip {
  id: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: string[];
  createdBy: string;
  createdAt: any;
}

interface TripDashboardProps {
  onTripSelect: (tripId: string) => void;
  onShareExperience: (tripId: string) => void;
}

const TripDashboard: React.FC<TripDashboardProps> = ({ onTripSelect, onShareExperience }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [newTrip, setNewTrip] = useState({
    tripName: '',
    destination: '',
    startDate: '',
    endDate: ''
  });

  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Listen to trips where user is a member
    const tripsQuery = query(
      collection(db, 'trips'),
      where('members', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(tripsQuery, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trip[];
      
      setTrips(tripsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const createTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setCreateLoading(true);
    try {
      await addDoc(collection(db, 'trips'), {
        tripName: newTrip.tripName,
        destination: newTrip.destination,
        startDate: newTrip.startDate,
        endDate: newTrip.endDate,
        members: [user.uid],
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });

      setNewTrip({ tripName: '', destination: '', startDate: '', endDate: '' });
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error creating trip:', error);
      alert('Failed to create trip. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const isPastTrip = (endDate: string) => {
    return new Date(endDate) < new Date();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your trips...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Trips</h1>
            <p className="text-gray-600 mt-1">Plan and collaborate on amazing journeys</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create New Trip
          </button>
        </div>

        {/* Trips Grid */}
        {trips.length === 0 ? (
          <div className="text-center py-16">
            <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No trips yet</h3>
            <p className="text-gray-600 mb-6">Create your first trip to start planning with friends</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
            >
              Create Your First Trip
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div 
                  onClick={() => onTripSelect(trip.id)}
                  className="cursor-pointer mb-4"
                >
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{trip.tripName}</h3>
                    <div className="flex items-center text-gray-600 mb-2">
                      <MapPin className="h-4 w-4 mr-1" />
                      <span className="text-sm">{trip.destination}</span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span className="text-sm">
                        {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center text-gray-600">
                    <Users className="h-4 w-4 mr-1" />
                    <span className="text-sm">{trip.members.length} members</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isPastTrip(trip.endDate) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onShareExperience(trip.id);
                        }}
                        className="bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-semibold hover:bg-green-600 transition-colors flex items-center"
                      >
                        <Share2 className="h-3 w-3 mr-1" />
                        Share Experience
                      </button>
                    )}
                    <button
                      onClick={() => onTripSelect(trip.id)}
                      className="text-orange-500 font-semibold text-sm hover:text-orange-600 flex items-center"
                    >
                      View Details
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Trip Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Trip</h2>
              
              <form onSubmit={createTrip} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Trip Name</label>
                  <input
                    type="text"
                    value={newTrip.tripName}
                    onChange={(e) => setNewTrip(prev => ({ ...prev, tripName: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., Goa Beach Adventure"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Destination</label>
                  <input
                    type="text"
                    value={newTrip.destination}
                    onChange={(e) => setNewTrip(prev => ({ ...prev, destination: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., Goa, India"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={newTrip.startDate}
                      onChange={(e) => setNewTrip(prev => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                    <input
                      type="date"
                      value={newTrip.endDate}
                      onChange={(e) => setNewTrip(prev => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLoading}
                    className="flex-1 bg-orange-500 text-white px-4 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    {createLoading ? 'Creating...' : 'Create Trip'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TripDashboard;