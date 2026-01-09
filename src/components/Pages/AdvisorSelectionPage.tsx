import React, { useEffect, useState } from 'react';
import { Star, MapPin, Clock, MessageCircle, CheckCircle, Search, Filter, Globe, ChevronRight, ArrowLeft, Sparkles } from 'lucide-react';
import { TravelAdvisor, getMockAdvisors, getMockAdvisorsByCity, getVerifiedAdvisors, getAdvisorsByCity } from '../../services/advisorRepository';

interface AdvisorSelectionPageProps {
  destination?: string;
  onSelectAdvisor: (advisor: TravelAdvisor) => void;
  onBack: () => void;
  mode: 'new_plan' | 'enhance_plan';
}

const AdvisorSelectionPage: React.FC<AdvisorSelectionPageProps> = ({
  destination,
  onSelectAdvisor,
  onBack,
  mode,
}) => {
  const [advisors, setAdvisors] = useState<TravelAdvisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchCity, setSearchCity] = useState(destination || '');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [minRating, setMinRating] = useState<number>(0);
  const [showFilters, setShowFilters] = useState(false);

  const specialties = ['food', 'culture', 'history', 'adventure', 'beaches', 'nightlife', 'shopping', 'photography', 'trekking', 'nature'];
  const languages = ['English', 'Hindi', 'Tamil', 'Telugu', 'Konkani', 'Rajasthani', 'Pahadi'];

  useEffect(() => {
    loadAdvisors();
  }, []);

  const loadAdvisors = async () => {
    setLoading(true);
    try {
      // Try to fetch from database first
      let data: TravelAdvisor[] = [];
      if (searchCity) {
        data = await getAdvisorsByCity(searchCity);
      } else {
        data = await getVerifiedAdvisors();
      }
      
      // Fall back to mock data if no results
      if (data.length === 0) {
        data = searchCity ? getMockAdvisorsByCity(searchCity) : getMockAdvisors();
      }
      
      setAdvisors(data);
    } catch (error) {
      console.error('Error loading advisors:', error);
      // Use mock data on error
      setAdvisors(searchCity ? getMockAdvisorsByCity(searchCity) : getMockAdvisors());
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadAdvisors();
  };

  const filteredAdvisors = advisors.filter(advisor => {
    if (selectedSpecialty && !advisor.specialties.includes(selectedSpecialty)) return false;
    if (selectedLanguage && !advisor.languages.includes(selectedLanguage)) return false;
    if (minRating > 0 && advisor.rating < minRating) return false;
    return true;
  });

  const getSpecialtyIcon = (specialty: string) => {
    const icons: Record<string, string> = {
      food: '🍽️',
      culture: '🏛️',
      history: '📜',
      adventure: '🏔️',
      beaches: '🏖️',
      nightlife: '🌙',
      shopping: '🛍️',
      photography: '📸',
      trekking: '🥾',
      nature: '🌿',
      local_experiences: '🎭',
    };
    return icons[specialty] || '✨';
  };

  return (
    <div className="min-h-screen p-3 sm:p-6 md:p-8 pb-safe">
      <div className="content-container max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-secondary hover:text-primary mb-4 touch-manipulation"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Back
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-2">
              {mode === 'new_plan' ? '🌍 Find Your Local Travel Advisor' : '✨ Enhance Your Plan with Local Knowledge'}
            </h1>
            <p className="text-base sm:text-lg text-secondary">
              {mode === 'new_plan' 
                ? 'Get a personalized trip plan created by a verified local expert'
                : 'Add hidden gems, local tips, and authentic experiences to your AI-generated plan'
              }
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="glass-card p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-secondary mb-2">
                Search by Destination
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-secondary" />
                  <input
                    type="text"
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    placeholder="e.g., Chennai, Goa, Jaipur..."
                    className="w-full pl-10 pr-4 py-3 glass-input rounded-xl"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="premium-button-primary px-4 py-3 rounded-xl flex items-center touch-manipulation"
                >
                  <Search className="h-5 w-5" />
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`premium-button-secondary px-4 py-3 rounded-xl flex items-center gap-2 touch-manipulation ${showFilters ? 'bg-white/20' : ''}`}
            >
              <Filter className="h-5 w-5" />
              Filters
            </button>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">Specialty</label>
                <select
                  value={selectedSpecialty}
                  onChange={(e) => setSelectedSpecialty(e.target.value)}
                  className="w-full px-4 py-2 glass-input rounded-lg"
                >
                  <option value="">All Specialties</option>
                  {specialties.map(s => (
                    <option key={s} value={s}>{getSpecialtyIcon(s)} {s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full px-4 py-2 glass-input rounded-lg"
                >
                  <option value="">All Languages</option>
                  {languages.map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">Minimum Rating</label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="w-full px-4 py-2 glass-input rounded-lg"
                >
                  <option value={0}>Any Rating</option>
                  <option value={4}>4+ Stars</option>
                  <option value={4.5}>4.5+ Stars</option>
                  <option value={4.8}>4.8+ Stars</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Results Info */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-secondary">
            {filteredAdvisors.length} advisor{filteredAdvisors.length !== 1 ? 's' : ''} found
            {searchCity && ` for "${searchCity}"`}
          </p>
        </div>

        {/* Advisors Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          </div>
        ) : filteredAdvisors.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-primary mb-2">No advisors found</h3>
            <p className="text-secondary">Try searching for a different city or adjusting your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {filteredAdvisors.map((advisor) => (
              <div
                key={advisor.id}
                className="glass-card p-4 sm:p-6 hover:bg-white/10 transition-all cursor-pointer group"
                onClick={() => onSelectAdvisor(advisor)}
              >
                {/* Header */}
                <div className="flex items-start gap-4 mb-4">
                  <img
                    src={advisor.photoUrl || 'https://via.placeholder.com/80'}
                    alt={advisor.name}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white/20"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg sm:text-xl font-bold text-primary">{advisor.name}</h3>
                      {advisor.isVerified && (
                        <CheckCircle className="h-5 w-5 text-green-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-secondary text-sm mb-1">
                      <MapPin className="h-4 w-4" />
                      <span>{advisor.city}, {advisor.state}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1 text-yellow-400">
                        <Star className="h-4 w-4 fill-current" />
                        {advisor.rating.toFixed(1)}
                      </span>
                      <span className="text-secondary">({advisor.totalReviews} reviews)</span>
                    </div>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-secondary text-sm mb-4 line-clamp-2">{advisor.bio}</p>

                {/* Specialties */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {advisor.specialties.slice(0, 4).map((specialty) => (
                    <span
                      key={specialty}
                      className="px-2 py-1 text-xs rounded-full bg-white/10 text-primary"
                    >
                      {getSpecialtyIcon(specialty)} {specialty}
                    </span>
                  ))}
                  {advisor.specialties.length > 4 && (
                    <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-secondary">
                      +{advisor.specialties.length - 4} more
                    </span>
                  )}
                </div>

                {/* Languages */}
                <div className="flex items-center gap-2 mb-4 text-sm text-secondary">
                  <Globe className="h-4 w-4" />
                  <span>{advisor.languages.join(', ')}</span>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="glass-card p-2 rounded-lg">
                    <div className="text-lg font-bold text-primary">{advisor.totalPlansCreated}</div>
                    <div className="text-xs text-secondary">Plans Created</div>
                  </div>
                  <div className="glass-card p-2 rounded-lg">
                    <div className="text-lg font-bold text-primary">{advisor.totalPlansEnhanced}</div>
                    <div className="text-xs text-secondary">Plans Enhanced</div>
                  </div>
                  <div className="glass-card p-2 rounded-lg">
                    <div className="text-lg font-bold text-primary flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" />
                      {advisor.responseTimeHours}h
                    </div>
                    <div className="text-xs text-secondary">Avg Response</div>
                  </div>
                </div>

                {/* Sample Enhancements */}
                {advisor.sampleEnhancements && advisor.sampleEnhancements.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-secondary mb-2 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Sample Local Insights:
                    </div>
                    <div className="space-y-1">
                      {advisor.sampleEnhancements.slice(0, 2).map((sample, idx) => (
                        <div key={idx} className="text-xs text-primary bg-white/5 px-3 py-2 rounded-lg">
                          💡 {sample.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price & CTA */}
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <div>
                    <div className="text-lg font-bold text-primary">
                      ₹{mode === 'new_plan' ? advisor.pricePerPlan : advisor.pricePerEnhancement}
                    </div>
                    <div className="text-xs text-secondary">
                      {mode === 'new_plan' ? 'per plan' : 'per enhancement'}
                    </div>
                  </div>
                  <button className="premium-button-primary px-4 py-2 rounded-lg flex items-center gap-2 group-hover:bg-white/30 touch-manipulation">
                    Select Advisor
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="glass-card p-6 mt-8">
          <h3 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-400" />
            Why Choose a Local Advisor?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🏠</div>
              <div>
                <div className="font-semibold text-primary">Local Knowledge</div>
                <div className="text-sm text-secondary">Hidden gems and secret spots only locals know</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-2xl">🍽️</div>
              <div>
                <div className="font-semibold text-primary">Authentic Experiences</div>
                <div className="text-sm text-secondary">Real food, culture, and traditions</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-2xl">📍</div>
              <div>
                <div className="font-semibold text-primary">Updated Information</div>
                <div className="text-sm text-secondary">Current prices, timings, and conditions</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvisorSelectionPage;
