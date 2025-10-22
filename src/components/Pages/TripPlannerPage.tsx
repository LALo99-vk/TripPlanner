import React, { useRef, useState } from 'react';
import { MapPin, Clock, X, Plus, Download, Share, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { INDIAN_CITIES, TRAVEL_INTERESTS } from '../../utils/constants';
import { TravelInterest } from '../../types';
import { apiService, AiTripPlanData } from '../../services/api';
import { planStore } from '../../services/planStore';

interface TripStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// Local view models for legacy render, derived from AI plan
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
  totals?: { total: number; breakdown: { stay: number; food: number; transport: number; activities: number; misc: number } };
  overview?: { from: string; to: string; durationDays: number; budgetINR: number; travelers: number; interests: string[]; summary: string };
  aiRaw?: AiTripPlanData;
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
  const [smartAdjustLoading, setSmartAdjustLoading] = useState(false);
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

      const ai = response.data;
      // Transform AI plan to local render model
      const itineraryFromAi: GeneratedItinerary = {
        tripTitle: `${ai.overview.durationDays}-Day ${ai.overview.to} Adventure` ,
        overview: ai.overview,
        totals: { total: ai.totals.totalCostINR, breakdown: ai.totals.breakdown },
        itinerary: ai.days.map((d) => {
          const activities: ActivityCard[] = [];
          const pushSlot = (items: any[], label: string) => {
            (items || []).forEach((it) => {
              activities.push({
                time: label,
                title: it.name,
                category: 'activity',
                description: `${it.description} • ${it.location} • ~${it.travelDistanceKm} km travel`,
                duration: it.duration,
                cost: it.costINR,
              });
            });
          };
          pushSlot(d.slots.morning, 'Morning');
          pushSlot(d.slots.afternoon, 'Afternoon');
          pushSlot(d.slots.evening, 'Evening');
          return { day: d.day, title: d.header, activities };
        }),
        aiRaw: ai,
      };

      setGeneratedItinerary(itineraryFromAi);
      planStore.setPlan(ai);
      setExpandedDays(new Set([1])); // Expand first day by default
    } catch (error) {
      console.error('Failed to generate itinerary:', error);
      alert('Failed to generate itinerary. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  // total cost is shown directly from generatedItinerary.totals

  const handleSmartAdjust = async (type: 'reduce_cost' | 'add_activities') => {
    if (!generatedItinerary?.aiRaw) return;
    setSmartAdjustLoading(true);
    try {
      if (type === 'reduce_cost') {
        const res = await apiService.optimizeBudget({
          plan: generatedItinerary.aiRaw,
          targetAdjustmentINR: 2000,
          preference: 'reduce_cost',
        });
        const ai = res.data.updatedPlan;
        const updated: GeneratedItinerary = {
          tripTitle: `${ai.overview.durationDays}-Day ${ai.overview.to} Adventure` ,
          overview: ai.overview,
          totals: { total: ai.totals.totalCostINR, breakdown: ai.totals.breakdown },
          itinerary: ai.days.map((d) => {
            const activities: ActivityCard[] = [];
            const pushSlot = (items: any[], label: string) => {
              (items || []).forEach((it) => {
                activities.push({
                  time: label,
                  title: it.name,
                  category: 'activity',
                  description: `${it.description} • ${it.location} • ~${it.travelDistanceKm} km travel`,
                  duration: it.duration,
                  cost: it.costINR,
                });
              });
            };
            pushSlot(d.slots.morning, 'Morning');
            pushSlot(d.slots.afternoon, 'Afternoon');
            pushSlot(d.slots.evening, 'Evening');
            return { day: d.day, title: d.header, activities };
          }),
          aiRaw: ai,
        };
        setGeneratedItinerary(updated);
      } else {
        const res = await apiService.smartAdjust({
          plan: generatedItinerary.aiRaw,
          action: { type: 'add_activities', theme: formData.tripStyle || 'adventure' },
        });
        const ai = res.data.updatedPlan;
        const updated: GeneratedItinerary = {
          tripTitle: `${ai.overview.durationDays}-Day ${ai.overview.to} Adventure` ,
          overview: ai.overview,
          totals: { total: ai.totals.totalCostINR, breakdown: ai.totals.breakdown },
          itinerary: ai.days.map((d) => {
            const activities: ActivityCard[] = [];
            const pushSlot = (items: any[], label: string) => {
              (items || []).forEach((it) => {
                activities.push({
                  time: label,
                  title: it.name,
                  category: 'activity',
                  description: `${it.description} • ${it.location} • ~${it.travelDistanceKm} km travel`,
                  duration: it.duration,
                  cost: it.costINR,
                });
              });
            };
            pushSlot(d.slots.morning, 'Morning');
            pushSlot(d.slots.afternoon, 'Afternoon');
            pushSlot(d.slots.evening, 'Evening');
            return { day: d.day, title: d.header, activities };
          }),
          aiRaw: ai,
        };
        setGeneratedItinerary(updated);
      }
    } catch (e) {
      alert('Smart adjust failed.');
    } finally {
      setSmartAdjustLoading(false);
    }
  };

  const scrollToForm = () => {
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const mapLink = (location: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

  const DonutChart: React.FC<{ breakdown: { stay: number; food: number; transport: number; activities: number; misc: number } }> = ({ breakdown }) => {
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
    const segments = [
      { key: 'stay', color: '#60a5fa', value: breakdown.stay },
      { key: 'food', color: '#f59e0b', value: breakdown.food },
      { key: 'transport', color: '#34d399', value: breakdown.transport },
      { key: 'activities', color: '#a78bfa', value: breakdown.activities },
      { key: 'misc', color: '#f472b6', value: breakdown.misc },
    ];
    let cumulative = 0;
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    return (
      <div className="flex items-center gap-6">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <g transform="translate(60,60)">
            <circle r={30} fill="#0f172a" />
            {segments.map((s) => {
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const gap = circumference - dash;
              const rotation = (cumulative / total) * 360 - 90; // start at top
              cumulative += s.value;
              return (
                <circle
                  key={s.key}
                  r={radius}
                  fill="transparent"
                  stroke={s.color}
                  strokeWidth={16}
                  strokeDasharray={`${dash} ${gap}`}
                  transform={`rotate(${rotation})`}
                  strokeLinecap="butt"
                />
              );
            })}
          </g>
        </svg>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {segments.map(s => (
            <div key={s.key} className="flex items-center gap-2">
              <span style={{ background: s.color }} className="inline-block w-3 h-3 rounded"></span>
              <span className="capitalize">{s.key}</span>
            </div>
          ))}
        </div>
      </div>
    );
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
                {/* Trip Overview Card */}
                <div className="glass-card p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-secondary mb-2">Trip Overview</div>
                      <div className="space-y-1">
                        <div>📍 Trip: {generatedItinerary.overview?.from} → {generatedItinerary.overview?.to}</div>
                        <div>📅 Duration: {generatedItinerary.overview?.durationDays} Days</div>
                        <div>💰 Budget: ₹{generatedItinerary.overview?.budgetINR.toLocaleString('en-IN')}</div>
                        <div>👥 Travellers: {generatedItinerary.overview?.travelers}</div>
                        <div>🎯 Interest: {(generatedItinerary.overview?.interests || []).join(', ')}</div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={scrollToForm} className="premium-button-secondary px-4 py-2 rounded-xl">
                        Edit Preferences
                      </button>
                      <button onClick={() => handleSmartAdjust('reduce_cost')} disabled={smartAdjustLoading} className="premium-button-secondary px-4 py-2 rounded-xl flex items-center">
                        <SlidersHorizontal className="h-4 w-4 mr-2" />
                        {smartAdjustLoading ? 'Adjusting...' : 'Smart Adjust (–₹2000)'}
                      </button>
                      <button onClick={() => handleSmartAdjust('add_activities')} disabled={smartAdjustLoading} className="premium-button-secondary px-4 py-2 rounded-xl">
                        Add more {formData.tripStyle || 'adventure'} activities
                      </button>
                    </div>
                  </div>
                  {generatedItinerary.overview?.summary && (
                    <p className="text-secondary mt-3">{generatedItinerary.overview.summary}</p>
                  )}
                </div>

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
                    <button onClick={() => {
                      planStore.setPlan(generatedItinerary.aiRaw!);
                      // navigate to Your Plan via global app state
                      const evt = new CustomEvent('navigate', { detail: { page: 'yourplan' } });
                      window.dispatchEvent(evt as any);
                    }} className="premium-button-secondary px-6 py-2 rounded-xl flex items-center">
                      <Share className="h-4 w-4 mr-2" />
                      Open in Your Plan
                    </button>
                  </div>
                </div>

                 {/* Day-by-Day Accordion */}
                <div className="space-y-4">
                  {(generatedItinerary.aiRaw?.days || []).map((d) => (
                    <div key={d.day} className="glass-card overflow-hidden">
                      <button
                        onClick={() => toggleDayExpansion(d.day)}
                        className="w-full p-6 text-left flex items-center justify-between hover:bg-white/5 transition-colors"
                      >
                        <div>
                          <h4 className="text-xl font-bold text-primary">
                            Day {d.day}: {d.header}
                          </h4>
                          <p className="text-secondary mt-1">
                            {(d.slots.morning?.length || 0) + (d.slots.afternoon?.length || 0) + (d.slots.evening?.length || 0)} activities planned
                          </p>
                        </div>
                        {expandedDays.has(d.day) ? (
                          <ChevronDown className="h-6 w-6 text-secondary" />
                        ) : (
                          <ChevronRight className="h-6 w-6 text-secondary" />
                        )}
                      </button>

                      {expandedDays.has(d.day) && (
                        <div className="px-6 pb-6">
                          <div className="space-y-6">
                            {([
                              { label: '🌅 Morning', items: d.slots.morning },
                              { label: '🌞 Afternoon', items: d.slots.afternoon },
                              { label: '🌙 Evening', items: d.slots.evening },
                            ] as { label: string; items: any[] | undefined }[]).map((slot, idx) => (
                              <div key={idx}>
                                <div className="font-semibold text-primary mb-3">{slot.label}</div>
                                <div className="space-y-4">
                                  {(slot.items || []).map((it, index) => (
                                    <div key={index} className="flex items-start space-x-4 p-4 glass-card">
                                      <div className="flex-shrink-0 w-12 h-12 glass-card rounded-full flex items-center justify-center text-xl">
                                        {getCategoryIcon('activity')}
                                      </div>
                                      <div className="flex-grow">
                                        <div className="flex items-center justify-between mb-2">
                                          <h5 className="font-bold text-primary">{it.name}</h5>
                                          <span className="text-sm font-semibold text-primary">₹{Number(it.costINR || 0).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex items-center text-sm text-secondary mb-2">
                                          <Clock className="h-4 w-4 mr-1" />
                                          {it.duration} • {it.location} • ~{it.travelDistanceKm} km
                                        </div>
                                        <p className="text-sm text-secondary mb-3">{it.description}</p>
                                        {it.location && (
                                          <a href={mapLink(it.location)} target="_blank" rel="noreferrer" className="premium-button-secondary px-4 py-2 text-sm rounded-lg inline-block">
                                            View on Map
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {(!slot.items || slot.items.length === 0) && (
                                    <div className="text-sm text-secondary">No plans for this time.</div>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="flex items-center justify-between mt-4">
                              <div className="text-sm text-secondary">AI Tip:</div>
                              <div className="text-sm text-secondary">Total Day Cost: ₹{Number(d.totalDayCostINR || 0).toLocaleString('en-IN')}</div>
                            </div>
                            {d.aiTip && (
                              <div className="glass-card p-3 text-sm text-secondary">{d.aiTip}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Summary with Pie-like breakdown (textual placeholder; charts optional) */}
                {generatedItinerary.totals && (
                  <div className="glass-card p-6">
                    <div className="text-lg font-semibold mb-4">Total Trip Cost: ₹{generatedItinerary.totals.total.toLocaleString('en-IN')}</div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                      <DonutChart breakdown={generatedItinerary.totals.breakdown} />
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                        <div>Stay: ₹{generatedItinerary.totals.breakdown.stay.toLocaleString('en-IN')}</div>
                        <div>Food: ₹{generatedItinerary.totals.breakdown.food.toLocaleString('en-IN')}</div>
                        <div>Transport: ₹{generatedItinerary.totals.breakdown.transport.toLocaleString('en-IN')}</div>
                        <div>Activities: ₹{generatedItinerary.totals.breakdown.activities.toLocaleString('en-IN')}</div>
                        <div>Misc: ₹{generatedItinerary.totals.breakdown.misc.toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripPlannerPage;