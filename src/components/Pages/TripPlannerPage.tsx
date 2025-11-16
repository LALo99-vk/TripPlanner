import React, { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { INDIAN_CITIES, TRAVEL_INTERESTS } from '../../utils/constants';
import { TravelInterest } from '../../types';
import { apiService } from '../../services/api';
import { planStore } from '../../services/planStore';
import { auth } from '../../config/firebase';
import { saveUserPlan } from '../../services/planRepository';
import { useAuth } from '../../hooks/useAuth';

interface TripStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
}


const TripPlannerPage: React.FC = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    from: 'Bangalore',
    to: 'Chennai',
    fromCustom: '',
    toCustom: '',
    startDate: '',
    endDate: '',
    budget: 10000,
    travelers: 2,
    interests: [] as TravelInterest[],
    tripStyle: '',
    customDestinations: [] as string[],
    customActivities: [] as string[],
    activitiesPerDay: 3
  });

  const [customDestinationInput, setCustomDestinationInput] = useState('');
  const [customActivityInput, setCustomActivityInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

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



  const generateItinerary = async () => {
    const fromCity = formData.fromCustom.trim() || formData.from;
    const toCity = formData.toCustom.trim() || formData.to;
    
    if (!fromCity || !toCity || !formData.startDate || !formData.endDate) {
      alert('Please fill all required fields');
      return;
    }

    setIsGenerating(true);
    
    try {
      const response = await apiService.generateTripPlan({
        from: fromCity,
        to: toCity,
        startDate: formData.startDate,
        endDate: formData.endDate,
        budget: formData.budget,
        travelers: formData.travelers,
        interests: formData.interests,
        customDestinations: formData.customDestinations,
        customActivities: formData.customActivities,
        activitiesPerDay: formData.activitiesPerDay,
        tripStyle: formData.tripStyle
      });

      const ai = response.data;
      planStore.setPlan(ai);
      // Persist to Supabase if user is logged in
      const user = auth.currentUser;
      if (user) {
        try {
          await saveUserPlan({
            userId: user.uid,
            plan: ai,
            userBudget: formData.budget,
            optimizedBudget: ai.totals?.totalCostINR,
            categoryBudgets: ai.totals?.breakdown,
          });
        } catch (e) {
          console.error('Failed to save plan to Supabase:', e);
        }
      }
      
      // Navigate to Your Plan page automatically
      try { localStorage.setItem('show_yourplan_tip', '1'); } catch {}
      const evt = new CustomEvent('navigate', { detail: { page: 'yourplan' } });
      window.dispatchEvent(evt as any);
    } catch (error) {
      console.error('Failed to generate itinerary:', error);
      alert('Failed to generate itinerary. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Non-blocking reminder to sign in */}
        {!user && (
          <div className="glass-card p-3 mb-4 text-sm text-secondary">
            Reminder: Sign in with your Google account to save and access your plans across devices. You can still generate plans without signing in.
          </div>
        )}
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">
            Trip Planner
          </h1>
          <p className="text-xl text-secondary">
            Create the perfect itinerary for your Indian adventure
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Enhanced Planning Form */}
          <div ref={formRef} className="glass-card p-8">
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
                  <div className="space-y-2">
                  <select
                    value={formData.from}
                      onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value, fromCustom: '' }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    {INDIAN_CITIES.map(city => (
                      <option key={`from-${city.name}`} value={city.name}>
                        {city.name}, {city.state}
                      </option>
                    ))}
                  </select>
                    <div className="text-xs text-secondary text-center">OR</div>
                    <input
                      type="text"
                      value={formData.fromCustom}
                      onChange={(e) => setFormData(prev => ({ ...prev, fromCustom: e.target.value, from: '' }))}
                      placeholder="Enter custom city name..."
                      className="w-full px-4 py-3 glass-input rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    To City
                  </label>
                  <div className="space-y-2">
                  <select
                    value={formData.to}
                      onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value, toCustom: '' }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    {INDIAN_CITIES.map(city => (
                      <option key={`to-${city.name}`} value={city.name}>
                        {city.name}, {city.state}
                      </option>
                    ))}
                  </select>
                    <div className="text-xs text-secondary text-center">OR</div>
                    <input
                      type="text"
                      value={formData.toCustom}
                      onChange={(e) => setFormData(prev => ({ ...prev, toCustom: e.target.value, to: '' }))}
                      placeholder="Enter custom city name..."
                      className="w-full px-4 py-3 glass-input rounded-xl"
                    />
                  </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 accent-white">
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
                <div className="flex space-x-2 mb-3 text-white">
                  <input
                    type="text"
                    value={customActivityInput}
                    onChange={(e) => setCustomActivityInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCustomActivity()}
                    placeholder="e.g., scuba diving, temple visits, food tours..."
                    className="flex-1 px-4 py-3 glass-input rounded-xl text-white"
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

              {/* Activities Per Day */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  How many activities/places do you want to visit per day?
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.activitiesPerDay}
                    onChange={(e) => setFormData(prev => ({ ...prev, activitiesPerDay: parseInt(e.target.value) || 1 }))}
                    className="w-20 px-4 py-3 glass-input rounded-xl text-center"
                  />
                  <span className="text-secondary">
                    {formData.activitiesPerDay === 1 ? 'activity' : 'activities'} per day
                  </span>
                </div>
                <p className="text-xs text-secondary mt-2">
                  AI will generate a detailed plan with {formData.activitiesPerDay} {formData.activitiesPerDay === 1 ? 'activity' : 'activities'} for each day of your trip
                </p>
              </div>

              {/* Generate Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <button
                  onClick={generateItinerary}
                  disabled={isGenerating}
                  className="w-full premium-button-secondary py-4 text-lg font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Regenerate Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripPlannerPage;