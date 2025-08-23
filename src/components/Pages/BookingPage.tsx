import React, { useState } from 'react';
import { Plane, Train, Building2, Search, Filter, MapPin, Clock, Star } from 'lucide-react';
import { MOCK_FLIGHTS, MOCK_TRAINS, MOCK_HOTELS } from '../../utils/mockData';
import { FlightBooking, TrainBooking, HotelBooking } from '../../types';
import { apiService } from '../../services/api';

type BookingTab = 'flights' | 'trains' | 'hotels';

const BookingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<BookingTab>('flights');
  const [aiRecommendations, setAiRecommendations] = useState<string>('');
  const [isGettingRecommendations, setIsGettingRecommendations] = useState(false);
  const [searchForm, setSearchForm] = useState({
    from: '',
    to: '',
    date: '',
    returnDate: '',
    passengers: 1,
    class: 'economy'
  });

  const tabs = [
    { id: 'flights' as const, label: 'Flights', icon: Plane, color: 'text-blue-600' },
    { id: 'trains' as const, label: 'Trains', icon: Train, color: 'text-green-600' },
    { id: 'hotels' as const, label: 'Hotels', icon: Building2, color: 'text-purple-600' }
  ];

  const getAIRecommendations = async () => {
    if (!searchForm.from || !searchForm.to || !searchForm.date) {
      alert('Please fill in the search form first');
      return;
    }

    setIsGettingRecommendations(true);
    try {
      const response = await apiService.getBookingRecommendations({
        from: searchForm.from,
        to: searchForm.to,
        date: searchForm.date,
        type: activeTab === 'flights' ? 'flight' : activeTab === 'trains' ? 'train' : 'hotel',
        preferences: `${searchForm.class} class, ${searchForm.passengers} passengers`
      });
      setAiRecommendations(response.recommendations);
    } catch (error) {
      console.error('Failed to get AI recommendations:', error);
      setAiRecommendations('Unable to get recommendations at the moment. Please try again later.');
    } finally {
      setIsGettingRecommendations(false);
    }
  };

  const renderSearchForm = () => (
    <div className="glass-card p-6 mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-secondary mb-2">From</label>
          <input
            type="text"
            placeholder="Departure city"
            value={searchForm.from}
            onChange={(e) => setSearchForm(prev => ({ ...prev, from: e.target.value }))}
            className="w-full px-4 py-3 glass-input rounded-xl"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-secondary mb-2">To</label>
          <input
            type="text"
            placeholder="Destination"
            value={searchForm.to}
            onChange={(e) => setSearchForm(prev => ({ ...prev, to: e.target.value }))}
            className="w-full px-4 py-3 glass-input rounded-xl"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-secondary mb-2">
            {activeTab === 'hotels' ? 'Check-in' : 'Date'}
          </label>
          <input
            type="date"
            value={searchForm.date}
            onChange={(e) => setSearchForm(prev => ({ ...prev, date: e.target.value }))}
            className="w-full px-4 py-3 glass-input rounded-xl"
          />
        </div>

        {activeTab === 'hotels' ? (
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">Check-out</label>
            <input
              type="date"
              value={searchForm.returnDate}
              onChange={(e) => setSearchForm(prev => ({ ...prev, returnDate: e.target.value }))}
              className="w-full px-4 py-3 glass-input rounded-xl"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">Passengers</label>
            <select
              value={searchForm.passengers}
              onChange={(e) => setSearchForm(prev => ({ ...prev, passengers: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 glass-input rounded-xl"
            >
              {[1,2,3,4,5,6].map(num => (
                <option key={num} value={num}>{num} {num === 1 ? 'Passenger' : 'Passengers'}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div className="flex space-x-4">
          <select
            value={searchForm.class}
            onChange={(e) => setSearchForm(prev => ({ ...prev, class: e.target.value }))}
            className="px-4 py-2 glass-input rounded-xl"
          >
            <option value="economy">Economy</option>
            <option value="business">Business</option>
            <option value="first">First Class</option>
          </select>
          <button className="px-4 py-2 glass-card hover:bg-white/10 flex items-center text-secondary">
            <Filter className="h-4 w-4 mr-2 text-secondary" />
            Filters
          </button>
        </div>
        
        <button className="premium-button-primary px-8 py-3 rounded-xl font-semibold flex items-center">
          <Search className="h-5 w-5 mr-2" />
          Search
        </button>
      </div>
    </div>
  );

  const renderFlightResults = () => (
    <div className="space-y-4">
      {MOCK_FLIGHTS.map(flight => (
        <div key={flight.id} className="glass-card p-6 hover:bg-white/10 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-grow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-6">
                  <div>
                    <div className="text-2xl font-bold text-primary">{flight.time}</div>
                    <div className="text-sm text-secondary">{flight.from}</div>
                  </div>
                  
                  <div className="flex-grow flex items-center justify-center">
                    <div className="flex items-center">
                      <div className="w-16 h-0.5 bg-white/30"></div>
                      <Plane className="h-5 w-5 text-secondary mx-2 transform rotate-90" />
                      <div className="w-16 h-0.5 bg-white/30"></div>
                    </div>
                    <div className="text-sm text-muted ml-4">{flight.duration}</div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {new Date(`2000-01-01T${flight.time}`).getTime() + (parseInt(flight.duration.split('h')[0]) * 3600000) + (parseInt(flight.duration.split('m')[0]) * 60000) > 86400000 
                        ? new Date(new Date(`2000-01-01T${flight.time}`).getTime() + (parseInt(flight.duration.split('h')[0]) * 3600000)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : new Date(new Date(`2000-01-01T${flight.time}`).getTime() + (parseInt(flight.duration.split('h')[0]) * 3600000)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      }
                    </div>
                    <div className="text-sm text-secondary">{flight.to}</div>
                  </div>
                </div>

                <div className="text-right ml-6">
                  <div className="text-3xl font-bold text-primary">
                    ₹{flight.price.toLocaleString('en-IN')}
                  </div>
                  <div className="text-sm text-secondary">{flight.airline}</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 text-sm text-secondary">
                  <span>Non-stop</span>
                  <span>•</span>
                  <span>{searchForm.class}</span>
                  <span>•</span>
                  <span>Refundable</span>
                </div>

                <button className="premium-button-primary px-6 py-2 rounded-xl font-semibold">
                  Book Now
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderTrainResults = () => (
    <div className="space-y-4">
      {MOCK_TRAINS.map(train => (
        <div key={train.id} className="glass-card p-6 hover:bg-white/10 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex-grow">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-6">
                  <div>
                    <div className="text-2xl font-bold text-primary">{train.time}</div>
                    <div className="text-sm text-secondary">{train.from}</div>
                  </div>
                  
                  <div className="flex-grow flex items-center justify-center">
                    <div className="flex items-center">
                      <div className="w-16 h-0.5 bg-white/30"></div>
                      <Train className="h-5 w-5 text-secondary mx-2" />
                      <div className="w-16 h-0.5 bg-white/30"></div>
                    </div>
                    <div className="text-sm text-muted ml-4">{train.duration}</div>
                  </div>

                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {new Date(`2000-01-01T${train.time}`).getTime() + (parseInt(train.duration.split('h')[0]) * 3600000) > 86400000 
                        ? new Date(new Date(`2000-01-01T${train.time}`).getTime() + (parseInt(train.duration.split('h')[0]) * 3600000)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : new Date(new Date(`2000-01-01T${train.time}`).getTime() + (parseInt(train.duration.split('h')[0]) * 3600000)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                      }
                    </div>
                    <div className="text-sm text-secondary">{train.to}</div>
                  </div>
                </div>

                <div className="text-right ml-6">
                  <div className="text-3xl font-bold text-primary">
                    ₹{train.price.toLocaleString('en-IN')}
                  </div>
                  <div className="text-sm text-secondary">{train.class}</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 text-sm text-secondary">
                  <span>{train.trainName}</span>
                  <span>•</span>
                  <span>{train.trainNumber}</span>
                  <span>•</span>
                  <span>Confirmed</span>
                </div>

                <button className="premium-button-primary px-6 py-2 rounded-xl font-semibold">
                  Book Now
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderHotelResults = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {MOCK_HOTELS.map(hotel => (
        <div key={hotel.id} className="glass-card overflow-hidden hover:bg-white/10 transition-all duration-300">
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-primary mb-1">{hotel.name}</h3>
                <div className="flex items-center text-secondary mb-2">
                  <MapPin className="h-4 w-4 mr-1" />
                  <span className="text-sm">{hotel.location}</span>
                </div>
                <div className="flex items-center">
                  <div className="flex text-yellow-400">
                    {[...Array(Math.floor(hotel.rating))].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <span className="text-sm text-secondary ml-2">{hotel.rating} Rating</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  ₹{hotel.price.toLocaleString('en-IN')}
                </div>
                <div className="text-sm text-secondary">per night</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center text-sm text-secondary mb-2">
                <Clock className="h-4 w-4 mr-1" />
                <span>Check-in: {hotel.checkIn} | Check-out: {hotel.checkOut}</span>
              </div>
              <div className="text-sm font-medium text-secondary mb-2">{hotel.roomType}</div>
            </div>

            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {hotel.amenities.slice(0, 4).map((amenity, index) => (
                  <span key={index} className="px-3 py-1 glass-card text-secondary text-xs rounded-full">
                    {amenity}
                  </span>
                ))}
                {hotel.amenities.length > 4 && (
                  <span className="px-3 py-1 glass-card text-muted text-xs rounded-full">
                    +{hotel.amenities.length - 4} more
                  </span>
                )}
              </div>
            </div>

            <button className="w-full premium-button-primary py-3 rounded-xl font-semibold">
              Book Now
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">
            🎫 Smart Booking
          </h1>
          <p className="text-xl text-secondary">
            Compare and book the best deals across flights, trains, and hotels
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="glass-card p-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-8 py-4 rounded-xl font-semibold transition-all duration-300 ${
                    activeTab === tab.id
                      ? 'bg-white text-black shadow-md'
                      : 'text-secondary hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Form */}
        {renderSearchForm()}

        {/* Results */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-primary">
              {activeTab === 'flights' && 'Available Flights'}
              {activeTab === 'trains' && 'Available Trains'}
              {activeTab === 'hotels' && 'Available Hotels'}
            </h2>
            <div className="text-sm text-secondary">
              Showing {activeTab === 'flights' ? MOCK_FLIGHTS.length : activeTab === 'trains' ? MOCK_TRAINS.length : MOCK_HOTELS.length} results
            </div>
          </div>

          {activeTab === 'flights' && renderFlightResults()}
          {activeTab === 'trains' && renderTrainResults()}
          {activeTab === 'hotels' && renderHotelResults()}
        </div>

        {/* Price Alert */}
        <div className="glass-card p-6 border border-red-500/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-primary">🤖 AI Booking Assistant</h3>
            <button
              onClick={getAIRecommendations}
              disabled={isGettingRecommendations}
              className="premium-button-primary px-4 py-2 rounded-xl font-semibold disabled:opacity-50"
            >
              {isGettingRecommendations ? 'Getting Tips...' : 'Get AI Tips'}
            </button>
          </div>
          {aiRecommendations ? (
            <div className="text-sm text-secondary whitespace-pre-wrap">
              {aiRecommendations}
            </div>
          ) : (
            <p className="text-secondary">Get personalized booking recommendations and money-saving tips from our AI assistant</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingPage;