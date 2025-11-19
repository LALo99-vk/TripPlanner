import React, { useEffect, useState, useMemo } from 'react';
import {
  Plane,
  Train,
  Building2,
  MapPin,
  Users,
  Calendar,
  Loader2,
  Check,
  Clock,
  Star,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getUserGroups, getGroup, type Group } from '../../services/groupRepository';
import { getFinalizedPlan } from '../../services/planApprovalRepository';
import { upsertGroupBookingSelection } from '../../services/bookingRepository';

// Types
interface FlightOption {
  id: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price: number;
  currency: string;
  origin: string;
  destination: string;
}

interface TrainOption {
  id: string;
  name: string;
  number: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price?: number;
  origin: string;
  destination: string;
}

interface HotelOption {
  id: string;
  name: string;
  location: string;
  rating?: number;
  pricePerNight?: number;
  currency?: string;
  imageUrl?: string;
  bookingSource: 'amadeus' | 'booking';
}

type SortOption = 'cheapest' | 'fastest' | 'morning' | 'evening' | 'top-rated' | 'closest';

interface PlanData {
  sourceLocation: string;
  destination: string;
  travelDate: string;
  travellersCount: number;
  budget: number;
}

const BookingPage: React.FC = () => {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [flights, setFlights] = useState<FlightOption[]>([]);
  const [trains, setTrains] = useState<TrainOption[]>([]);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [loading, setLoading] = useState({
    groups: false,
    plan: false,
    flights: false,
    trains: false,
    hotels: false,
  });
  const [errors, setErrors] = useState({
    flights: '',
    trains: '',
    hotels: '',
  });
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortOptions, setSortOptions] = useState({
    flights: 'cheapest' as SortOption,
    trains: 'cheapest' as SortOption,
    hotels: 'top-rated' as SortOption,
  });
  const [displayLimit, setDisplayLimit] = useState({
    flights: 4,
    trains: 4,
    hotels: 4,
  });

  // Fetch user groups
  useEffect(() => {
    if (!user?.uid) return;

    const loadGroups = async () => {
      setLoading((prev) => ({ ...prev, groups: true }));
      try {
        const userGroups = await getUserGroups(user.uid);
        setGroups(userGroups);
      } catch (error) {
        console.error('Error loading groups:', error);
      } finally {
        setLoading((prev) => ({ ...prev, groups: false }));
      }
    };

    loadGroups();
  }, [user]);

  // Fetch group plan data when group is selected
  useEffect(() => {
    if (!selectedGroupId || !user?.uid) return;

    const loadPlanData = async () => {
      setLoading((prev) => ({ ...prev, plan: true }));
      try {
        const [group, finalizedPlan] = await Promise.all([
          getGroup(selectedGroupId),
          getFinalizedPlan(selectedGroupId),
        ]);

        if (group && finalizedPlan) {
          // Get user's home location from profile (first activity origin or profile)
          const supabase = await import('../../config/supabase').then((m) =>
            m.getAuthenticatedSupabaseClient()
          );
          const { data: userData } = await supabase
            .from('users')
            .select('home_location')
            .eq('id', user.uid)
            .single();

          const sourceLocation = userData?.home_location || group.destination;
          const travellersCount = group.members.length;

          setPlanData({
            sourceLocation,
            destination: finalizedPlan.destination,
            travelDate: finalizedPlan.startDate,
            travellersCount,
            budget: finalizedPlan.totalEstimatedBudget,
          });
        }
      } catch (error) {
        console.error('Error loading plan data:', error);
      } finally {
        setLoading((prev) => ({ ...prev, plan: false }));
      }
    };

    loadPlanData();
  }, [selectedGroupId, user]);

  // Auto-fetch travel options when plan data is available
  useEffect(() => {
    if (!planData) return;

    const fetchTravelOptions = async () => {
      // Fetch flights
      setLoading((prev) => ({ ...prev, flights: true }));
      setErrors((prev) => ({ ...prev, flights: '' }));
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        const response = await fetch(
          `${API_BASE_URL}/flights/search?source=${encodeURIComponent(planData.sourceLocation)}&destination=${encodeURIComponent(planData.destination)}&date=${planData.travelDate}&travellers=${planData.travellersCount}`
        );
        const data = await response.json();
        if (data.success) {
          setFlights(data.data || []);
        } else {
          setErrors((prev) => ({ ...prev, flights: data.message || 'Failed to fetch flights' }));
        }
      } catch (error) {
        console.error('Error fetching flights:', error);
        const errorMessage = error instanceof TypeError && error.message.includes('Failed to fetch')
          ? 'Backend server is not running. Please start the server on port 3001.'
          : 'Failed to fetch flights';
        setErrors((prev) => ({ ...prev, flights: errorMessage }));
      } finally {
        setLoading((prev) => ({ ...prev, flights: false }));
      }

      // Fetch trains
      setLoading((prev) => ({ ...prev, trains: true }));
      setErrors((prev) => ({ ...prev, trains: '' }));
      try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        const response = await fetch(
          `${API_BASE_URL}/trains/search?source=${encodeURIComponent(planData.sourceLocation)}&destination=${encodeURIComponent(planData.destination)}&date=${planData.travelDate}&travellers=${planData.travellersCount}`
        );
        const data = await response.json();
        if (data.success) {
          setTrains(data.data || []);
        } else {
          setErrors((prev) => ({ ...prev, trains: data.message || 'Failed to fetch trains' }));
        }
      } catch (error) {
        console.error('Error fetching trains:', error);
        const errorMessage = error instanceof TypeError && error.message.includes('Failed to fetch')
          ? 'Backend server is not running. Please start the server on port 3001.'
          : 'Failed to fetch trains';
        setErrors((prev) => ({ ...prev, trains: errorMessage }));
      } finally {
        setLoading((prev) => ({ ...prev, trains: false }));
      }

      // Fetch hotels
      setLoading((prev) => ({ ...prev, hotels: true }));
      setErrors((prev) => ({ ...prev, hotels: '' }));
      try {
        const checkOutDate = new Date(planData.travelDate);
        checkOutDate.setDate(checkOutDate.getDate() + 1);
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        const response = await fetch(
          `${API_BASE_URL}/hotels/search?location=${encodeURIComponent(planData.destination)}&checkIn=${planData.travelDate}&checkOut=${checkOutDate.toISOString().split('T')[0]}&travellers=${planData.travellersCount}`
        );
        const data = await response.json();
        if (data.success) {
          setHotels(data.data || []);
        } else {
          setErrors((prev) => ({ ...prev, hotels: data.message || 'Failed to fetch hotels' }));
        }
      } catch (error) {
        console.error('Error fetching hotels:', error);
        const errorMessage = error instanceof TypeError && error.message.includes('Failed to fetch')
          ? 'Backend server is not running. Please start the server on port 3001.'
          : 'Failed to fetch hotels';
        setErrors((prev) => ({ ...prev, hotels: errorMessage }));
      } finally {
        setLoading((prev) => ({ ...prev, hotels: false }));
      }

      setLastUpdated(new Date());
    };

    fetchTravelOptions();
  }, [planData]);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    if (!planData) return;

    const interval = setInterval(() => {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      
      // Re-fetch flights
      fetch(`${API_BASE_URL}/flights/search?source=${encodeURIComponent(planData.sourceLocation)}&destination=${encodeURIComponent(planData.destination)}&date=${planData.travelDate}&travellers=${planData.travellersCount}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setFlights(data.data || []);
        })
        .catch(console.error);

      // Re-fetch trains
      fetch(`${API_BASE_URL}/trains/search?source=${encodeURIComponent(planData.sourceLocation)}&destination=${encodeURIComponent(planData.destination)}&date=${planData.travelDate}&travellers=${planData.travellersCount}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setTrains(data.data || []);
        })
        .catch(console.error);

      // Re-fetch hotels
      const checkOutDate = new Date(planData.travelDate);
      checkOutDate.setDate(checkOutDate.getDate() + 1);
      fetch(`${API_BASE_URL}/hotels/search?location=${encodeURIComponent(planData.destination)}&checkIn=${planData.travelDate}&checkOut=${checkOutDate.toISOString().split('T')[0]}&travellers=${planData.travellersCount}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setHotels(data.data || []);
        })
        .catch(console.error);

      setLastUpdated(new Date());
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, [planData]);

  // Sorted results
  const sortedFlights = useMemo(() => {
    let sorted = [...flights];
    switch (sortOptions.flights) {
      case 'cheapest':
        sorted = sorted.sort((a, b) => a.price - b.price);
        break;
      case 'fastest':
        sorted = sorted.sort((a, b) => {
          const aDuration = parseDuration(a.duration);
          const bDuration = parseDuration(b.duration);
          return aDuration - bDuration;
        });
        break;
      case 'morning':
        sorted = sorted.filter((f) => {
          const hour = parseInt(f.departureTime.split(':')[0]);
          return hour >= 6 && hour < 12;
        });
        break;
      case 'evening':
        sorted = sorted.filter((f) => {
          const hour = parseInt(f.departureTime.split(':')[0]);
          return hour >= 17 && hour < 22;
        });
        break;
      default:
        break;
    }
    return sorted;
  }, [flights, sortOptions.flights]);

  const displayedFlights = useMemo(() => {
    return sortedFlights.slice(0, displayLimit.flights);
  }, [sortedFlights, displayLimit.flights]);

  const sortedTrains = useMemo(() => {
    let sorted = [...trains];
    switch (sortOptions.trains) {
      case 'cheapest':
        sorted = sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'fastest':
        sorted = sorted.sort((a, b) => {
          const aDuration = parseDuration(a.duration);
          const bDuration = parseDuration(b.duration);
          return aDuration - bDuration;
        });
        break;
      default:
        break;
    }
    return sorted;
  }, [trains, sortOptions.trains]);

  const displayedTrains = useMemo(() => {
    return sortedTrains.slice(0, displayLimit.trains);
  }, [sortedTrains, displayLimit.trains]);

  const sortedHotels = useMemo(() => {
    let sorted = [...hotels];
    switch (sortOptions.hotels) {
      case 'cheapest':
        sorted = sorted.sort((a, b) => (a.pricePerNight || 0) - (b.pricePerNight || 0));
        break;
      case 'top-rated':
        sorted = sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'closest':
        // For now, just return as-is (would need location data for distance calculation)
        break;
      default:
        break;
    }
    return sorted;
  }, [hotels, sortOptions.hotels]);

  const displayedHotels = useMemo(() => {
    return sortedHotels.slice(0, displayLimit.hotels);
  }, [sortedHotels, displayLimit.hotels]);

  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+)h\s*(\d+)?m?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    return hours * 60 + minutes;
  };

  const handleSelectFlight = async (flight: FlightOption) => {
    setSelectedFlight(flight.id);
    try {
      await upsertGroupBookingSelection({
        groupId: selectedGroupId,
        dayNumber: 1,
        bookingType: 'flight',
        selectedOption: flight,
        userId: user?.uid || null,
        userName: user?.displayName || null,
      });
      // Also call backend endpoint
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      await fetch(`${API_BASE_URL}/bookings/select-flight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId, selectedOption: flight }),
      });
    } catch (error) {
      console.error('Error saving flight selection:', error);
    }
  };

  const handleSelectTrain = async (train: TrainOption) => {
    setSelectedTrain(train.id);
    try {
      await upsertGroupBookingSelection({
        groupId: selectedGroupId,
        dayNumber: 1,
        bookingType: 'train',
        selectedOption: train,
        userId: user?.uid || null,
        userName: user?.displayName || null,
      });
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      await fetch(`${API_BASE_URL}/bookings/select-train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId, selectedOption: train }),
      });
    } catch (error) {
      console.error('Error saving train selection:', error);
    }
  };

  const handleSelectHotel = async (hotel: HotelOption) => {
    setSelectedHotel(hotel.id);
    try {
      await upsertGroupBookingSelection({
        groupId: selectedGroupId,
        dayNumber: 1,
        bookingType: 'hotel',
        selectedOption: hotel,
        userId: user?.uid || null,
        userName: user?.displayName || null,
      });
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      await fetch(`${API_BASE_URL}/bookings/select-hotel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroupId, selectedOption: hotel }),
      });
    } catch (error) {
      console.error('Error saving hotel selection:', error);
    }
  };

  const formatTimeAgo = (date: Date | null): string => {
    if (!date) return 'Never';
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="min-h-screen p-6 content-container">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-card p-6">
          <h1 className="text-3xl font-bold text-white mb-2">Book Your Travel</h1>
          <p className="text-white/70">Select your group and book flights, trains, and hotels</p>
        </div>

        {/* Group Selection */}
        <div className="glass-card p-6">
          <label className="block text-white font-semibold mb-3">Select Group</label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="w-full glass-input px-4 py-3 rounded-lg text-white"
            disabled={loading.groups}
          >
            <option value="">-- Select a group --</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.groupName} - {group.destination}
              </option>
            ))}
          </select>
        </div>
        
        {/* Plan Summary Card */}
        {planData && (
          <div className="glass-card p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Trip Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center space-x-3">
                <MapPin className="w-5 h-5 text-white/70" />
                <div>
                  <p className="text-white/70 text-sm">From</p>
                  <p className="text-white font-semibold">{planData.sourceLocation}</p>
      </div>
    </div>
              <div className="flex items-center space-x-3">
                <MapPin className="w-5 h-5 text-white/70" />
                  <div>
                  <p className="text-white/70 text-sm">To</p>
                  <p className="text-white font-semibold">{planData.destination}</p>
                  </div>
                    </div>
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-white/70" />
                  <div>
                  <p className="text-white/70 text-sm">Travel Date</p>
                  <p className="text-white font-semibold">{new Date(planData.travelDate).toLocaleDateString()}</p>
                </div>
                  </div>
              <div className="flex items-center space-x-3">
                <Users className="w-5 h-5 text-white/70" />
                <div>
                  <p className="text-white/70 text-sm">Travellers</p>
                  <p className="text-white font-semibold">{planData.travellersCount}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm">Budget</p>
                  <p className="text-white font-bold text-xl">₹{planData.budget.toLocaleString()}</p>
                </div>
                {lastUpdated && (
                  <div className="flex items-center space-x-2 text-white/70 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>Updated {formatTimeAgo(lastUpdated)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Flights Section */}
        <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Plane className="w-6 h-6 text-white" />
              <h2 className="text-2xl font-bold text-white">Flights</h2>
            </div>
            <select
              value={sortOptions.flights}
              onChange={(e) => {
                setSortOptions((prev) => ({ ...prev, flights: e.target.value as SortOption }));
                setDisplayLimit((prev) => ({ ...prev, flights: 4 })); // Reset to 4 when filter changes
              }}
              className="glass-input px-3 py-2 rounded-lg text-white text-sm"
            >
              <option value="cheapest">Cheapest</option>
              <option value="fastest">Fastest</option>
              <option value="morning">Morning</option>
              <option value="evening">Evening</option>
            </select>
                  </div>
                  
          {loading.flights ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          ) : errors.flights ? (
            <div className="glass-card p-4 border border-red-500/50">
              <p className="text-red-400">{errors.flights}</p>
            </div>
          ) : sortedFlights.length === 0 ? (
            <p className="text-white/70 text-center py-8">No flights found</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {displayedFlights.map((flight) => (
                <div
                  key={flight.id}
                  className={`glass-card p-5 border transition-all ${
                    selectedFlight === flight.id
                      ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold text-lg">{flight.airline}</h3>
                      <p className="text-white/70 text-sm">{flight.flightNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold text-xl">₹{flight.price.toLocaleString()}</p>
                      <p className="text-white/70 text-xs">{flight.currency}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                  <div>
                      <p className="text-white font-semibold">{flight.departureTime}</p>
                      <p className="text-white/70 text-sm">{flight.origin}</p>
                    </div>
                    <div className="flex-1 px-4 text-center">
                      <p className="text-white/70 text-xs">{flight.duration}</p>
                      <div className="flex items-center justify-center mt-1">
                        <div className="h-px bg-white/20 flex-1"></div>
                        <ArrowRight className="w-4 h-4 text-white/50 mx-2" />
                        <div className="h-px bg-white/20 flex-1"></div>
                  </div>
                </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">{flight.arrivalTime}</p>
                      <p className="text-white/70 text-sm">{flight.destination}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSelectFlight(flight)}
                    className={`w-full py-2 px-4 rounded-lg font-semibold transition-all ${
                      selectedFlight === flight.id
                        ? 'bg-emerald-500 text-white'
                        : 'premium-button-primary'
                    }`}
                  >
                    {selectedFlight === flight.id ? (
                      <span className="flex items-center justify-center space-x-2">
                        <Check className="w-4 h-4" />
                        <span>Selected</span>
                      </span>
                    ) : (
                      'Select Flight'
                    )}
                  </button>
                </div>
              ))}
              </div>
              {sortedFlights.length > displayLimit.flights && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => setDisplayLimit((prev) => ({ ...prev, flights: Math.min(prev.flights + 4, sortedFlights.length) }))}
                    className="premium-button-secondary px-6 py-2"
                  >
                    Load More ({sortedFlights.length - displayLimit.flights} more available)
                  </button>
                </div>
              )}
            </>
          )}
              </div>

        {/* Trains Section */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Train className="w-6 h-6 text-white" />
              <h2 className="text-2xl font-bold text-white">Trains</h2>
            </div>
            <select
              value={sortOptions.trains}
              onChange={(e) => {
                setSortOptions((prev) => ({ ...prev, trains: e.target.value as SortOption }));
                setDisplayLimit((prev) => ({ ...prev, trains: 4 })); // Reset to 4 when filter changes
              }}
              className="glass-input px-3 py-2 rounded-lg text-white text-sm"
            >
              <option value="cheapest">Cheapest</option>
              <option value="fastest">Fastest</option>
            </select>
          </div>

          {loading.trains ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          ) : errors.trains ? (
            <div className="glass-card p-4 border border-red-500/50">
              <p className="text-red-400">{errors.trains}</p>
            </div>
          ) : sortedTrains.length === 0 ? (
            <p className="text-white/70 text-center py-8">No trains found</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {displayedTrains.map((train) => (
                <div
                  key={train.id}
                  className={`glass-card p-5 border transition-all ${
                    selectedTrain === train.id
                      ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold text-lg">{train.name}</h3>
                      <p className="text-white/70 text-sm">{train.number}</p>
                    </div>
                    {train.price && (
                      <div className="text-right">
                        <p className="text-white font-bold text-xl">₹{train.price.toLocaleString()}</p>
        </div>
                    )}
    </div>
                  <div className="flex items-center justify-between mb-4">
              <div>
                      <p className="text-white font-semibold">{train.departureTime}</p>
                      <p className="text-white/70 text-sm">{train.origin}</p>
                    </div>
                    <div className="flex-1 px-4 text-center">
                      <p className="text-white/70 text-xs">{train.duration}</p>
                      <div className="flex items-center justify-center mt-1">
                        <div className="h-px bg-white/20 flex-1"></div>
                        <ArrowRight className="w-4 h-4 text-white/50 mx-2" />
                        <div className="h-px bg-white/20 flex-1"></div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">{train.arrivalTime}</p>
                      <p className="text-white/70 text-sm">{train.destination}</p>
                </div>
                  </div>
                  <button
                    onClick={() => handleSelectTrain(train)}
                    className={`w-full py-2 px-4 rounded-lg font-semibold transition-all ${
                      selectedTrain === train.id
                        ? 'bg-emerald-500 text-white'
                        : 'premium-button-primary'
                    }`}
                  >
                    {selectedTrain === train.id ? (
                      <span className="flex items-center justify-center space-x-2">
                        <Check className="w-4 h-4" />
                        <span>Selected</span>
                      </span>
                    ) : (
                      'Select Train'
                    )}
                  </button>
                </div>
              ))}
              </div>
              {sortedTrains.length > displayLimit.trains && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => setDisplayLimit((prev) => ({ ...prev, trains: Math.min(prev.trains + 4, sortedTrains.length) }))}
                    className="premium-button-secondary px-6 py-2"
                  >
                    Load More ({sortedTrains.length - displayLimit.trains} more available)
                  </button>
                </div>
              )}
            </>
          )}
              </div>

        {/* Hotels Section */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Building2 className="w-6 h-6 text-white" />
              <h2 className="text-2xl font-bold text-white">Hotels</h2>
            </div>
            <select
              value={sortOptions.hotels}
              onChange={(e) => {
                setSortOptions((prev) => ({ ...prev, hotels: e.target.value as SortOption }));
                setDisplayLimit((prev) => ({ ...prev, hotels: 4 })); // Reset to 4 when filter changes
              }}
              className="glass-input px-3 py-2 rounded-lg text-white text-sm"
            >
              <option value="top-rated">Top-rated</option>
              <option value="cheapest">Cheapest</option>
              <option value="closest">Closest to center</option>
            </select>
            </div>

          {loading.hotels ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
          ) : errors.hotels ? (
            <div className="glass-card p-4 border border-red-500/50">
              <p className="text-red-400">{errors.hotels}</p>
            </div>
          ) : sortedHotels.length === 0 ? (
            <p className="text-white/70 text-center py-8">No hotels found</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {displayedHotels.map((hotel) => (
                <div
                  key={hotel.id}
                  className={`glass-card overflow-hidden border transition-all ${
                    selectedHotel === hotel.id
                      ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  {hotel.imageUrl && (
                    <div
                      className="h-40 w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${hotel.imageUrl})` }}
                    />
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg mb-1">{hotel.name}</h3>
                        <p className="text-white/70 text-sm mb-2">{hotel.location}</p>
                        {hotel.rating && (
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-white text-sm">{hotel.rating}</span>
                          </div>
                )}
              </div>
                      {hotel.pricePerNight && (
                        <div className="text-right">
                          <p className="text-white font-bold text-xl">₹{hotel.pricePerNight.toLocaleString()}</p>
                          <p className="text-white/70 text-xs">per night</p>
                        </div>
                      )}
            </div>
                    <button
                      onClick={() => handleSelectHotel(hotel)}
                      className={`w-full py-2 px-4 rounded-lg font-semibold transition-all ${
                        selectedHotel === hotel.id
                          ? 'bg-emerald-500 text-white'
                          : 'premium-button-primary'
                      }`}
                    >
                      {selectedHotel === hotel.id ? (
                        <span className="flex items-center justify-center space-x-2">
                          <Check className="w-4 h-4" />
                          <span>Selected</span>
                        </span>
                      ) : (
                        'Select Hotel'
                      )}
            </button>
          </div>
        </div>
      ))}
    </div>
              {sortedHotels.length > displayLimit.hotels && (
                <div className="mt-4 text-center">
                <button
                    onClick={() => setDisplayLimit((prev) => ({ ...prev, hotels: Math.min(prev.hotels + 4, sortedHotels.length) }))}
                    className="premium-button-secondary px-6 py-2"
                  >
                    Load More ({sortedHotels.length - displayLimit.hotels} more available)
            </button>
          </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingPage;
