import React, { useEffect, useState } from 'react';
import { planStore } from '../../services/planStore';
import { AiTripPlanData } from '../../services/api';
import { ChevronDown, ChevronRight, Clock, Download, Link2, Save, Star, CheckCircle, Sparkles, User } from 'lucide-react';
import { useWeatherForecast } from '../../services/weatherService';
import { generateWeatherRecommendation } from '../../services/recommendationService';
import WeatherCard from '../Weather/WeatherCard';
import { auth } from '../../config/firebase';
import { saveUserPlan } from '../../services/planRepository';

const YourPlanPage: React.FC = () => {
  const [plan, setPlan] = useState<AiTripPlanData | null>(planStore.getPlan());
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [weatherSuggestions, setWeatherSuggestions] = useState<Map<number, string>>(new Map());
  
  // Extract destination from plan - using the correct 'to' field from AiPlanOverview
  const destination = plan?.overview?.to?.split(',')[0] || '';
  
  // Log destination for debugging
  console.log('Destination for weather:', destination);

  // Fetch weather data
  const { forecast, loading, error } = useWeatherForecast(destination, 10800000); // Update every 3 hours
  
  // Log weather data for debugging
  useEffect(() => {
    console.log('Weather data status:', { destination, forecast, loading, error });
    if (plan && plan.days) {
      console.log('Plan weather check:');
      plan.days.forEach(day => {
        console.log(`  Day ${day.day}:`, day.weather ? `${day.weather.temperature}°C ${day.weather.condition}` : 'NO WEATHER DATA');
      });
    }
  }, [destination, forecast, loading, error, plan]);

  useEffect(() => {
    const unsub = planStore.subscribe(() => setPlan(planStore.getPlan()));
    return unsub;
  }, []);
  
  // One-time tip after redirect
  useEffect(() => {
    try {
      const tip = localStorage.getItem('show_yourplan_tip');
      if (tip) {
        alert('Your plan is ready on this page. Tip: You can save it to your profile or export a PDF.');
        localStorage.removeItem('show_yourplan_tip');
      }
    } catch {}
  }, []);
  
  // Generate weather-based recommendations when forecast or plan changes
  useEffect(() => {
    if (forecast && plan) {
      const newSuggestions = new Map<number, string>();
      
      plan.days.forEach((day) => {
        // Find matching weather data for this day
        // For demo purposes, we'll use the forecast index matching the day number (with bounds checking)
        const forecastIndex = Math.min(day.day - 1, forecast.daily.length - 1);
        if (forecastIndex >= 0) {
          const dayWeather = forecast.daily[forecastIndex];
          const suggestion = generateWeatherRecommendation(dayWeather, day);
          newSuggestions.set(day.day, suggestion);
        }
      });
      
      setWeatherSuggestions(newSuggestions);
    }
  }, [forecast, plan]);

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  const mapLink = (location: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

  const handleDownloadPdf = async () => {
    // Simple client-side print-to-PDF
    window.print();
  };

  const handleShareLink = () => {
    const id = planStore.savePlanToLibrary();
    const url = `${window.location.origin}${window.location.pathname}?planId=${encodeURIComponent(id)}`;
    navigator.clipboard.writeText(url);
    alert('Share link copied to clipboard');
  };

  const handleSaveProfile = () => {
    planStore.savePlanToLibrary();
    alert('Saved to your profile (local library).');
  };

  const handleSaveToFirestore = async () => {
    if (!plan) { alert('No plan to save'); return; }
    const user = auth.currentUser;
    if (!user) { alert('Please sign in to save plans to your profile.'); return; }
    const name = window.prompt('Enter a name for this plan:', `${plan.overview.to} (${plan.overview.durationDays}D)`);
    if (!name) return;
    try {
      await saveUserPlan({
        userId: user.uid,
        plan,
        name,
      });
      alert('Plan saved to your profile in the cloud.');
    } catch (e) {
      console.error(e);
      alert('Failed to save plan. Please try again.');
    }
  };

  if (!plan) {
    return (
      <div className="min-h-screen p-6">
        <div className="content-container">
          <div className="glass-card p-8 text-center">
            <div className="text-xl text-secondary">No plan found. Generate one in Trip Planner.</div>
          </div>
        </div>
      </div>
    );
  }

  // Check if this is an advisor plan
  const advisorInfo = (plan as any).advisorInfo;
  const isAdvisorPlan = !!advisorInfo;

  return (
    <div className="min-h-screen p-3 sm:p-6 pb-safe">
      <div className="content-container space-y-4 sm:space-y-6">
        {/* Advisor Plan Banner */}
        {isAdvisorPlan && (
          <div className="glass-card p-4 sm:p-6 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-primary">
                      {advisorInfo.planType === 'advisor_created' ? 'Local Advisor Plan' : 'AI Plan Enhanced by Local'}
                    </h3>
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  </div>
                  <p className="text-sm text-secondary">
                    Created by <strong>{advisorInfo.advisorName}</strong> • Local Expert in {advisorInfo.advisorCity}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-yellow-400">
                  <Star className="h-5 w-5 fill-current" />
                  <span className="font-bold">{advisorInfo.advisorRating}</span>
                </div>
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                  Verified Local
                </span>
              </div>
            </div>
            {/* What was added */}
            <div className="mt-4 pt-4 border-t border-yellow-500/20 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">{advisorInfo.localInsightsAdded || 0}</div>
                <div className="text-xs text-secondary">Local Insights</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary">{advisorInfo.hiddenGemsAdded || 0}</div>
                <div className="text-xs text-secondary">Hidden Gems</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary">{plan.days.length * 3}</div>
                <div className="text-xs text-secondary">Local Tips</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-primary">100%</div>
                <div className="text-xs text-secondary">Authentic</div>
              </div>
            </div>
          </div>
        )}

        <div className="glass-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-xl sm:text-2xl font-bold text-primary mb-1 flex items-center gap-2">
                Your Plan
                {isAdvisorPlan && (
                  <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Local Expert
                  </span>
                )}
              </div>
              <div className="text-sm sm:text-base text-secondary">{plan.overview.from} → {plan.overview.to} • {plan.overview.durationDays} Days • ₹{plan.overview.budgetINR.toLocaleString('en-IN')}</div>
              <div className="text-sm sm:text-base text-secondary mt-1">Travellers: {plan.overview.travelers} • Interests: {plan.overview.interests.join(', ')}</div>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button onClick={handleDownloadPdf} className="premium-button-primary px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl flex items-center text-sm sm:text-base touch-manipulation touch-target active-scale"><Download className="h-4 w-4 mr-2"/>Download PDF</button>
              <button onClick={handleShareLink} className="premium-button-secondary px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl flex items-center text-sm sm:text-base touch-manipulation touch-target active-scale"><Link2 className="h-4 w-4 mr-2"/>Share</button>
              <button onClick={handleSaveProfile} className="premium-button-secondary px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl flex items-center text-sm sm:text-base touch-manipulation touch-target active-scale"><Save className="h-4 w-4 mr-2"/>Local</button>
              <button onClick={handleSaveToFirestore} className="premium-button-secondary px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl flex items-center text-sm sm:text-base touch-manipulation touch-target active-scale"><Save className="h-4 w-4 mr-2"/>Profile</button>
            </div>
          </div>
          {plan.overview.summary && (
            <p className="text-secondary mt-3">{plan.overview.summary}</p>
          )}
        </div>

        {/* Seasonal Information Card */}
        {plan.seasonalInfo && (plan.seasonalInfo.warnings.length > 0 || plan.seasonalInfo.suggestions.length > 0) && (
          <div className={`glass-card p-4 sm:p-6 border-2 ${
            plan.seasonalInfo.severity === 'unsafe' ? 'border-red-500/50 bg-red-500/10' :
            plan.seasonalInfo.severity === 'caution' ? 'border-yellow-500/50 bg-yellow-500/10' :
            'border-green-500/50 bg-green-500/10'
          }`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl sm:text-3xl">
                {plan.seasonalInfo.severity === 'unsafe' ? '⚠️' :
                 plan.seasonalInfo.severity === 'caution' ? '⚡' :
                 '✅'}
              </span>
              <div className="flex-1">
                <div className="text-lg sm:text-xl font-bold text-primary mb-2">
                  {plan.seasonalInfo.severity === 'unsafe' ? 'Seasonal Safety Warning' :
                   plan.seasonalInfo.severity === 'caution' ? 'Seasonal Advisory' :
                   'Good Seasonal Timing'}
                </div>
                <div className="text-sm sm:text-base text-secondary mb-1">
                  Traveling to <span className="font-semibold">{plan.seasonalInfo.destination}</span> in <span className="font-semibold">{plan.seasonalInfo.month}</span>
                </div>
                
                {plan.seasonalInfo.warnings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {plan.seasonalInfo.warnings.map((warning, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm sm:text-base">
                        <span className="text-yellow-400 mt-0.5">•</span>
                        <span className="text-primary flex-1">{warning}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {plan.seasonalInfo.suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-sm font-semibold text-primary">💡 Recommendations:</div>
                    {plan.seasonalInfo.suggestions.map((suggestion, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm sm:text-base">
                        <span className="text-blue-400 mt-0.5">→</span>
                        <span className="text-secondary flex-1">{suggestion}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="glass-card p-4 sm:p-6">
          <div className="text-base sm:text-lg font-semibold mb-2">Total Trip Cost: ₹{plan.totals.totalCostINR.toLocaleString('en-IN')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-xs sm:text-sm">
            <div>Stay: ₹{plan.totals.breakdown.stay.toLocaleString('en-IN')}</div>
            <div>Food: ₹{plan.totals.breakdown.food.toLocaleString('en-IN')}</div>
            <div>Transport: ₹{plan.totals.breakdown.transport.toLocaleString('en-IN')}</div>
            <div>Activities: ₹{plan.totals.breakdown.activities.toLocaleString('en-IN')}</div>
            <div>Misc: ₹{plan.totals.breakdown.misc.toLocaleString('en-IN')}</div>
          </div>
        </div>

        <div className="space-y-4">
          {plan.days.map((d) => (
            <div key={d.day} className="glass-card overflow-hidden">
              <button onClick={() => toggleDay(d.day)} className="w-full p-4 sm:p-6 text-left flex items-center justify-between hover:bg-white/5 transition-colors touch-manipulation active-scale">
                <div>
                  <div className="text-lg sm:text-xl font-bold text-primary">Day {d.day}: {d.header}</div>
                  <div className="text-sm sm:text-base text-secondary mt-1">
                    {d.date && <span>{new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })} • </span>}
                    {(d.slots.morning?.length || 0) + (d.slots.afternoon?.length || 0) + (d.slots.evening?.length || 0)} activities • ₹{Number(d.totalDayCostINR || 0).toLocaleString('en-IN')}
                    {d.weather && <span> • {d.weather.temperature}°C {d.weather.condition}</span>}
                  </div>
                </div>
                {expandedDays.has(d.day) ? <ChevronDown className="h-6 w-6 text-secondary"/> : <ChevronRight className="h-6 w-6 text-secondary"/>}
              </button>
              {expandedDays.has(d.day) && (
                <div className="px-6 pb-6 space-y-6">
                  {/* Weather Card */}
                  <div>
                    <div className="font-semibold text-primary mb-3">🌤️ Weather & Recommendations</div>
                    {/* Use weather from plan if available, otherwise fall back to forecast */}
                    {d.weather && d.weather.temperature ? (
                      (() => {
                        const suggestion = weatherSuggestions.get(d.day) || 
                          generateWeatherRecommendation({
                            city: destination,
                            date: d.date ? new Date(d.date) : new Date(),
                            temperature: d.weather.temperature,
                            condition: d.weather.condition,
                            icon: d.weather.icon,
                            description: d.weather.description
                          }, d);
                        
                        return (
                          <WeatherCard 
                            weatherData={{
                              city: destination,
                              date: d.date ? new Date(d.date) : new Date(),
                              temperature: d.weather.temperature,
                              condition: d.weather.condition,
                              icon: d.weather.icon,
                              description: d.weather.description
                            }} 
                            suggestion={suggestion}
                          />
                        );
                      })()
                    ) : forecast && forecast.daily && forecast.daily.length > 0 ? (
                      (() => {
                        // Find matching weather data for this day
                        const forecastIndex = Math.min(d.day - 1, forecast.daily.length - 1);
                        if (forecastIndex >= 0 && forecast.daily[forecastIndex]) {
                          const dayWeather = forecast.daily[forecastIndex];
                          const suggestion = weatherSuggestions.get(d.day) || 
                            generateWeatherRecommendation(dayWeather, d);
                          
                          return (
                            <WeatherCard 
                              weatherData={{
                                ...dayWeather,
                                city: destination
                              }} 
                              suggestion={suggestion}
                            />
                          );
                        }
                        return null;
                      })()
                    ) : loading ? (
                      <div className="glass-card p-4 mt-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-lg font-semibold text-primary">🌤️ Weather data loading...</div>
                        </div>
                        <div className="mt-3 p-3 glass-card bg-white/5">
                          <div className="flex items-start">
                            <div className="flex-shrink-0 mr-2">⏳</div>
                            <div className="text-sm text-secondary">
                              Fetching weather information for {destination}...
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="glass-card p-4 mt-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-lg font-semibold text-primary">🌤️ Weather Information</div>
                        </div>
                        <div className="mt-3 p-3 glass-card bg-white/5">
                          <div className="flex items-start">
                            <div className="flex-shrink-0 mr-2">ℹ️</div>
                            <div className="text-sm text-secondary">
                              Weather data is currently unavailable. Plan your activities based on typical weather for {destination} during this season. Check local forecasts closer to your travel dates.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Day Activities */}
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
                            <div className="flex-shrink-0 w-12 h-12 glass-card rounded-full flex items-center justify-center text-xl">📍</div>
                            <div className="flex-grow">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-bold text-primary">{it.name}</div>
                                <div className="text-sm font-semibold text-primary">₹{Number(it.costINR || 0).toLocaleString('en-IN')}</div>
                              </div>
                              <div className="flex items-center text-sm text-secondary mb-2">
                                <Clock className="h-4 w-4 mr-1" />
                                {it.time && (
                                  <span className="font-semibold text-primary mr-2">{it.time}</span>
                                )}
                                <span>{it.duration} • {it.location} • ~{it.travelDistanceKm} km</span>
                              </div>
                              {it.transportMode && (
                                <div className="text-xs text-secondary mb-2">
                                  🚗 Transport: {it.transportMode}
                                  {it.transportCostINR && <span> • ₹{Number(it.transportCostINR).toLocaleString('en-IN')}</span>}
                                </div>
                              )}
                              <div className="text-sm text-secondary mb-2">{it.description}</div>
                              {it.foodRecommendation && (
                                <div className="text-xs text-primary mb-2 bg-white/10 px-3 py-2 rounded-lg inline-block">
                                  🍽️ {it.foodRecommendation}
                                </div>
                              )}
                              {it.localInsight && (
                                <div className="text-xs text-primary mb-2 bg-yellow-500/20 px-3 py-2 rounded-lg">
                                  💎 Local Insight: {it.localInsight}
                                </div>
                              )}
                              {it.highlights && (
                                <div className="text-xs text-secondary mb-2">
                                  ⭐ <span className="font-semibold">Highlights:</span> {it.highlights}
                                </div>
                              )}
                              {it.tips && (
                                <div className="text-xs text-secondary mb-2">
                                  💡 <span className="font-semibold">Tips:</span> {it.tips}
                                </div>
                              )}
                              <div className="flex gap-2 mt-3">
                              {it.location && (
                                <a href={mapLink(it.location)} target="_blank" rel="noreferrer" className="premium-button-secondary px-4 py-2 text-sm rounded-lg inline-block">View on Map</a>
                              )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {(!slot.items || slot.items.length === 0) && (
                          <div className="text-sm text-secondary">No plans for this time.</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {d.aiTip && (
                    <div className="glass-card p-3 text-sm text-secondary">{d.aiTip}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default YourPlanPage;


