import React, { useState } from 'react';
import { ArrowLeft, Calendar, MapPin, Users, Wallet, Heart, Send, CheckCircle, Star, Clock, MessageCircle, Sparkles } from 'lucide-react';
import { TravelAdvisor, createPlanRequest, AdvisorPlanRequest } from '../../services/advisorRepository';
import { useAuth } from '../../hooks/useAuth';
import { INDIAN_CITIES, TRAVEL_INTERESTS } from '../../utils/constants';
import { AiTripPlanData } from '../../services/api';

interface AdvisorPlanRequestPageProps {
  advisor: TravelAdvisor;
  mode: 'new_plan' | 'enhance_plan';
  existingPlan?: AiTripPlanData;
  onBack: () => void;
  onRequestSubmitted: (requestId: string) => void;
}

const AdvisorPlanRequestPage: React.FC<AdvisorPlanRequestPageProps> = ({
  advisor,
  mode,
  existingPlan,
  onBack,
  onRequestSubmitted,
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  // Form state for new plan
  const [formData, setFormData] = useState({
    from: existingPlan?.overview?.from || 'Bangalore',
    to: existingPlan?.overview?.to || advisor.city,
    startDate: '',
    endDate: '',
    budget: existingPlan?.overview?.budgetINR || 15000,
    travelers: existingPlan?.overview?.travelers || 2,
    interests: (existingPlan?.overview?.interests || []) as string[],
    tripStyle: '',
    specialRequests: '',
  });

  // Preferred experiences for enhancement
  const [preferredExperiences, setPreferredExperiences] = useState<string[]>([]);

  const experienceOptions = [
    { id: 'hidden_gems', label: 'Hidden Gems', icon: '💎', description: 'Off-the-beaten-path spots' },
    { id: 'local_food', label: 'Local Food', icon: '🍽️', description: 'Authentic local cuisine' },
    { id: 'cultural', label: 'Cultural Experiences', icon: '🏛️', description: 'Local traditions & customs' },
    { id: 'nature', label: 'Nature & Outdoors', icon: '🌿', description: 'Parks, trails, views' },
    { id: 'nightlife', label: 'Nightlife', icon: '🌙', description: 'Local bars, clubs, events' },
    { id: 'shopping', label: 'Local Shopping', icon: '🛍️', description: 'Markets & local crafts' },
    { id: 'photography', label: 'Photography Spots', icon: '📸', description: 'Best photo locations' },
    { id: 'budget_tips', label: 'Budget Tips', icon: '💰', description: 'Save money like a local' },
  ];

  const handleInterestToggle = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(interest)
        ? prev.interests.filter(i => i !== interest)
        : [...prev.interests, interest]
    }));
  };

  const handleExperienceToggle = (experienceId: string) => {
    setPreferredExperiences(prev =>
      prev.includes(experienceId)
        ? prev.filter(e => e !== experienceId)
        : [...prev, experienceId]
    );
  };

  const handleSubmit = async () => {
    if (!user) {
      alert('Please sign in to request a plan from an advisor.');
      return;
    }

    if (mode === 'new_plan') {
      if (!formData.startDate || !formData.endDate) {
        alert('Please select travel dates');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // For prototype, simulate request creation
      const mockRequestId = `request-${Date.now()}`;
      
      // Try to create in database (will fail gracefully if tables don't exist)
      try {
        const dbRequestId = await createPlanRequest({
          userId: user.uid,
          advisorId: advisor.id,
          requestType: mode,
          tripDetails: mode === 'new_plan' ? {
            from: formData.from,
            to: formData.to,
            startDate: formData.startDate,
            endDate: formData.endDate,
            budget: formData.budget,
            travelers: formData.travelers,
            interests: formData.interests,
            tripStyle: formData.tripStyle,
            specialRequests: formData.specialRequests,
          } : undefined,
          originalPlanData: mode === 'enhance_plan' ? existingPlan : undefined,
          specialRequests: formData.specialRequests,
          preferredExperiences,
        });

        if (dbRequestId) {
          setRequestId(dbRequestId);
        } else {
          setRequestId(mockRequestId);
        }
      } catch (e) {
        console.log('Using mock request ID (DB not available)');
        setRequestId(mockRequestId);
      }

      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen p-3 sm:p-6 md:p-8 pb-safe">
        <div className="content-container max-w-2xl mx-auto">
          <div className="glass-card p-8 text-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-primary mb-4">Request Submitted! 🎉</h2>
            <p className="text-secondary mb-6">
              Your {mode === 'new_plan' ? 'plan request' : 'enhancement request'} has been sent to <strong>{advisor.name}</strong>.
            </p>
            
            <div className="glass-card p-4 mb-6 text-left">
              <div className="flex items-center gap-4 mb-4">
                <img
                  src={advisor.photoUrl}
                  alt={advisor.name}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <div className="font-semibold text-primary">{advisor.name}</div>
                  <div className="text-sm text-secondary">{advisor.city}, {advisor.state}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-secondary">Expected Response</div>
                  <div className="font-semibold text-primary flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Within {advisor.responseTimeHours} hours
                  </div>
                </div>
                <div>
                  <div className="text-secondary">Price</div>
                  <div className="font-semibold text-primary">
                    ₹{mode === 'new_plan' ? advisor.pricePerPlan : advisor.pricePerEnhancement}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-secondary">
                📧 You'll receive a notification when {advisor.name} responds.
              </p>
              <p className="text-sm text-secondary">
                💬 For this prototype demo, the plan will be generated automatically.
              </p>
            </div>

            <div className="mt-8 flex gap-4 justify-center">
              <button
                onClick={() => onRequestSubmitted(requestId || '')}
                className="premium-button-primary px-6 py-3 rounded-xl font-semibold touch-manipulation"
              >
                View Demo Plan
              </button>
              <button
                onClick={onBack}
                className="premium-button-secondary px-6 py-3 rounded-xl touch-manipulation"
              >
                Back to Advisors
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-6 md:p-8 pb-safe">
      <div className="content-container max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-secondary hover:text-primary mb-4 touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back to Advisors
          </button>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-primary mb-2">
            {mode === 'new_plan' ? '📝 Request a Local Plan' : '✨ Enhance Your Plan'}
          </h1>
          <p className="text-secondary">
            {mode === 'new_plan' 
              ? `Get a personalized trip plan created by ${advisor.name}`
              : `Let ${advisor.name} add local magic to your AI-generated plan`
            }
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Trip Details (for new plan) */}
            {mode === 'new_plan' && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Trip Details
                </h2>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">From City</label>
                      <select
                        value={formData.from}
                        onChange={(e) => setFormData(prev => ({ ...prev, from: e.target.value }))}
                        className="w-full px-4 py-3 glass-input rounded-xl"
                      >
                        {INDIAN_CITIES.map(city => (
                          <option key={city.name} value={city.name}>{city.name}, {city.state}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">To City</label>
                      <input
                        type="text"
                        value={formData.to}
                        onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
                        className="w-full px-4 py-3 glass-input rounded-xl"
                        placeholder="Destination city"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        <Calendar className="h-4 w-4 inline mr-1" />
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
                      <label className="block text-sm font-medium text-secondary mb-2">
                        <Calendar className="h-4 w-4 inline mr-1" />
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        <Wallet className="h-4 w-4 inline mr-1" />
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
                      <div className="text-center text-lg font-semibold text-primary mt-2">
                        ₹{formData.budget.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        <Users className="h-4 w-4 inline mr-1" />
                        Travelers
                      </label>
                      <select
                        value={formData.travelers}
                        onChange={(e) => setFormData(prev => ({ ...prev, travelers: parseInt(e.target.value) }))}
                        className="w-full px-4 py-3 glass-input rounded-xl"
                      >
                        {[1,2,3,4,5,6,7,8].map(num => (
                          <option key={num} value={num}>{num} {num === 1 ? 'Person' : 'People'}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-3">
                      <Heart className="h-4 w-4 inline mr-1" />
                      Interests
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {TRAVEL_INTERESTS.map(interest => (
                        <button
                          key={interest.id}
                          onClick={() => handleInterestToggle(interest.id)}
                          className={`p-2 rounded-lg border text-sm transition-colors touch-manipulation ${
                            formData.interests.includes(interest.id)
                              ? 'border-white bg-white/20 text-primary'
                              : 'border-white/20 text-secondary hover:border-white/40'
                          }`}
                        >
                          {interest.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Enhancement Preferences (for enhance plan) */}
            {mode === 'enhance_plan' && existingPlan && (
              <div className="glass-card p-6">
                <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Your Current Plan
                </h2>
                <div className="bg-white/5 p-4 rounded-xl mb-4">
                  <div className="font-semibold text-primary mb-2">
                    {existingPlan.overview.from} → {existingPlan.overview.to}
                  </div>
                  <div className="text-sm text-secondary">
                    {existingPlan.overview.durationDays} Days • {existingPlan.overview.travelers} Travelers • ₹{existingPlan.overview.budgetINR.toLocaleString('en-IN')}
                  </div>
                  <div className="text-sm text-secondary mt-1">
                    {existingPlan.days.length} days of activities planned
                  </div>
                </div>
                <p className="text-sm text-secondary">
                  {advisor.name} will enhance this plan with local insights, hidden gems, and authentic experiences.
                </p>
              </div>
            )}

            {/* Preferred Experiences */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                ✨ What Would You Like Added?
              </h2>
              <p className="text-sm text-secondary mb-4">
                Select the types of local experiences you want {advisor.name} to add
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {experienceOptions.map(exp => (
                  <button
                    key={exp.id}
                    onClick={() => handleExperienceToggle(exp.id)}
                    className={`p-3 rounded-xl border text-left transition-all touch-manipulation ${
                      preferredExperiences.includes(exp.id)
                        ? 'border-white bg-white/20'
                        : 'border-white/20 hover:border-white/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{exp.icon}</span>
                      <span className="font-semibold text-primary">{exp.label}</span>
                    </div>
                    <div className="text-xs text-secondary">{exp.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Special Requests */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-bold text-primary mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Special Requests
              </h2>
              <textarea
                value={formData.specialRequests}
                onChange={(e) => setFormData(prev => ({ ...prev, specialRequests: e.target.value }))}
                placeholder="Tell the advisor about any specific requirements, dietary restrictions, accessibility needs, or special interests..."
                className="w-full h-32 px-4 py-3 glass-input rounded-xl resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full premium-button-primary py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 touch-manipulation disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                  Submitting Request...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Submit Request to {advisor.name}
                </>
              )}
            </button>
          </div>

          {/* Advisor Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-card p-6 sticky top-6">
              <h3 className="text-lg font-bold text-primary mb-4">Your Advisor</h3>
              
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={advisor.photoUrl}
                  alt={advisor.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-white/20"
                />
                <div>
                  <div className="font-semibold text-primary flex items-center gap-1">
                    {advisor.name}
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  <div className="text-sm text-secondary">{advisor.city}, {advisor.state}</div>
                  <div className="flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 text-yellow-400 fill-current" />
                    <span className="text-yellow-400">{advisor.rating}</span>
                    <span className="text-secondary">({advisor.totalReviews})</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Response Time</span>
                  <span className="text-primary font-medium">{advisor.responseTimeHours}h</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Plans Created</span>
                  <span className="text-primary font-medium">{advisor.totalPlansCreated}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Languages</span>
                  <span className="text-primary font-medium">{advisor.languages.slice(0, 2).join(', ')}</span>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="text-sm text-secondary mb-2">Estimated Cost</div>
                <div className="text-2xl font-bold text-primary">
                  ₹{mode === 'new_plan' ? advisor.pricePerPlan : advisor.pricePerEnhancement}
                </div>
                <div className="text-xs text-secondary">
                  {mode === 'new_plan' ? 'for complete plan' : 'for plan enhancement'}
                </div>
              </div>

              <div className="mt-4 p-3 bg-green-500/10 rounded-xl border border-green-500/20">
                <div className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Verified Local Expert
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvisorPlanRequestPage;
