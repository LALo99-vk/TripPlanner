import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Star, MapPin, Clock, ChevronDown, ChevronRight, Sparkles, MessageCircle, ThumbsUp, Calendar, User } from 'lucide-react';
import { TravelAdvisor } from '../../services/advisorRepository';
import { AiTripPlanData } from '../../services/api';

interface AdvisorPlanViewPageProps {
  advisor: TravelAdvisor;
  planType: 'advisor_created' | 'advisor_enhanced';
  requestId: string;
  originalPlan?: AiTripPlanData;
  onBack: () => void;
  onAcceptPlan: (plan: AiTripPlanData) => void;
}

// Generate a mock advisor plan for demo purposes
function generateMockAdvisorPlan(advisor: TravelAdvisor, planType: string, originalPlan?: AiTripPlanData): AiTripPlanData {
  const destination = originalPlan?.overview?.to || advisor.city;
  const from = originalPlan?.overview?.from || 'Bangalore';
  const budget = originalPlan?.overview?.budgetINR || 15000;
  const travelers = originalPlan?.overview?.travelers || 2;
  const durationDays = originalPlan?.days?.length || 3;

  // Local insights to add
  const localInsights = [
    `💎 ${advisor.name}'s insider tip: Visit early morning to avoid crowds and get the best photos`,
    `🍽️ Local favorite: Try the authentic street food at the small stall near the main entrance`,
    `📸 Hidden spot: There's a beautiful viewpoint 5 mins walk from here that most tourists miss`,
    `🕐 Best time: Sunset here is magical - arrive 30 mins before for the best experience`,
  ];

  const hiddenGems = [
    { name: `Secret Garden (${advisor.name}'s Pick)`, description: 'A hidden oasis known only to locals' },
    { name: 'Local Artisan Market', description: 'Weekly market with authentic handcrafts' },
    { name: 'Grandmother\'s Kitchen', description: 'Home-style cooking in a local\'s home' },
  ];

  // Create enhanced/new plan
  const plan: AiTripPlanData = {
    overview: {
      from,
      to: destination,
      durationDays,
      travelers,
      budgetINR: budget,
      summary: planType === 'advisor_enhanced' 
        ? `Your AI plan enhanced by ${advisor.name} with local insights, hidden gems, and authentic experiences!`
        : `A personalized ${durationDays}-day itinerary crafted by ${advisor.name}, featuring hidden gems, local food spots, and authentic experiences only a local would know.`,
      interests: originalPlan?.overview?.interests || advisor.specialties,
    },
    days: Array.from({ length: durationDays }, (_, i) => ({
      day: i + 1,
      header: i === 0 ? `Welcome to ${destination}` : i === durationDays - 1 ? 'Farewell & Hidden Gems' : `Exploring Local ${destination}`,
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      totalDayCostINR: Math.round(budget / durationDays),
      weather: {
        temperature: 28 + Math.floor(Math.random() * 5),
        condition: 'Partly Cloudy',
        description: 'Pleasant weather for exploration',
        icon: '⛅',
      },
      slots: {
        morning: [
          {
            name: i === 0 ? `${advisor.name}'s Favorite Breakfast Spot` : `Hidden Temple (${advisor.name}'s Secret)`,
            time: '08:00',
            duration: '2 hours',
            description: i === 0 
              ? `Start your day like a local! This family-run place has been serving authentic ${destination} breakfast for 40 years. ${advisor.name} says: "Order the special thali - it's not on the menu but they'll make it if you ask!"`
              : `A 200-year-old temple hidden in the old quarter. ${advisor.name} shares: "Come early for the morning prayers - the atmosphere is incredible and you'll have it almost to yourself."`,
            location: `${destination} Old Town`,
            costINR: 200,
            travelDistanceKm: i + 2,
            transportMode: 'Auto-rickshaw',
            transportCostINR: 100,
            localInsight: localInsights[i % localInsights.length],
            advisorNote: `🌟 ${advisor.name}'s pick: This is one of my absolute favorites!`,
          },
        ],
        afternoon: [
          {
            name: hiddenGems[i % hiddenGems.length].name,
            time: '13:00',
            duration: '3 hours',
            description: hiddenGems[i % hiddenGems.length].description + ` ${advisor.name} adds: "This place changed my perspective on ${destination}. Give it time and soak in the atmosphere."`,
            location: `${destination} Local Area`,
            costINR: 500,
            travelDistanceKm: 5,
            transportMode: 'Walking + Auto',
            transportCostINR: 150,
            localInsight: `🏠 Local tip: The owner is a friend of mine. Mention my name for a special experience!`,
            advisorNote: `💡 ${advisor.name}: Most tourists never find this place. You're in for a treat!`,
          },
          {
            name: 'Local Artisan Workshop',
            time: '16:00',
            duration: '1.5 hours',
            description: `Meet local craftspeople and learn traditional techniques. ${advisor.name}: "My uncle runs this workshop. He loves sharing his craft with curious visitors!"`,
            location: `${destination} Craft District`,
            costINR: 300,
            travelDistanceKm: 2,
            transportMode: 'Walking',
            transportCostINR: 0,
            localInsight: '🎨 Insider: Ask to try your hand at the craft - they usually let visitors try!',
          },
        ],
        evening: [
          {
            name: `${advisor.name}'s Dinner Recommendation`,
            time: '19:00',
            duration: '2 hours',
            description: `An authentic local dining experience. ${advisor.name} reveals: "This is where my family celebrates special occasions. The chef has been cooking here for 30 years and knows my preferences. I'll let them know you're coming!"`,
            location: `${destination} Local Neighborhood`,
            costINR: 800,
            travelDistanceKm: 3,
            transportMode: 'Auto-rickshaw',
            transportCostINR: 100,
            foodRecommendation: 'Must try: The house special (ask for it by name: "Family Thali")',
            localInsight: '🍽️ Secret menu item: Ask for the "grandmother\'s recipe" - it\'s not advertised but locals know!',
            advisorNote: `⭐ ${advisor.name}: I've already called ahead. They'll prepare something special for you!`,
          },
        ],
      },
      aiTip: `${advisor.name}'s day tip: Don't rush today. The best experiences in ${destination} come when you slow down and connect with locals.`,
    })),
    totals: {
      totalCostINR: budget,
      breakdown: {
        stay: Math.round(budget * 0.35),
        food: Math.round(budget * 0.25),
        transport: Math.round(budget * 0.15),
        activities: Math.round(budget * 0.2),
        misc: Math.round(budget * 0.05),
      },
    },
    // Custom fields for advisor plans
    advisorInfo: {
      advisorId: advisor.id,
      advisorName: advisor.name,
      advisorCity: advisor.city,
      advisorRating: advisor.rating,
      planType,
      createdAt: new Date().toISOString(),
      localInsightsAdded: localInsights.length,
      hiddenGemsAdded: hiddenGems.length,
    },
  } as AiTripPlanData & { advisorInfo: any };

  return plan;
}

const AdvisorPlanViewPage: React.FC<AdvisorPlanViewPageProps> = ({
  advisor,
  planType,
  requestId,
  originalPlan,
  onBack,
  onAcceptPlan,
}) => {
  const [plan, setPlan] = useState<AiTripPlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    // Simulate loading time for demo
    setTimeout(() => {
      const generatedPlan = generateMockAdvisorPlan(advisor, planType, originalPlan);
      setPlan(generatedPlan);
      setLoading(false);
    }, 1500);
  }, [advisor, planType, originalPlan]);

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen p-3 sm:p-6 md:p-8 pb-safe flex items-center justify-center">
        <div className="glass-card p-8 text-center max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-6"></div>
          <h2 className="text-xl font-bold text-primary mb-2">
            {planType === 'advisor_enhanced' ? 'Enhancing Your Plan...' : 'Creating Your Plan...'}
          </h2>
          <p className="text-secondary">
            {advisor.name} is adding local magic to your itinerary ✨
          </p>
          <div className="mt-4 text-sm text-secondary">
            Adding hidden gems, local food spots, and insider tips...
          </div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="glass-card p-8 text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold text-primary mb-2">Plan Not Found</h2>
          <button onClick={onBack} className="premium-button-secondary px-6 py-2 rounded-lg mt-4">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const advisorInfo = (plan as any).advisorInfo;

  return (
    <div className="min-h-screen p-3 sm:p-6 md:p-8 pb-safe">
      <div className="content-container max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-secondary hover:text-primary mb-4 touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>
        </div>

        {/* Plan Created Banner */}
        <div className="glass-card p-6 mb-6 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-primary">
                  {planType === 'advisor_enhanced' ? 'Your Plan Has Been Enhanced! ✨' : 'Your Local Plan is Ready! 🎉'}
                </h2>
                <p className="text-secondary">
                  Created by <strong>{advisor.name}</strong> • Local Expert in {advisor.city}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <img
                src={advisor.photoUrl}
                alt={advisor.name}
                className="w-10 h-10 rounded-full border-2 border-green-400"
              />
              <div className="text-sm">
                <div className="flex items-center gap-1 text-yellow-400">
                  <Star className="h-4 w-4 fill-current" />
                  {advisor.rating}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* What Was Added */}
        {advisorInfo && (
          <div className="glass-card p-6 mb-6">
            <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" />
              What {advisor.name} Added to Your Plan
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="glass-card p-3 text-center">
                <div className="text-2xl font-bold text-primary">{advisorInfo.localInsightsAdded}</div>
                <div className="text-xs text-secondary">Local Insights</div>
              </div>
              <div className="glass-card p-3 text-center">
                <div className="text-2xl font-bold text-primary">{advisorInfo.hiddenGemsAdded}</div>
                <div className="text-xs text-secondary">Hidden Gems</div>
              </div>
              <div className="glass-card p-3 text-center">
                <div className="text-2xl font-bold text-primary">{plan.days.length * 3}</div>
                <div className="text-xs text-secondary">Local Tips</div>
              </div>
              <div className="glass-card p-3 text-center">
                <div className="text-2xl font-bold text-primary">100%</div>
                <div className="text-xs text-secondary">Authentic</div>
              </div>
            </div>
          </div>
        )}

        {/* Plan Overview */}
        <div className="glass-card p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-2xl font-bold text-primary mb-1">
                {plan.overview.from} → {plan.overview.to}
              </h2>
              <div className="text-secondary">
                {plan.overview.durationDays} Days • {plan.overview.travelers} Travelers • ₹{plan.overview.budgetINR.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full flex items-center gap-1">
                <User className="h-3 w-3" />
                By {advisor.name}
              </span>
            </div>
          </div>
          <p className="text-secondary">{plan.overview.summary}</p>
        </div>

        {/* Budget Breakdown */}
        <div className="glass-card p-6 mb-6">
          <div className="text-lg font-semibold mb-2">Total Trip Cost: ₹{plan.totals.totalCostINR.toLocaleString('en-IN')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div>Stay: ₹{plan.totals.breakdown.stay.toLocaleString('en-IN')}</div>
            <div>Food: ₹{plan.totals.breakdown.food.toLocaleString('en-IN')}</div>
            <div>Transport: ₹{plan.totals.breakdown.transport.toLocaleString('en-IN')}</div>
            <div>Activities: ₹{plan.totals.breakdown.activities.toLocaleString('en-IN')}</div>
            <div>Misc: ₹{plan.totals.breakdown.misc.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {/* Day-by-Day Itinerary */}
        <div className="space-y-4 mb-6">
          {plan.days.map((d) => (
            <div key={d.day} className="glass-card overflow-hidden">
              <button
                onClick={() => toggleDay(d.day)}
                className="w-full p-4 sm:p-6 text-left flex items-center justify-between hover:bg-white/5 transition-colors touch-manipulation"
              >
                <div>
                  <div className="text-lg sm:text-xl font-bold text-primary">Day {d.day}: {d.header}</div>
                  <div className="text-sm text-secondary mt-1">
                    {d.date && <span>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} • </span>}
                    {(d.slots.morning?.length || 0) + (d.slots.afternoon?.length || 0) + (d.slots.evening?.length || 0)} activities • ₹{Number(d.totalDayCostINR || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                {expandedDays.has(d.day) ? <ChevronDown className="h-6 w-6 text-secondary" /> : <ChevronRight className="h-6 w-6 text-secondary" />}
              </button>
              
              {expandedDays.has(d.day) && (
                <div className="px-4 sm:px-6 pb-6 space-y-6">
                  {([
                    { label: '🌅 Morning', items: d.slots.morning },
                    { label: '🌞 Afternoon', items: d.slots.afternoon },
                    { label: '🌙 Evening', items: d.slots.evening },
                  ] as { label: string; items: any[] | undefined }[]).map((slot, idx) => (
                    <div key={idx}>
                      <div className="font-semibold text-primary mb-3">{slot.label}</div>
                      <div className="space-y-4">
                        {(slot.items || []).map((it, index) => (
                          <div key={index} className="glass-card p-4">
                            <div className="flex items-start gap-4">
                              <div className="flex-shrink-0 w-10 h-10 glass-card rounded-full flex items-center justify-center text-lg">📍</div>
                              <div className="flex-grow">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="font-bold text-primary">{it.name}</div>
                                  <div className="text-sm font-semibold text-primary">₹{Number(it.costINR || 0).toLocaleString('en-IN')}</div>
                                </div>
                                <div className="flex items-center text-sm text-secondary mb-2">
                                  <Clock className="h-4 w-4 mr-1" />
                                  {it.time && <span className="font-semibold text-primary mr-2">{it.time}</span>}
                                  <span>{it.duration} • {it.location}</span>
                                </div>
                                <div className="text-sm text-secondary mb-3">{it.description}</div>
                                
                                {/* Advisor's Local Insight */}
                                {it.localInsight && (
                                  <div className="bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 rounded-lg mb-2">
                                    <div className="text-xs font-semibold text-yellow-400 mb-1 flex items-center gap-1">
                                      <Sparkles className="h-3 w-3" />
                                      Local Insight from {advisor.name}
                                    </div>
                                    <div className="text-sm text-primary">{it.localInsight}</div>
                                  </div>
                                )}
                                
                                {/* Advisor's Note */}
                                {it.advisorNote && (
                                  <div className="bg-green-500/10 border border-green-500/20 px-3 py-2 rounded-lg mb-2">
                                    <div className="text-sm text-green-400">{it.advisorNote}</div>
                                  </div>
                                )}
                                
                                {it.foodRecommendation && (
                                  <div className="text-xs text-primary bg-white/10 px-3 py-2 rounded-lg inline-block">
                                    🍽️ {it.foodRecommendation}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {d.aiTip && (
                    <div className="glass-card p-3 text-sm text-secondary bg-white/5">
                      💡 {d.aiTip}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="glass-card p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => onAcceptPlan(plan)}
              className="flex-1 premium-button-primary py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 touch-manipulation"
            >
              <ThumbsUp className="h-5 w-5" />
              Accept This Plan
            </button>
            <button
              onClick={onBack}
              className="flex-1 premium-button-secondary py-4 rounded-xl font-semibold touch-manipulation"
            >
              Back to Advisors
            </button>
          </div>
          <p className="text-xs text-secondary text-center mt-4">
            By accepting, this plan will be saved to your profile and can be shared with your group.
          </p>
        </div>

        {/* Advisor Info Footer */}
        <div className="glass-card p-6 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src={advisor.photoUrl}
                alt={advisor.name}
                className="w-12 h-12 rounded-full"
              />
              <div>
                <div className="font-semibold text-primary flex items-center gap-1">
                  {advisor.name}
                  <CheckCircle className="h-4 w-4 text-green-400" />
                </div>
                <div className="text-sm text-secondary">Local Expert • {advisor.city}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-yellow-400">
                <Star className="h-5 w-5 fill-current" />
                <span className="font-bold">{advisor.rating}</span>
              </div>
              <div className="text-xs text-secondary">{advisor.totalReviews} reviews</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvisorPlanViewPage;
