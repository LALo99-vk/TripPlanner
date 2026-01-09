import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Sparkles, Bot, Users, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import { INDIAN_CITIES, TRAVEL_INTERESTS } from '../../utils/constants';
import { TravelInterest } from '../../types';
import { apiService, AiTripPlanData } from '../../services/api';
import { planStore } from '../../services/planStore';
import { auth } from '../../config/firebase';
import { saveUserPlan } from '../../services/planRepository';
import { useAuth } from '../../hooks/useAuth';
import AdvisorSelectionPage from './AdvisorSelectionPage';
import AdvisorPlanRequestPage from './AdvisorPlanRequestPage';
import AdvisorPlanViewPage from './AdvisorPlanViewPage';
import { TravelAdvisor } from '../../services/advisorRepository';

interface TripStyle {
  id: string;
  label: string;
  icon: string;
  description: string;
}

type PlanningMode = 'choice' | 'ai' | 'advisor_select' | 'advisor_request' | 'advisor_plan_view';

const TripPlannerPage: React.FC = () => {
  const { user } = useAuth();
  
  // Planning mode state
  const [planningMode, setPlanningMode] = useState<PlanningMode>('choice');
  const [selectedAdvisor, setSelectedAdvisor] = useState<TravelAdvisor | null>(null);
  const [advisorRequestId, setAdvisorRequestId] = useState<string | null>(null);
  const [advisorPlanType, setAdvisorPlanType] = useState<'new_plan' | 'enhance_plan'>('new_plan');
  
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
    activitiesPerDay: 0, // 0 = auto (energy-based), 1-10 = user override
    groupType: 'friends',
    tripIntent: 'exploration',
    budgetTier: 'mid-range',
    comfortLevel: 'comfortable',
    crowdTolerance: 'moderate',
    foodPreference: 'no-preference',
    planRigidity: 'balanced',
    culturalNotesRequired: false,
    travelMaturity: 'first_timer',
    isFirstVisit: true,
    arrivalTime: '12:00',
    departureTime: '18:00',
    vibePreference: 'balanced'
  });

  const [customDestinationInput, setCustomDestinationInput] = useState('');
  const [customActivityInput, setCustomActivityInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingDestination, setGeneratingDestination] = useState('');
  const [generationStartTime, setGenerationStartTime] = useState(0);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Force re-render for elapsed time display
  const [, setTick] = useState(0);

  // Check and restore generation state on mount
  useEffect(() => {
    const state = planStore.getGenerationState();
    if (state.isGenerating) {
      setIsGenerating(true);
      setGeneratingDestination(state.destination);
      setGenerationStartTime(state.startTime);
      // If generation is in progress, switch to AI mode
      setPlanningMode('ai');
    }

    // Subscribe to planStore changes
    const unsub = planStore.subscribe(() => {
      const newState = planStore.getGenerationState();
      setIsGenerating(newState.isGenerating);
      setGeneratingDestination(newState.destination);
      setGenerationStartTime(newState.startTime);
      
      // If plan is ready and we were generating, show success
      if (!newState.isGenerating && planStore.getPlan()) {
        // Plan is ready
      }
    });

    return unsub;
  }, []);

  // Update elapsed time display every second when generating
  useEffect(() => {
    if (!isGenerating || !generationStartTime) return;
    
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isGenerating, generationStartTime]);

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

    // Set generating state both locally and in planStore (persisted)
    setIsGenerating(true);
    setGeneratingDestination(toCity);
    planStore.setGenerating(true, toCity);
    
    try {
      const response: any = await apiService.generateTripPlan({
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
        tripStyle: formData.tripStyle,
        groupType: formData.groupType,
        tripIntent: formData.tripIntent,
        budgetTier: formData.budgetTier,
        comfortLevel: formData.comfortLevel,
        crowdTolerance: formData.crowdTolerance,
        foodPreference: formData.foodPreference,
        planRigidity: formData.planRigidity,
        culturalNotesRequired: formData.culturalNotesRequired,
        travelMaturity: formData.travelMaturity,
        isFirstVisit: formData.isFirstVisit,
        arrivalTime: formData.arrivalTime,
        departureTime: formData.departureTime,
        vibePreference: formData.vibePreference
      });

      // Check for seasonal validation failure
      if (!response.success && response.error === 'Unsafe seasonal conditions') {
        const seasonalInfo = response.seasonalValidation;
        const warningMessage = `${response.message}\n\n${seasonalInfo.warnings.join('\n')}\n\n${seasonalInfo.suggestions.join('\n')}`;
        alert(warningMessage);
        planStore.setGenerating(false, '');
        setIsGenerating(false);
        return;
      }

      const ai = response.data;
      planStore.setPlan(ai); // This also clears generating state
      
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
      planStore.setGenerationError('Failed to generate itinerary. Please try again.');
      alert('Failed to generate itinerary. Please try again.');
    } finally {
      setIsGenerating(false);
      planStore.setGenerating(false, '');
    }
  };


  // Handle advisor selection
  const handleAdvisorSelect = (advisor: TravelAdvisor) => {
    setSelectedAdvisor(advisor);
    setPlanningMode('advisor_request');
  };

  // Handle request submitted
  const handleRequestSubmitted = (requestId: string) => {
    setAdvisorRequestId(requestId);
    setPlanningMode('advisor_plan_view');
  };

  // Handle plan accepted from advisor
  const handleAdvisorPlanAccepted = async (plan: AiTripPlanData) => {
    // Save the plan
    planStore.setPlan(plan);
    
    // Save to database if user is logged in
    if (user) {
      try {
        await saveUserPlan({
          userId: user.uid,
          plan,
          userBudget: plan.overview.budgetINR,
          optimizedBudget: plan.totals?.totalCostINR,
          categoryBudgets: plan.totals?.breakdown,
        });
      } catch (e) {
        console.error('Failed to save advisor plan to Supabase:', e);
      }
    }
    
    // Navigate to Your Plan page
    const evt = new CustomEvent('navigate', { detail: { page: 'yourplan' } });
    window.dispatchEvent(evt as any);
  };

  // Render advisor selection page
  if (planningMode === 'advisor_select') {
    return (
      <AdvisorSelectionPage
        destination={formData.toCustom || formData.to}
        onSelectAdvisor={handleAdvisorSelect}
        onBack={() => setPlanningMode('choice')}
        mode={advisorPlanType}
      />
    );
  }

  // Render advisor request page
  if (planningMode === 'advisor_request' && selectedAdvisor) {
    return (
      <AdvisorPlanRequestPage
        advisor={selectedAdvisor}
        mode={advisorPlanType}
        existingPlan={advisorPlanType === 'enhance_plan' ? planStore.getPlan() || undefined : undefined}
        onBack={() => setPlanningMode('advisor_select')}
        onRequestSubmitted={handleRequestSubmitted}
      />
    );
  }

  // Render advisor plan view page
  if (planningMode === 'advisor_plan_view' && selectedAdvisor && advisorRequestId) {
    return (
      <AdvisorPlanViewPage
        advisor={selectedAdvisor}
        planType={advisorPlanType === 'new_plan' ? 'advisor_created' : 'advisor_enhanced'}
        requestId={advisorRequestId}
        originalPlan={advisorPlanType === 'enhance_plan' ? planStore.getPlan() || undefined : undefined}
        onBack={() => {
          setAdvisorRequestId(null);
          setPlanningMode('advisor_select');
        }}
        onAcceptPlan={handleAdvisorPlanAccepted}
      />
    );
  }

  // Calculate elapsed time for generating display
  const getElapsedTime = () => {
    if (!generationStartTime) return '';
    const elapsed = Math.floor((Date.now() - generationStartTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="min-h-screen p-3 sm:p-6 md:p-8 pb-safe">
      <div className="content-container">
        {/* Generation In Progress Banner - Shows when returning to page while generating */}
        {isGenerating && (
          <div className="glass-card p-6 sm:p-8 mb-6 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-primary mb-2">
                Generating Your {generatingDestination} Plan...
              </h2>
              <p className="text-secondary mb-4">
                Our AI is crafting a personalized itinerary for you. This usually takes 30-60 seconds.
              </p>
              <div className="flex items-center gap-4 text-sm text-secondary">
                <span className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  In Progress
                </span>
                {generationStartTime > 0 && (
                  <span>Elapsed: {getElapsedTime()}</span>
                )}
              </div>
              <div className="mt-4 text-xs text-secondary">
                💡 Tip: Feel free to explore other pages - we'll save your plan when it's ready!
              </div>
            </div>
          </div>
        )}

        {/* Non-blocking reminder to sign in - mobile optimized */}
        {!user && !isGenerating && (
          <div className="glass-card p-3 sm:p-4 mb-3 sm:mb-4 text-xs sm:text-sm text-secondary rounded-lg">
            <p className="text-center sm:text-left">Reminder: Sign in with your Google account to save and access your plans across devices. You can still generate plans without signing in.</p>
          </div>
        )}

        {/* Header - responsive typography */}
        {!isGenerating && (
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-2 sm:mb-4">
            Trip Planner
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-secondary px-4">
            Create the perfect itinerary for your Indian adventure
          </p>
        </div>
        )}

        {/* Planning Mode Choice - NEW SECTION */}
        {planningMode === 'choice' && !isGenerating && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="text-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-primary mb-2">How would you like to plan your trip?</h2>
              <p className="text-secondary">Choose your planning experience</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* AI Planning Option */}
              <button
                onClick={() => setPlanningMode('ai')}
                className="glass-card p-6 sm:p-8 text-left hover:bg-white/10 transition-all group touch-manipulation"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bot className="h-7 w-7 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-primary mb-2 flex items-center gap-2">
                      AI-Powered Planning
                      <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </h3>
                    <p className="text-secondary text-sm mb-4">
                      Get an instant, structured itinerary generated by AI based on your preferences
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span>Instant results</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span>Data-driven recommendations</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span>Free to use</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <span className="premium-button-primary px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2">
                    Generate AI Plan
                    <Bot className="h-4 w-4" />
                  </span>
                </div>
              </button>

              {/* Local Advisor Option */}
              <button
                onClick={() => {
                  setAdvisorPlanType('new_plan');
                  setPlanningMode('advisor_select');
                }}
                className="glass-card p-6 sm:p-8 text-left hover:bg-white/10 transition-all group touch-manipulation border-2 border-yellow-500/30"
              >
                <div className="absolute -top-3 -right-3 px-3 py-1 bg-yellow-500 text-black text-xs font-bold rounded-full">
                  NEW ✨
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-yellow-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="h-7 w-7 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg sm:text-xl font-bold text-primary mb-2 flex items-center gap-2">
                      Local Travel Advisor
                      <Sparkles className="h-5 w-5 text-yellow-400" />
                    </h3>
                    <p className="text-secondary text-sm mb-4">
                      Get a personalized plan from a verified local expert who knows hidden gems
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-secondary">
                        <CheckCircle className="h-4 w-4 text-yellow-400" />
                        <span>Hidden gems & local secrets</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-secondary">
                        <CheckCircle className="h-4 w-4 text-yellow-400" />
                        <span>Authentic local experiences</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-secondary">
                        <CheckCircle className="h-4 w-4 text-yellow-400" />
                        <span>Updated, real-world tips</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <span className="bg-yellow-500 text-black px-4 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2">
                    Find Local Advisor
                    <Users className="h-4 w-4" />
                  </span>
                </div>
              </button>
            </div>

            {/* Quick tip */}
            <div className="mt-6 glass-card p-4 bg-white/5">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-secondary">
                    <strong className="text-primary">Pro tip:</strong> Start with AI planning for a quick overview, then enhance it with a local advisor for authentic experiences and hidden gems!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Planning Form - Only show when in AI mode */}
        {planningMode === 'ai' && !isGenerating && (
        <div className="max-w-4xl mx-auto">
          {/* Back to choice button */}
          <button
            onClick={() => setPlanningMode('choice')}
            className="mb-4 flex items-center text-secondary hover:text-primary touch-manipulation"
          >
            ← Back to planning options
          </button>
          {/* Enhanced Planning Form - mobile responsive */}
          <div ref={formRef} className="glass-card p-4 sm:p-6 md:p-8 rounded-lg sm:rounded-xl">
            <h2 className="text-xl sm:text-2xl font-bold text-primary mb-4 sm:mb-6 md:mb-8">
              Plan Your Journey
            </h2>

            <div className="space-y-4 sm:space-y-5 md:space-y-6">
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
                    className="px-4 py-3 premium-button-primary rounded-xl touch-manipulation touch-target active-scale"
                  >
                    <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.customDestinations.map((dest, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 glass-card text-sm text-primary">
                      {dest}
                      <button
                        onClick={() => removeCustomDestination(index)}
                        className="ml-2 text-red-400 hover:text-red-300 touch-manipulation p-1"
                      >
                        <X className="h-4 w-4 sm:h-3 sm:w-3" />
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
                      className={`p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 text-left transition-colors touch-manipulation touch-target active-scale ${
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
                      className={`p-3 rounded-lg sm:rounded-xl border-2 text-sm sm:text-base font-medium transition-colors touch-manipulation touch-target active-scale ${
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
                    className="px-4 py-3 premium-button-primary rounded-xl touch-manipulation touch-target active-scale"
                  >
                    <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.customActivities.map((activity, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 glass-card text-sm text-primary">
                      {activity}
                      <button
                        onClick={() => removeCustomActivity(index)}
                        className="ml-2 text-red-400 hover:text-red-300 touch-manipulation p-1"
                      >
                        <X className="h-4 w-4 sm:h-3 sm:w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Vibe / Energy Preference */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  Trip Vibe / Energy Level
                </label>
                <select
                  value={formData.vibePreference}
                  onChange={(e) => setFormData(prev => ({ ...prev, vibePreference: e.target.value }))}
                  className="w-full px-4 py-3 glass-input rounded-xl"
                >
                  <option value="chill">Chill & Easy - Slow pace, lots of rest</option>
                  <option value="balanced">Balanced - Mix of activity and relaxation</option>
                  <option value="active">Active - Pack in experiences</option>
                  <option value="intense">Intense - Maximum adventure</option>
                </select>
                <p className="text-xs text-secondary mt-2">
                  AI will naturally adjust activity count based on your energy preference, group type, and day type
                </p>
              </div>

              {/* Arrival & Departure Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Arrival Time (Day 1)
                  </label>
                  <input
                    type="time"
                    value={formData.arrivalTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, arrivalTime: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  />
                  <p className="text-xs text-secondary mt-1">When you'll reach the destination</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Departure Time (Last Day)
                  </label>
                  <input
                    type="time"
                    value={formData.departureTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, departureTime: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  />
                  <p className="text-xs text-secondary mt-1">When you need to leave</p>
                </div>
              </div>

              {/* Activities Per Day - Now Optional Override */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  Activity Count (Optional Override)
                </label>
                <div className="flex items-center space-x-4">
                  <select
                    value={formData.activitiesPerDay}
                    onChange={(e) => setFormData(prev => ({ ...prev, activitiesPerDay: parseInt(e.target.value) }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="0">🤖 Auto (AI decides based on energy & context)</option>
                    <option value="1">1 activity per day (very light)</option>
                    <option value="2">2 activities per day (light)</option>
                    <option value="3">3 activities per day (moderate)</option>
                    <option value="4">4 activities per day (active)</option>
                    <option value="5">5+ activities per day (packed)</option>
                  </select>
                </div>
                <p className="text-xs text-secondary mt-2">
                  {formData.activitiesPerDay === 0 
                    ? 'AI will naturally determine activities based on group type, energy, arrival/departure times, and day type' 
                    : `Fixed at ${formData.activitiesPerDay} activities per day (overrides AI judgment)`}
                </p>
              </div>

              {/* Group Type */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  Group Composition
                </label>
                <select
                  value={formData.groupType}
                  onChange={(e) => setFormData(prev => ({ ...prev, groupType: e.target.value }))}
                  className="w-full px-4 py-3 glass-input rounded-xl"
                >
                  <option value="friends">Friends</option>
                  <option value="couples">Couples</option>
                  <option value="family-kids">Family (with Kids)</option>
                  <option value="solo">Solo Traveler</option>
                </select>
              </div>

              {/* Trip Intent */}
              <div>
                <label className="block text-sm font-medium text-secondary mb-3">
                  Trip Intent / Purpose
                </label>
                <select
                  value={formData.tripIntent}
                  onChange={(e) => setFormData(prev => ({ ...prev, tripIntent: e.target.value }))}
                  className="w-full px-4 py-3 glass-input rounded-xl"
                >
                  <option value="exploration">Exploration & Discovery</option>
                  <option value="celebration">Celebration</option>
                  <option value="honeymoon">Honeymoon</option>
                  <option value="relaxation">Relaxation & Rejuvenation</option>
                  <option value="adventure">Adventure & Thrills</option>
                  <option value="business">Business & Leisure</option>
                  <option value="spiritual">Spiritual Journey</option>
                </select>
              </div>

              {/* Budget Tier & Comfort Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Budget Tier
                  </label>
                  <select
                    value={formData.budgetTier}
                    onChange={(e) => setFormData(prev => ({ ...prev, budgetTier: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="budget">Budget</option>
                    <option value="mid-range">Mid-Range</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Comfort Level
                  </label>
                  <select
                    value={formData.comfortLevel}
                    onChange={(e) => setFormData(prev => ({ ...prev, comfortLevel: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="basic">Basic</option>
                    <option value="comfortable">Comfortable</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
              </div>

              {/* Crowd Tolerance & Food Preference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Crowd Tolerance
                  </label>
                  <select
                    value={formData.crowdTolerance}
                    onChange={(e) => setFormData(prev => ({ ...prev, crowdTolerance: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="avoid-crowds">Avoid Crowds</option>
                    <option value="moderate">Moderate</option>
                    <option value="love-crowds">Love Crowds</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Food Preference
                  </label>
                  <select
                    value={formData.foodPreference}
                    onChange={(e) => setFormData(prev => ({ ...prev, foodPreference: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="no-preference">No Preference</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="non-vegetarian">Non-Vegetarian</option>
                    <option value="vegan">Vegan</option>
                  </select>
                </div>
              </div>

              {/* Plan Rigidity & Cultural Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Plan Flexibility
                  </label>
                  <select
                    value={formData.planRigidity}
                    onChange={(e) => setFormData(prev => ({ ...prev, planRigidity: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="flexible">Flexible</option>
                    <option value="balanced">Balanced</option>
                    <option value="strict">Strict Schedule</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Cultural Notes Required
                  </label>
                  <div className="flex items-center space-x-3 mt-3">
                    <input
                      type="checkbox"
                      checked={formData.culturalNotesRequired}
                      onChange={(e) => setFormData(prev => ({ ...prev, culturalNotesRequired: e.target.checked }))}
                      className="w-5 h-5 accent-white"
                    />
                    <span className="text-secondary">Include cultural context & local customs</span>
                  </div>
                </div>
              </div>

              {/* Travel Experience & First Visit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    Travel Experience
                  </label>
                  <select
                    value={formData.travelMaturity}
                    onChange={(e) => setFormData(prev => ({ ...prev, travelMaturity: e.target.value }))}
                    className="w-full px-4 py-3 glass-input rounded-xl"
                  >
                    <option value="first_timer">First-Time Traveler</option>
                    <option value="experienced">Experienced Traveler</option>
                  </select>
                  <p className="text-xs text-secondary mt-2">
                    {formData.travelMaturity === 'first_timer' 
                      ? 'Clear directions, iconic spots, beginner-friendly' 
                      : 'Offbeat experiences, less hand-holding'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-3">
                    First Visit to Destination?
                  </label>
                  <div className="flex items-center space-x-3 mt-3">
                    <input
                      type="checkbox"
                      checked={formData.isFirstVisit}
                      onChange={(e) => setFormData(prev => ({ ...prev, isFirstVisit: e.target.checked }))}
                      className="w-5 h-5 accent-white"
                    />
                    <span className="text-secondary">This is my first time visiting this destination</span>
                  </div>
                  <p className="text-xs text-secondary mt-2">
                    {formData.isFirstVisit 
                      ? 'Will include must-see iconic experiences' 
                      : 'Focus on new & unexplored spots'}
                  </p>
                </div>
              </div>

              {/* Generate Button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                onClick={generateItinerary}
                disabled={isGenerating}
                className="w-full premium-button-primary py-4 text-base sm:text-lg font-semibold rounded-lg sm:rounded-xl disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation touch-target active-scale"
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
                  className="w-full premium-button-secondary py-4 text-base sm:text-lg font-semibold rounded-lg sm:rounded-xl disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation touch-target active-scale"
                >
                  Regenerate Plan
                </button>
              </div>

              {/* Enhance with Local Advisor - after AI generation */}
              <div className="mt-6 glass-card p-4 bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-6 w-6 text-yellow-400" />
                    <div>
                      <p className="font-semibold text-primary">Want authentic local experiences?</p>
                      <p className="text-sm text-secondary">Enhance your AI plan with insights from a verified local advisor</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAdvisorPlanType('enhance_plan');
                      setPlanningMode('advisor_select');
                    }}
                    className="bg-yellow-500 text-black px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 touch-manipulation whitespace-nowrap"
                  >
                    <Users className="h-4 w-4" />
                    Find Local Advisor
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default TripPlannerPage;