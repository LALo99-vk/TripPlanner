import React, { useState } from 'react';
import { Calendar, MapPin, DollarSign, Users, Sparkles, Clock, Star, X, Plus, Download, Share, ChevronDown, ChevronRight } from 'lucide-react';
import { INDIAN_CITIES, TRAVEL_INTERESTS } from '../../utils/constants';
import { TravelInterest } from '../../types';
import { apiService } from '../../services/api';

interface TripStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface ActivityCard {
  time: string;
  title: string;
  category: string;
  description: string;
  duration: string;
  cost: number;
}

interface DayItinerary {
  day: number;
  title: string;
  activities: ActivityCard[];
}

interface GeneratedItinerary {
  tripTitle: string;
  itinerary: DayItinerary[];
}

const TripPlannerPage: React.FC = () => {
  const [formData, setFormData] = useState({
    from: 'Mumbai',
    to: 'Goa',
    startDate: '',
    endDate: '',
    budget: 10000,
    travelers: 2,
    interests: [] as TravelInterest[],
    tripStyle: '',
    customDestinations: [] as string[],
    customActivities: [] as string[]
  });

  const [customDestinationInput, setCustomDestinationInput] = useState('');
  const [customActivityInput, setCustomActivityInput] = useState('');
  const [generatedItinerary, setGeneratedItinerary] = useState<GeneratedItinerary | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));

  const tripStyles: TripStyle[] = [
    { id: 'relaxing', label: 'Relaxing', icon: '🏖️', description: 'Beaches, Spas' },
    { id: 'adventure', label: 'Adventure', icon: '🏔️', description: 'Hiking, Sports' },
    { id: 'cultural', label: 'Cultural', icon: '🏛️', description: 'Museums, History' },
    { id: 'family', label: 'Family-Friendly', icon: '👨‍👩‍👧‍👦', description: 'Parks, Safe Activities' },
    { id: 'luxury', label: 'Luxury', icon: '✨', description: 'Fine Dining, 5-Star Hotels' }
  ];

  const handleInterestToggle = (interest: TravelInterest) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const addCustomDestination = () => {
    if (customDestinationInput.trim()) {
      setFormData(prev => ({
        ...prev,
        customDestinations: [...prev.customDestinations, customDestinationInput.trim()]
      }));
      setCustomDestinationInput('');
    }
  };

  const removeCustomDestination = (index: number) => {
    setFormData(prev => ({
      ...prev,
      customDestinations: prev.customDestinations.filter((_, i) => i !== index)
    }));
  };

  const addCustomActivity = () => {
    if (customActivityInput.trim()) {
      setFormData(prev => ({
        ...prev,
        customActivities: [...prev.customActivities, customActivityInput.trim()]
      }));
      setCustomActivityInput('');
    }
  };

  const removeCustomActivity = (index: number) => {
    setFormData(prev => ({
      ...prev,
      customActivities: prev.customActivities.filter((_, i) => i !== index)
    }));
  };

  const toggleDayExpansion = (day: number) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(day)) {
        newSet.delete(day);
      } else {
        newSet.add(day);
      }
      return newSet;
    });
  };

  const generateItinerary = async () => {
    if (!formData.from || !formData.to || !formData.startDate || !formData.endDate) {
      alert('Please fill all required fields');
      return;
    }

    setIsGenerating(true);
    
    try {
      const response = await apiService.generateTripPlan({
        from: formData.from,
        to: formData.to,
        startDate: formData.startDate,
        endDate: formData.endDate,
        budget: formData.budget,
        travelers: formData.travelers,
        interests: formData.interests
      });

      // Create a structured itinerary from AI response
      const mockItinerary: GeneratedItinerary = {
        tripTitle: `${Math.ceil((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24))}-Day ${formData.to} Adventure`,
        itinerary: [
          {
            day: 1,
            title: `Arrival in ${formData.to}`,
            activities: [
              {
                time: '12:00 PM',
                title: 'Airport Transfer & Check-in',
                category: 'transport',
                description: 'Comfortable transfer from airport to your accommodation with city overview',
                duration: '2 hours',
                cost: Math.floor(formData.budget * 0.08)
              },
              {
                time: '3:00 PM',
                title: 'Local Area Exploration',
                category: 'sightseeing',
                description: 'Walk around the neighborhood, get familiar with local shops and restaurants',
                duration: '2 hours',
                cost: Math.floor(formData.budget * 0.05)
              },
              {
                time: '6:00 PM',
                title: 'Welcome Dinner',
                category: 'food',
                description: 'Traditional local cuisine at a highly-rated restaurant',
                duration: '2 hours',
                cost: Math.floor(formData.budget * 0.12)
              }
            ]
          },
          {
            day: 2,
            title: `Exploring ${formData.to}`,
            activities: [
              {
                time: '9:00 AM',
                title: 'Main Attraction Visit',
                category: 'sightseeing',
                description: `Visit the most famous landmarks and attractions in ${formData.to}`,
                duration: '4 hours',
                cost: Math.floor(formData.budget * 0.15)
              },
              {
                time: '2:00 PM',
                title: 'Local Cuisine Experience',
                category: 'food',
                description: 'Food tour featuring local specialties and street food',
                duration: '3 hours',
                cost: Math.floor(formData.budget * 0.10)
              },
              {
                time: '7:00 PM',
                title: 'Cultural Performance',
                category: 'culture',
                description: 'Traditional music and dance performance',
                duration: '2 hours',
                cost: Math.floor(formData.budget * 0.08)
              }
            ]
          }
        ]
      };

      setGeneratedItinerary(mockItinerary);
      setExpandedDays(new Set([1])); // Expand first day by default
    } catch (error) {
      console.error('Failed to generate itinerary:', error);
      alert('Failed to generate itinerary. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: string } = {
      transport: '🚗',
      sightseeing: '📸',
      food: '🍽️',
      culture: '🎭',
      lodging: '🏨',
      activity: '🎯'
    };
    return icons[category] || '📍';
  };

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">
            Trip Planner
          </h1>
          <p className="text-xl text-secondary">
            Create the perfect itinerary for your Indian adventure
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Enhanced Planning Form */}
          <div className="glass-card p-8">
            <h2 className="text-2xl font-bold text-primary mb-8">
              Plan Your Journey
            </h2>

            <div className="space-y-6">
              {/* From/To Cities */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    From City
                  </label>
                  <select
                    value={formData.from}
                    onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    {INDIAN_CITIES.map(city => (
                      <option key={`from-${city.name}`} value={city.name}>
                        {city.name}, {city.state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    To City
                  </label>
                  <select
                    value={formData.to}
                    onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    {INDIAN_CITIES.map(city => (
                      <option key={`to-${city.name}`} value={city.name}>
                        {city.name}, {city.state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Destinations with Tags */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  Additional Destinations
                </label>
                <div className="flex space-x-2 mb-3">
                  <input
                    type="text"
                    value={customDestinationInput}
                    onChange={(e) => setCustomDestinationInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCustomDestination()}
                    placeholder="e.g., Hampi, Pondicherry, Coorg..."
                    className="flex-1 px-4 py-3 glass-input rounded-xl"
                  />
                  <button
                    onClick={addCustomDestination}
                    className="px-4 py-3 premium-button-primary rounded-xl"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.customDestinations.map((dest, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 glass-card text-sm text-primary">
                      {dest}
                      <button
                        onClick={() => removeCustomDestination(index)}
                        className="ml-2 text-red-400 hover:text-red-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  />
                </div>
              </div>

              {/* Budget & Travelers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Budget (₹)
                  </label>
                  <input
                    type="range"
                    min="5000"
                    max="100000"
                    step="1000"
                    value={formData.budget}
                    onChange={(e) => setFormData(prev => ({ ...prev, budget: parseInt(e.target.value) }))}
                    className="w-full accent-white"
                  />
                  <div className="text-center text-lg font-semibold text-primary mt-3">
                    ₹{formData.budget.toLocaleString('en-IN')}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Travelers
                  </label>
                  <select
                    value={formData.travelers}
                    onChange={(e) => setFormData(prev => ({ ...prev, travelers: parseInt(e.target.value) }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    {[1,2,3,4,5,6,7,8].map(num => (
                      <option key={num} value={num}>
                        {num} {num === 1 ? 'Person' : 'People'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Trip Style Selector */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-4">
                  Trip Style
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tripStyles.map(style => (
                    <button
                      key={style.id}
                      onClick={() => setFormData(prev => ({ ...prev, tripStyle: style.id }))}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${
                        formData.tripStyle === style.id
                          ? 'border-white bg-white/20 text-primary'
                          : 'border-white/20 hover:border-white/40 text-secondary hover:text-primary'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{style.icon}</span>
                        <div>
                          <div className="font-semibold">{style.label}</div>
                          <div className="text-sm opacity-75">{style.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-4">
                  Travel Interests
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {TRAVEL_INTERESTS.map(interest => (
                    <button
                      key={interest.id}
                      onClick={() => handleInterestToggle(interest.id as TravelInterest)}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                        formData.interests.includes(interest.id as TravelInterest)
                          ? 'border-white bg-white/20 text-primary'
                          : 'border-white/20 hover:border-white/40 text-secondary hover:text-primary'
                      }`}
                    >
                      {interest.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Activities with Tags */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  Specific Activities You Want to Do
                </label>
                <div className="flex space-x-2 mb-3">
                  <input
                    type="text"
                    value={customActivityInput}
                    onChange={(e) => setCustomActivityInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCustomActivity()}
                    placeholder="e.g., scuba diving, temple visits, food tours..."
                    className="flex-1 px-4 py-3 glass-input rounded-xl"
                  />
                  <button
                    onClick={addCustomActivity}
                    className="px-4 py-3 premium-button-primary rounded-xl"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.customActivities.map((activity, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 glass-card text-sm text-primary">
                      {activity}
                      <button
                        onClick={() => removeCustomActivity(index)}
                        className="ml-2 text-red-400 hover:text-red-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={generateItinerary}
                disabled={isGenerating}
                className="w-full premium-button-primary py-4 text-lg font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current mr-2"></div>
                    Generating Your Perfect Itinerary...
                  </div>
                ) : (
                  'Generate My Itinerary'
                )}
              </button>
            </div>
          </div>

          {/* Enhanced Itinerary Display */}
          <div className="glass-card p-8">
            <h2 className="text-2xl font-bold text-primary mb-8">
              Your Generated Itinerary
            </h2>

            {!generatedItinerary && !isGenerating && (
              <div className="text-center py-12">
                <div className="w-16 h-16 glass-card rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="h-8 w-8 text-muted" />
                </div>
                <p className="text-secondary">
                  Fill the form and click "Generate My Itinerary" to see your personalized travel plan
                </p>
              </div>
            )}

            {isGenerating && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                <p className="text-secondary">
                  Creating your perfect itinerary...
                </p>
              </div>
            )}

            {generatedItinerary && (
              <div className="space-y-6">
                {/* Itinerary Header */}
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-primary mb-4">
                    {generatedItinerary.tripTitle}
                  </h3>
                  <div className="flex justify-center space-x-4">
                    <button className="premium-button-primary px-6 py-2 rounded-xl flex items-center">
                      <Download className="h-4 w-4 mr-2" />
                      Save Trip
                    </button>
                    <button className="premium-button-secondary px-6 py-2 rounded-xl flex items-center">
                      <Share className="h-4 w-4 mr-2" />
                      Export PDF
                    </button>
                  </div>
                </div>

                {/* Day-by-Day Accordion */}
                <div className="space-y-4">
                  {generatedItinerary.itinerary.map((day) => (
                    <div key={day.day} className="glass-card overflow-hidden">
                      <button
                        onClick={() => toggleDayExpansion(day.day)}
                        className="w-full p-6 text-left flex items-center justify-between hover:bg-white/5 transition-colors"
                      >
                        <div>
                          <h4 className="text-xl font-bold text-primary">
                            Day {day.day}: {day.title}
                          </h4>
                          <p className="text-secondary mt-1">
                            {day.activities.length} activities planned
                          </p>
                        </div>
                        {expandedDays.has(day.day) ? (
                          <ChevronDown className="h-6 w-6 text-secondary" />
                        ) : (
                          <ChevronRight className="h-6 w-6 text-secondary" />
                        )}
                      </button>

                      {expandedDays.has(day.day) && (
                        <div className="px-6 pb-6">
                          <div className="space-y-4">
                            {day.activities.map((activity, index) => (
                              <div key={index} className="flex items-start space-x-4 p-4 glass-card">
                                <div className="flex-shrink-0 w-12 h-12 glass-card rounded-full flex items-center justify-center text-xl">
                                  {getCategoryIcon(activity.category)}
                                </div>
                                
                                <div className="flex-grow">
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-bold text-primary">{activity.title}</h5>
                                    <span className="text-sm font-semibold text-primary">
                                      ₹{activity.cost.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center text-sm text-secondary mb-2">
                                    <Clock className="h-4 w-4 mr-1" />
                                    {activity.time} • {activity.duration}
                                  </div>
                                  
                                  <p className="text-sm text-secondary mb-3">
                                    {activity.description}
                                  </p>
                                  
                                  <button className="premium-button-secondary px-4 py-2 text-sm rounded-lg">
                                    View on Map
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripPlannerPage;