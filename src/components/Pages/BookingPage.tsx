import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plane,
  Train,
  Bus,
  Building2,
  MapPin,
  Users,
  Calendar,
  Loader2,
  BadgeCheck,
} from 'lucide-react';
import { apiService } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { getUserGroups, type Group } from '../../services/groupRepository';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';
import {
  subscribeToFinalizedPlan,
  type FinalizedPlan,
} from '../../services/planApprovalRepository';
import {
  getGroupActivities,
  type GroupItineraryActivity,
} from '../../services/itineraryRepository';
import {
  searchFlights,
  searchTrains,
  searchBuses,
  searchHotels,
  highlightRecommendedOption,
  checkRateLimit,
  type FlightOption,
  type TrainOption,
  type BusOption,
  type HotelOption,
} from '../../services/travelApiService';
import {
  getGroupBookings,
  subscribeToGroupBookings,
  upsertGroupBookingSelection,
  type GroupBookingSelection,
  type BookingType,
} from '../../services/bookingRepository';

type TravelCategory = 'flights' | 'trains' | 'buses' | 'hotels';

interface DayItinerarySection {
  key: string;
  dayNumber: number;
  date: string;
  from?: string;
  to?: string;
  location?: string;
  summary: string;
  transportHints: TravelCategory[];
  stayHint?: string;
  // AI transport suggestions from activities
  suggestedTransport?: 'flight' | 'train' | 'bus' | null;
  originCity?: string | null;
  destinationCity?: string | null;
  travelDate?: string | null;
}

interface DayCategoryResults {
  flights?: FlightOption[];
  trains?: TrainOption[];
  buses?: BusOption[];
  hotels?: HotelOption[];
}

type DayResultsState = Record<number, DayCategoryResults>;

const categoryBookingMap: Record<TravelCategory, BookingType> = {
  flights: 'flight',
  trains: 'train',
  buses: 'bus',
  hotels: 'hotel',
};

const bookingCategoryMap: Record<BookingType, TravelCategory> = {
  flight: 'flights',
  train: 'trains',
  bus: 'buses',
  hotel: 'hotels',
};

const bookingKey = (dayNumber: number, category: TravelCategory) =>
  `${dayNumber}-${category}`;

const transportKeywordMap: Array<{ regex: RegExp; category: TravelCategory }> = [
  { regex: /(flight|fly|airline|air|✈️)/i, category: 'flights' },
  { regex: /(train|rail|express|🚆)/i, category: 'trains' },
  { regex: /(bus|coach|road|🚍|🚌)/i, category: 'buses' },
];

const stayKeywordRegex = /(hotel|resort|stay|bnb|villa|hostel|lodg|🏨)/i;
const CITY_STOP_WORDS = new Set([
  'visit',
  'enjoy',
  'explore',
  'experience',
  'climb',
  'temple',
  'church',
  'museum',
  'view',
  'city',
  'town',
  'village',
  'hill',
  'mountain',
  'valley',
  'the',
  'and',
  'of',
  'at',
  'to',
  'from',
  'with',
  'in',
  'on',
  'up',
  'down',
  'towards',
  'through',
  'around',
  'near',
  'for',
  'a',
  'an',
  'by',
]);

function formatDisplayDate(dateInput?: string | null): string {
  if (!dateInput) {
    return '—';
  }
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start || !end) {
    return 'Dates not set';
  }
  return `${formatDisplayDate(start)} — ${formatDisplayDate(end)}`;
}

function formatTimeLabel(value?: string | null): string {
  if (!value) {
    return '—';
  }

  const hasDate = value.includes('T');
  const date = hasDate ? new Date(value) : new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sortActivities(activities: GroupItineraryActivity[]): GroupItineraryActivity[] {
  return [...activities].sort((a, b) => {
    const dateDiff =
      new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateDiff !== 0) {
      return dateDiff;
    }
    return (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
  });
}

function createDailyHighlights(activities: GroupItineraryActivity[]) {
  if (activities.length === 0) {
    return [];
  }

  const groupedByDate = activities.reduce<Map<string, GroupItineraryActivity[]>>(
    (acc, activity) => {
      const items = acc.get(activity.date) ?? [];
      items.push(activity);
      acc.set(activity.date, items);
      return acc;
    },
    new Map()
  );

  return Array.from(groupedByDate.entries())
    .sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    )
    .map(([date, items], index) => ({
      dayLabel: `Day ${index + 1}`,
      date,
      highlight:
        items
          .slice(0, 2)
          .map(
            (item) =>
              item.title ||
              item.location?.name ||
              item.description ||
              'Activity'
          )
          .join(' • ') || 'Planned activities',
    }));
}

function parseTravelSegment(text?: string | null): { from?: string; to?: string } {
  if (!text) {
    return {};
  }

  if (text.includes('→')) {
    const [from, to] = text.split('→').map((value) => value.trim());
    if (from && to) {
      return { from, to };
    }
  }

  if (text.includes('->')) {
    const [from, to] = text.split('->').map((value) => value.trim());
    if (from && to) {
      return { from, to };
    }
  }

  if (text.toLowerCase().includes(' to ')) {
    const [from, to] = text.split(/ to /i).map((value) => value.trim());
    if (from && to) {
      return { from, to };
    }
  }

  return {};
}

function extractTransportHints(text: string): TravelCategory[] {
  const lower = text.toLowerCase();
  return transportKeywordMap
    .filter(({ regex }) => regex.test(lower))
    .map(({ category }) => category);
}

function createItinerarySections(
  activities: GroupItineraryActivity[],
  plan: FinalizedPlan | null,
  group: Group | null,
  userHomeLocation?: string | null
): DayItinerarySection[] {
  if (activities.length === 0) {
    return [];
  }

  const grouped = activities.reduce<Map<string, GroupItineraryActivity[]>>((acc, activity) => {
    const bucket = acc.get(activity.date) ?? [];
    bucket.push(activity);
    acc.set(activity.date, bucket);
    return acc;
  }, new Map());

  const sortedDates = Array.from(grouped.keys()).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  const sections: DayItinerarySection[] = [];
  // For Day 1, use user home location as starting point
  let lastKnownLocation = userHomeLocation || group?.destination || plan?.destination || '';

  sortedDates.forEach((date, index) => {
    // For Day 1, set from to user home location if available
    if (index === 0 && userHomeLocation) {
      lastKnownLocation = userHomeLocation;
    }
    const dayActivities = sortActivities(grouped.get(date) ?? []);
    const joinedText = dayActivities
      .map(
        (activity) =>
          `${activity.title ?? ''} ${activity.description ?? ''}`.trim()
      )
      .join(' ');

    const transportMatches = extractTransportHints(joinedText);

    const travelActivity =
      dayActivities.find((activity) =>
        /→|->|\sto\s/i.test(`${activity.title ?? ''} ${activity.description ?? ''}`.trim())
      ) ?? null;

    let from: string | undefined;
    let to: string | undefined;

    if (travelActivity) {
      const parsed = parseTravelSegment(
        `${travelActivity.title ?? ''} ${travelActivity.description ?? ''}`
      );
      from = parsed.from;
      to = parsed.to;
    }

    const locationActivity = dayActivities.find((activity) => activity.location?.name);
    const location = locationActivity?.location?.name ?? to ?? lastKnownLocation;

    // Check for stored transport data from activities (from AI suggestions during import)
    const travelActivityWithData = dayActivities.find(
      (activity) => activity.suggestedTransport && activity.originCity && activity.destinationCity
    );

    let suggestedTransport: 'flight' | 'train' | 'bus' | null = null;
    let storedOriginCity: string | null = null;
    let storedDestinationCity: string | null = null;
    let storedTravelDate: string | null = null;

    if (travelActivityWithData) {
      suggestedTransport = travelActivityWithData.suggestedTransport;
      storedOriginCity = travelActivityWithData.originCity || null;
      storedDestinationCity = travelActivityWithData.destinationCity || null;
      storedTravelDate = travelActivityWithData.travelDate || null;
    }

    // For Day 1, always use user home location as origin (override stored data)
    if (index === 0 && userHomeLocation) {
      from = userHomeLocation;
      // Use stored destination or location as destination
      if (storedDestinationCity) {
        to = storedDestinationCity;
      } else if (location && location !== userHomeLocation) {
        to = location;
      } else if (storedOriginCity && storedOriginCity !== userHomeLocation) {
        to = storedOriginCity; // Use stored origin as destination if different from home
      }
    }
    // For Last Day, always set return trip: destination → home
    else if (index === sortedDates.length - 1 && userHomeLocation) {
      from = lastKnownLocation || storedDestinationCity || location || plan?.destination || group?.destination || '';
      to = userHomeLocation;
    }
    // For intermediate days, use stored origin/destination from activities if available
    else if (storedOriginCity && storedDestinationCity) {
      from = storedOriginCity;
      to = storedDestinationCity;
    }
    // Fallback: infer from location changes
    else if (!from && location && lastKnownLocation && location !== lastKnownLocation) {
      from = lastKnownLocation;
      to = location;
    }

    if (to) {
      lastKnownLocation = to;
    } else if (location) {
      lastKnownLocation = location;
    }

    const summary = dayActivities
      .slice(0, 3)
      .map((activity) => activity.title || activity.description || 'Activity')
      .join(' • ');

    const transportHints = new Set<TravelCategory>(transportMatches);

    // Add AI suggested transport to hints if available
    if (suggestedTransport) {
      if (suggestedTransport === 'flight') {
        transportHints.add('flights');
      } else if (suggestedTransport === 'train') {
        transportHints.add('trains');
      } else if (suggestedTransport === 'bus') {
        transportHints.add('buses');
      }
    }

    if (from && to && transportHints.size === 0) {
      transportHints.add('flights');
      transportHints.add('trains');
      transportHints.add('buses');
    }

    if (location && stayKeywordRegex.test(joinedText)) {
      transportHints.add('hotels');
    } else if (location) {
      transportHints.add('hotels');
    }

    sections.push({
      key: date,
      dayNumber: index + 1,
      date: storedTravelDate || date,
      from,
      to,
      location,
      summary,
      transportHints: Array.from(transportHints),
      stayHint: locationActivity?.title ?? undefined,
      suggestedTransport,
      originCity: storedOriginCity,
      destinationCity: storedDestinationCity,
      travelDate: storedTravelDate,
    });
  });

  return sections;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function resolveCheckoutDate(
  dayIndex: number,
  sections: DayItinerarySection[],
  plan: FinalizedPlan | null
): string | undefined {
  const current = sections[dayIndex];
  if (!current?.date) {
    return undefined;
  }
  const nextSection = sections[dayIndex + 1];
  if (nextSection?.date) {
    return nextSection.date;
  }
  if (plan?.endDate) {
    const inferred = addDays(plan.endDate, 1);
    return inferred;
  }
  return addDays(current.date, 1);
}

function getRecommendedOptionId(
  category: TravelCategory,
  options: FlightOption[] | TrainOption[] | BusOption[] | HotelOption[]
): string | null {
  if (options.length === 0) {
    return null;
  }

  if (category === 'hotels') {
    const enriched = (options as HotelOption[]).map((option) => ({
      ...option,
      price: option.pricePerNight,
    }));
    const recommended = highlightRecommendedOption(enriched);
    return (recommended as HotelOption | undefined)?.id ?? null;
  }

  const recommended = highlightRecommendedOption(options as Array<{ price?: number }>);
  if (!recommended) {
    return null;
  }

  return (recommended as FlightOption | TrainOption | BusOption | undefined)?.id ?? null;
}

function normalizeCityName(raw?: string | null, fallback?: string): string | undefined {
  if (!raw && !fallback) {
    return undefined;
  }

  if (!raw) {
    return fallback;
  }

  const segment = raw.split(/[,|/\\-]/)[0] ?? raw;
  const cleaned = segment.replace(/[^A-Za-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return fallback;
  }

  const words = cleaned.split(' ');
  const filtered = words.filter((word) => !CITY_STOP_WORDS.has(word.toLowerCase()));

  const candidateWords = (filtered.length > 0 ? filtered : words).slice(0, 3);
  const candidate = candidateWords.join(' ').trim();

  if (!candidate) {
    return fallback;
  }

  if (candidate.length < 3 && fallback) {
    return fallback;
  }

  if (candidate.length > 48 && fallback) {
    return fallback;
  }

  return candidate;
}

const BookingPage: React.FC = () => {
  const { user } = useAuth();
  const [aiRecommendations, setAiRecommendations] = useState<string>('');
  const [isGettingRecommendations, setIsGettingRecommendations] = useState(false);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('selectedGroupId') : null
  );
  const [selectedPlan, setSelectedPlan] = useState<FinalizedPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [planActivities, setPlanActivities] = useState<GroupItineraryActivity[]>([]);
  const [daySections, setDaySections] = useState<DayItinerarySection[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<TravelCategory>('flights');
  const [dayResults, setDayResults] = useState<DayResultsState>({});
  const [dayLoading, setDayLoading] = useState<Record<string, boolean>>({});
  const [dayErrors, setDayErrors] = useState<Record<string, string | null>>({});
  const [bookingSelections, setBookingSelections] = useState<
    Record<string, GroupBookingSelection>
  >({});
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userHomeLocation, setUserHomeLocation] = useState<string | null>(null);
  const [manualSearchForms, setManualSearchForms] = useState<Record<string, {
    from?: string;
    to?: string;
    city?: string;
    date?: string;
    checkin?: string;
    checkout?: string;
    travelers?: number;
    budgetMin?: number;
    budgetMax?: number;
    hotelType?: string;
  }>>({});
  const currentDay = daySections[selectedDayIndex] ?? null;
  const currentDayStateKey = currentDay ? `${currentDay.dayNumber}-${selectedCategory}` : '';
  const currentCategoryResults =
    (currentDay && dayResults[currentDay.dayNumber]?.[selectedCategory]) as
      | FlightOption[]
      | TrainOption[]
      | BusOption[]
      | HotelOption[]
      | undefined;
  const displayedResults = currentCategoryResults ?? [];
  const currentLoading = currentDayStateKey ? dayLoading[currentDayStateKey] ?? false : false;
  const currentError = currentDayStateKey ? dayErrors[currentDayStateKey] ?? null : null;
  const currentSelection = currentDay
    ? bookingSelections[bookingKey(currentDay.dayNumber, selectedCategory)]
    : null;
  const recommendedOptionId =
    currentDay && displayedResults.length > 0
      ? getRecommendedOptionId(selectedCategory, displayedResults)
      : null;
  const selectedOptionId =
    (currentSelection?.selectedOption as { id?: string } | null)?.id ?? null;

  const renderResultsList = () => {
    if (!currentDay || displayedResults.length === 0) {
      return null;
    }

    if (selectedCategory === 'flights') {
      return (
        <div className="space-y-4">
          {(displayedResults as FlightOption[]).map((flight) => {
            const isRecommended = flight.id === recommendedOptionId;
            const isSelected = flight.id === selectedOptionId;
            return (
              <div
                key={flight.id}
                className={`glass-card p-5 border transition-all duration-300 ${
                  isSelected
                    ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                    : isRecommended
                    ? 'border-primary/40'
                    : 'border-white/5'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="text-sm font-semibold text-primary">
                        {flight.airline || 'Flight'}
                      </span>
                      {flight.flightNumber && (
                        <span className="text-xs text-secondary/70">#{flight.flightNumber}</span>
                      )}
                      {isRecommended && (
                        <span className="px-2 py-1 rounded-full text-[11px] bg-primary/20 text-primary">
                          Recommended
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-2 py-1 rounded-full text-[11px] bg-emerald-400/15 text-emerald-200">
                          Saved
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-sm text-secondary">
          <div>
                        <div className="font-semibold text-primary text-lg">
                          {formatTimeLabel(flight.departureTime)}
          </div>
                        <div className="text-xs text-secondary/70">{flight.origin}</div>
                      </div>
                      <div className="text-xs text-secondary/70 flex items-center gap-2">
                        <div className="w-12 h-px bg-white/20" />
                        {flight.duration}
                        <div className="w-12 h-px bg-white/20" />
                      </div>
          <div>
                        <div className="font-semibold text-primary text-lg">
                          {formatTimeLabel(flight.arrivalTime)}
          </div>
                        <div className="text-xs text-secondary/70">{flight.destination}</div>
      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {flight.price
                          ? `${flight.currency} ${flight.price.toLocaleString('en-IN')}`
                          : '—'}
                      </div>
                      <div className="text-xs text-secondary/70">
                        {selectedGroup?.members.length ?? 1} traveller(s)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSelection('flights', flight)}
                      disabled={isSavingSelection && isSelected}
                      className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40'
                          : 'premium-button-primary disabled:opacity-60'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select Flight'}
          </button>
        </div>
      </div>
    </div>
  );
          })}
        </div>
      );
    }

    if (selectedCategory === 'trains') {
      return (
    <div className="space-y-4">
          {(displayedResults as TrainOption[]).map((train) => {
            const isRecommended = train.id === recommendedOptionId;
            const isSelected = train.id === selectedOptionId;
            return (
              <div
                key={train.id}
                className={`glass-card p-5 border transition-all duration-300 ${
                  isSelected
                    ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                    : isRecommended
                    ? 'border-green-400/40'
                    : 'border-white/5'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="text-sm font-semibold text-primary">
                        {train.name || 'Train'}
                      </span>
                      <span className="text-xs text-secondary/70">#{train.number}</span>
                      {isRecommended && (
                        <span className="px-2 py-1 rounded-full text-[11px] bg-green-500/20 text-green-200">
                          Recommended
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-2 py-1 rounded-full text-[11px] bg-emerald-400/15 text-emerald-200">
                          Saved
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-sm text-secondary">
                  <div>
                        <div className="font-semibold text-primary text-lg">
                          {formatTimeLabel(train.departureTime)}
                  </div>
                        <div className="text-xs text-secondary/70">{currentDay.from}</div>
                    </div>
                      <div className="text-xs text-secondary/70 flex items-center gap-2">
                        <div className="w-12 h-px bg-white/20" />
                        {train.duration ?? '—'}
                        <div className="w-12 h-px bg-white/20" />
                  </div>
                  <div>
                        <div className="font-semibold text-primary text-lg">
                          {formatTimeLabel(train.arrivalTime)}
                    </div>
                        <div className="text-xs text-secondary/70">{currentDay.to}</div>
                  </div>
                </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="text-right">
                      <div className="text-xl font-semibold text-primary">
                        {train.price ? `₹${train.price.toLocaleString('en-IN')}` : 'Dynamic Fare'}
                </div>
                      <div className="text-xs text-secondary/70">Check availability on IRCTC</div>
              </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSelection('trains', train)}
                      disabled={isSavingSelection && isSelected}
                      className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40'
                          : 'glass-card hover:bg-white/10'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select Train'}
                </button>
              </div>
            </div>
          </div>
            );
          })}
    </div>
  );
    }

    if (selectedCategory === 'buses') {
      return (
    <div className="space-y-4">
          {(displayedResults as BusOption[]).map((bus) => {
            const isRecommended = bus.id === recommendedOptionId;
            const isSelected = bus.id === selectedOptionId;
            return (
              <div
                key={bus.id}
                className={`glass-card p-5 border transition-all duration-300 ${
                  isSelected
                    ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                    : isRecommended
                    ? 'border-amber-400/40'
                    : 'border-white/5'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="text-sm font-semibold text-primary">
                        {bus.operator || 'Bus'}
                      </span>
                      <span className="text-xs text-secondary/70">{bus.busType}</span>
                      {isRecommended && (
                        <span className="px-2 py-1 rounded-full text-[11px] bg-amber-500/20 text-amber-200">
                          Recommended
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-2 py-1 rounded-full text-[11px] bg-emerald-400/15 text-emerald-200">
                          Saved
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-6 text-sm text-secondary">
                  <div>
                        <div className="font-semibold text-primary text-lg">
                          {formatTimeLabel(bus.departureTime)}
                  </div>
                        <div className="text-xs text-secondary/70">{bus.origin}</div>
                    </div>
                      <div className="text-xs text-secondary/70 flex items-center gap-2">
                        <div className="w-12 h-px bg-white/20" />
                        {bus.duration ?? '—'}
                        <div className="w-12 h-px bg-white/20" />
                  </div>
                  <div>
                        <div className="font-semibold text-primary text-lg">
                          {formatTimeLabel(bus.arrivalTime)}
                    </div>
                        <div className="text-xs text-secondary/70">{bus.destination}</div>
                  </div>
                </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <div className="text-right">
                      <div className="text-xl font-semibold text-primary">
                        {bus.price ? `₹${bus.price.toLocaleString('en-IN')}` : 'Dynamic Fare'}
                </div>
                      <div className="text-xs text-secondary/70">Operated by {bus.operator}</div>
              </div>
                    <button
                      type="button"
                      onClick={() => handleSaveSelection('buses', bus)}
                      disabled={isSavingSelection && isSelected}
                      className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                        isSelected
                          ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40'
                          : 'glass-card hover:bg-white/10'
                      }`}
                    >
                      {isSelected ? 'Selected' : 'Select Bus'}
                </button>
              </div>
            </div>
          </div>
            );
          })}
    </div>
  );
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {(displayedResults as HotelOption[]).map((hotel) => {
          const isRecommended = hotel.id === recommendedOptionId;
          const isSelected = hotel.id === selectedOptionId;
          return (
            <div
              key={hotel.id}
              className={`glass-card overflow-hidden border transition-all duration-300 ${
                isSelected
                  ? 'border-emerald-400/60 shadow-lg shadow-emerald-500/20'
                  : isRecommended
                  ? 'border-purple-400/40'
                  : 'border-white/5'
              }`}
            >
              {hotel.imageUrl && (
                <div
                  className="h-40 w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${hotel.imageUrl})` }}
                />
              )}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                    <h4 className="text-lg font-semibold text-primary">{hotel.name}</h4>
                    <div className="text-xs text-secondary/80 mt-1 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {hotel.location}
                </div>
                    <div className="text-xs text-secondary/70 mt-1">
                      Source: {hotel.bookingSource === 'booking' ? 'Booking.com' : 'Amadeus'}
                  </div>
                </div>
              <div className="text-right">
                    <div className="text-xl font-semibold text-primary">
                      {hotel.pricePerNight
                        ? `${hotel.currency ?? '₹'} ${hotel.pricePerNight.toLocaleString('en-IN')}`
                        : 'See details'}
                </div>
                    <div className="text-xs text-secondary/70">per night</div>
              </div>
            </div>
                <div className="flex items-center justify-between text-xs text-secondary/80">
                  <div className="flex items-center gap-2">
                    {hotel.rating && (
                      <span className="px-2 py-1 rounded-full bg-purple-400/15 text-purple-200">
                        ⭐ {hotel.rating.toFixed(1)}
                  </span>
                    )}
                    {isRecommended && (
                      <span className="px-2 py-1 rounded-full bg-purple-400/15 text-purple-200">
                        Recommended
                      </span>
                    )}
                    {isSelected && (
                      <span className="px-2 py-1 rounded-full bg-emerald-400/15 text-emerald-200">
                        Saved
                  </span>
                )}
              </div>
                  <button
                    type="button"
                    onClick={() => handleSaveSelection('hotels', hotel)}
                    disabled={isSavingSelection && isSelected}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-500/40'
                        : 'premium-button-primary disabled:opacity-60'
                    }`}
                  >
                    {isSelected ? 'Selected' : 'Select Hotel'}
            </button>
          </div>
        </div>
    </div>
  );
        })}
      </div>
    );
  };

  const categories = [
    { id: 'flights' as const, label: 'Flights ✈️', icon: Plane },
    { id: 'trains' as const, label: 'Trains 🚆', icon: Train },
    { id: 'buses' as const, label: 'Buses 🚌', icon: Bus },
    { id: 'hotels' as const, label: 'Hotels 🏨', icon: Building2 },
  ];

const categoryLabels: Record<TravelCategory, string> = {
  flights: 'Flight',
  trains: 'Train',
  buses: 'Bus',
  hotels: 'Hotel',
};

  const selectedGroup = useMemo(
    () => userGroups.find((group) => group.id === selectedGroupId) ?? null,
    [userGroups, selectedGroupId]
  );

  const dailyHighlights = useMemo(
    () => createDailyHighlights(planActivities),
    [planActivities]
  );

  useEffect(() => {
    if (!user) {
      setUserGroups([]);
      setSelectedGroupId(null);
      setSelectedPlan(null);
      setPlanActivities([]);
      setPlanMessage('Sign in and join a group to sync trip plans with bookings.');
      return;
    }

    let isMounted = true;
    setGroupsLoading(true);
    setGroupError(null);

    getUserGroups(user.uid)
      .then((groups) => {
        if (!isMounted) {
          return;
        }

        setUserGroups(groups);

        if (groups.length === 0) {
          setSelectedGroupId(null);
          setSelectedPlan(null);
          setPlanActivities([]);
          setPlanMessage('Join a travel group to see shared itineraries here.');
          return;
        }

        const storedGroupId =
          typeof window !== 'undefined'
            ? localStorage.getItem('selectedGroupId')
            : null;

        if (storedGroupId && groups.some((group) => group.id === storedGroupId)) {
          setSelectedGroupId(storedGroupId);
        } else {
          const fallbackId = groups[0].id;
          setSelectedGroupId(fallbackId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('selectedGroupId', fallbackId);
          }
        }
      })
      .catch((error) => {
        console.error('Error loading groups for BookingPage:', error);
        if (!isMounted) {
          return;
        }
        setGroupError('Unable to load your groups right now. Please try again.');
        setUserGroups([]);
      })
      .finally(() => {
        if (isMounted) {
          setGroupsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!selectedGroupId) {
      setSelectedPlan(null);
      setPlanActivities([]);
      return;
    }

    setPlanLoading(true);
    setPlanError(null);
    setPlanMessage(null);
    setSelectedPlan(null);
    setPlanActivities([]);

    const unsubscribe = subscribeToFinalizedPlan(selectedGroupId, async (plan) => {
      if (!plan || plan.status !== 'fixed') {
        setSelectedPlan(null);
        setPlanActivities([]);
        setDaySections([]);
        setPlanMessage('This group hasn’t finalized a trip plan yet.');
        setPlanLoading(false);
        return;
      }

      try {
        const activities = await getGroupActivities(selectedGroupId);
        const orderedActivities = sortActivities(activities);
        setSelectedPlan(plan);
        setPlanActivities(orderedActivities);
         const sections = createItinerarySections(orderedActivities, plan, selectedGroup, userHomeLocation);
         setDaySections(sections);
         setSelectedDayIndex(0);
         setSelectedCategory('flights');
         setDayResults({});
         setDayErrors({});
         setSaveMessage(null);
        setPlanMessage(null);
        setPlanLoading(false);
      } catch (error) {
        console.error('Error loading itinerary for booking sync:', error);
        setPlanError('Plan synced, but itinerary details could not be loaded.');
        setPlanActivities([]);
        setDaySections([]);
        setPlanLoading(false);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [selectedGroupId, selectedGroup]);

  useEffect(() => {
    if (!selectedGroupId) {
      setBookingSelections({});
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    getGroupBookings(selectedGroupId)
      .then((records) => {
        if (!isMounted) {
          return;
        }
        const mapped: Record<string, GroupBookingSelection> = {};
        records.forEach((record) => {
          const category = bookingCategoryMap[record.bookingType];
          if (category) {
            mapped[bookingKey(record.dayNumber, category)] = record;
          }
        });
        setBookingSelections(mapped);
      })
      .catch((error) => {
        console.error('Error loading saved bookings:', error);
      });

    subscribeToGroupBookings(selectedGroupId, (record) => {
      const category = bookingCategoryMap[record.bookingType];
      if (!category) {
        return;
      }
      setBookingSelections((prev) => ({
        ...prev,
        [bookingKey(record.dayNumber, category)]: record,
      }));
    })
      .then((unsubscribeFn) => {
        unsubscribe = unsubscribeFn;
      })
      .catch((error) => {
        console.error('Error subscribing to bookings:', error);
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [selectedGroupId]);

  const handleSelectGroup = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
    setSelectedPlan(null);
    setPlanActivities([]);
    setPlanMessage(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedGroupId', groupId);
    }
  }, []);

  const getAIRecommendations = async () => {
    const day = daySections[selectedDayIndex];
    if (!day) {
      setAiRecommendations('Select a day with itinerary details to get tailored tips.');
      return;
    }

    const origin = day.from || selectedPlan?.destination || selectedGroup?.destination || '';
    const destination =
      day.to || day.location || selectedPlan?.destination || selectedGroup?.destination || '';
    const date = day.date || selectedPlan?.startDate || '';

    if (!origin || !destination || !date) {
      setAiRecommendations('Need more itinerary details to generate recommendations for this day.');
      return;
    }

    setIsGettingRecommendations(true);
    try {
      const response = await apiService.getBookingRecommendations({
        from: origin,
        to: destination,
        date,
        type:
          selectedCategory === 'hotels'
            ? 'hotel'
            : selectedCategory === 'buses'
            ? 'bus'
            : selectedCategory === 'trains'
            ? 'train'
            : 'flight',
        preferences: `Day ${day.dayNumber} ${selectedCategory} recommendations`,
      });
      setAiRecommendations(response.recommendations);
    } catch (error) {
      console.error('Failed to get AI recommendations:', error);
      setAiRecommendations('Unable to get recommendations at the moment. Please try again later.');
    } finally {
      setIsGettingRecommendations(false);
    }
  };

  const fetchCategoryResults = useCallback(
    async (dayIndex: number, category: TravelCategory, force = false) => {
      const day = daySections[dayIndex];
      if (!day) {
        return;
      }

      const stateKey = `${day.dayNumber}-${category}`;
      const existing = dayResults[day.dayNumber]?.[category];

      if (!force && existing && existing.length > 0) {
        return;
      }

      // Check for manual search form data first
      const formKey = `${day.dayNumber}-${category}`;
      const manualForm = manualSearchForms[formKey];

      const isTravelCategory = category === 'flights' || category === 'trains' || category === 'buses';

      // If manual form has data, use it; otherwise use itinerary data
      let normalizedFrom: string | undefined;
      let normalizedTo: string | undefined;
      let normalizedHotelCity: string | undefined;
      let searchDate: string | undefined;
      let travelers: number | undefined;
      let budgetMin: number | undefined;
      let budgetMax: number | undefined;

      if (manualForm) {
        // Use manual form data
        if (isTravelCategory) {
          normalizedFrom = normalizeCityName(manualForm.from, undefined);
          normalizedTo = normalizeCityName(manualForm.to, undefined);
          searchDate = manualForm.date;
          travelers = manualForm.travelers;
        } else if (category === 'hotels') {
          normalizedHotelCity = normalizeCityName(manualForm.city, undefined);
          searchDate = manualForm.checkin;
          budgetMin = manualForm.budgetMin;
          budgetMax = manualForm.budgetMax;
        }
      }

      // Fallback to itinerary data if manual form doesn't have required fields
      if (!normalizedFrom || !normalizedTo) {
        const fallbackDestination =
          normalizeCityName(selectedPlan?.destination, undefined) ??
          normalizeCityName(selectedGroup?.destination, undefined) ??
          selectedPlan?.destination ??
          selectedGroup?.destination ??
          undefined;

        if (!normalizedFrom) {
          normalizedFrom = normalizeCityName(day.from, fallbackDestination);
        }
        if (!normalizedTo) {
          normalizedTo = normalizeCityName(day.to ?? day.location, fallbackDestination);
        }
        if (!normalizedHotelCity) {
          normalizedHotelCity = normalizeCityName(
            day.location ?? day.to,
            normalizedTo ?? fallbackDestination
          );
        }
        if (!searchDate) {
          searchDate = day.date ?? selectedPlan?.startDate ?? undefined;
        }
      }

      if (
        isTravelCategory &&
        !day.transportHints.includes(category) &&
        !manualForm
      ) {
        setDayErrors((prev) => ({
          ...prev,
          [stateKey]: `No travel plan for this mode on Day ${day.dayNumber}. Use manual search to find options.`,
        }));
        setDayResults((prev) => ({
          ...prev,
          [day.dayNumber]: {
            ...(prev[day.dayNumber] ?? {}),
            [category]: [],
          },
        }));
        return;
      }

      if (isTravelCategory && (!normalizedFrom || !normalizedTo)) {
        setDayErrors((prev) => ({
          ...prev,
          [stateKey]:
            'Need clearer origin and destination cities. Use manual search form or edit the itinerary to add city names.',
        }));
        return;
      }

      if (!searchDate && !day.date && !selectedPlan?.startDate) {
        setDayErrors((prev) => ({
          ...prev,
          [stateKey]: 'Missing travel dates. Use manual search form or update the plan schedule.',
        }));
        return;
      }

      if (category === 'hotels') {
        if (!normalizedHotelCity) {
          setDayErrors((prev) => ({
            ...prev,
            [stateKey]: 'No destination found. Use manual search form or add a location to view hotel options.',
          }));
          return;
        }
      }

      setDayLoading((prev) => ({
        ...prev,
        [stateKey]: true,
      }));
      setDayErrors((prev) => ({
        ...prev,
        [stateKey]: null,
      }));

      try {
        let results: FlightOption[] | TrainOption[] | BusOption[] | HotelOption[] = [];

        if (category === 'flights') {
          results = await searchFlights({
            originCity: normalizedFrom ?? '',
            destinationCity: normalizedTo ?? '',
            departureDate: searchDate ?? day.date ?? selectedPlan?.startDate ?? '',
            travelers: travelers ?? selectedGroup?.members.length ?? 1,
          });
        } else if (category === 'trains') {
          results = await searchTrains({
            originCity: normalizedFrom ?? '',
            destinationCity: normalizedTo ?? '',
            date: searchDate ?? day.date ?? selectedPlan?.startDate ?? '',
          });
        } else if (category === 'buses') {
          results = await searchBuses({
            originCity: normalizedFrom ?? '',
            destinationCity: normalizedTo ?? '',
            date: searchDate ?? day.date ?? selectedPlan?.startDate ?? '',
          });
        } else if (category === 'hotels') {
          const checkin = manualForm?.checkin ?? day.date ?? selectedPlan?.startDate;
          const checkout = manualForm?.checkout ?? resolveCheckoutDate(dayIndex, daySections, selectedPlan) ?? selectedPlan?.endDate;
          const city = normalizedHotelCity ?? '';

          if (!checkin || !checkout) {
            throw new Error('Missing check-in or check-out date for hotel search.');
          }

          results = await searchHotels({
            cityName: city,
            checkin,
            checkout,
            budgetMin,
            budgetMax,
            limit: 10,
          });
        }

        setDayResults((prev) => ({
          ...prev,
          [day.dayNumber]: {
            ...(prev[day.dayNumber] ?? {}),
            [category]: results,
          },
        }));

        if (!results || results.length === 0) {
          // Check if it's a rate limit issue
          const rateLimitKey = category === 'flights' ? 'amadeus-flight' : 
                              category === 'trains' ? 'irctc-train' : 
                              category === 'buses' ? 'redbus' : '';
          
          if (rateLimitKey && checkRateLimit(rateLimitKey)) {
            setDayErrors((prev) => ({
              ...prev,
              [stateKey]: `${categoryLabels[category]} search is temporarily rate-limited. Please wait 2 minutes and try again, or use manual search with different cities.`,
            }));
          } else {
            setDayErrors((prev) => ({
              ...prev,
              [stateKey]: `No ${categoryLabels[category]} found for this route. Try using manual search with different city names or check back later.`,
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching live booking data:', error);
        // Only set error if it's not already handled (empty results case)
        const currentError = dayErrors[stateKey];
        if (!currentError) {
          setDayErrors((prev) => ({
            ...prev,
            [stateKey]:
              error instanceof Error
                ? error.message
                : 'Unable to fetch results right now. Please try manual search or try again later.',
          }));
        }
      } finally {
        setDayLoading((prev) => ({
          ...prev,
          [stateKey]: false,
        }));
      }
    },
    [daySections, dayResults, selectedPlan, selectedGroup, manualSearchForms]
  );

  const handleCategoryClick = useCallback(
    (category: TravelCategory) => {
      setSelectedCategory(category);
      setSaveMessage(null);
      setSaveError(null);
      fetchCategoryResults(selectedDayIndex, category, true).catch((error) =>
        console.error('Failed to fetch category results:', error)
      );
    },
    [fetchCategoryResults, selectedDayIndex]
  );

  const handleSelectDay = useCallback((index: number) => {
    setSelectedDayIndex(index);
    setSelectedCategory('flights');
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  // Manual search form handlers
  const handleManualSearchSubmit = useCallback(
    async (category: TravelCategory) => {
      const day = daySections[selectedDayIndex];
      if (!day) return;

      const formKey = `${day.dayNumber}-${category}`;
      const form = manualSearchForms[formKey];

      if (!form) return;

      // Validate form data
      if (category === 'flights' || category === 'trains' || category === 'buses') {
        if (!form.from || !form.to || !form.date) {
          setDayErrors((prev) => ({
            ...prev,
            [`${day.dayNumber}-${category}`]: 'Please fill all required fields (From, To, Date).',
          }));
          return;
        }
      } else if (category === 'hotels') {
        if (!form.city || !form.checkin || !form.checkout) {
          setDayErrors((prev) => ({
            ...prev,
            [`${day.dayNumber}-${category}`]: 'Please fill all required fields (City, Check-in, Check-out).',
          }));
          return;
        }
      }

      // Fetch results using manual form data
      await fetchCategoryResults(selectedDayIndex, category, true);
    },
    [selectedDayIndex, manualSearchForms, daySections, fetchCategoryResults]
  );

  const updateManualForm = useCallback(
    (category: TravelCategory, field: string, value: string | number | undefined) => {
      const day = daySections[selectedDayIndex];
      if (!day) return;

      const formKey = `${day.dayNumber}-${category}`;
      setManualSearchForms((prev) => ({
        ...prev,
        [formKey]: {
          ...(prev[formKey] ?? {}),
          [field]: value,
        },
      }));
    },
    [selectedDayIndex, daySections]
  );

  const handleSaveSelection = useCallback(
    async (
      category: TravelCategory,
      option: FlightOption | TrainOption | BusOption | HotelOption
    ) => {
      if (!selectedGroupId) {
        setSaveError('Select a group to save booking choices.');
        return;
      }

      const day = daySections[selectedDayIndex];
      if (!day) {
        setSaveError('Choose a day from the itinerary before saving an option.');
        return;
      }

      setIsSavingSelection(true);
      setSaveError(null);

      try {
        const record = await upsertGroupBookingSelection({
          groupId: selectedGroupId,
          dayNumber: day.dayNumber,
          bookingType: categoryBookingMap[category],
          selectedOption: option,
          userId: user?.uid,
          userName: user?.displayName ?? user?.email ?? null,
        });

        if (record) {
          setBookingSelections((prev) => ({
            ...prev,
            [bookingKey(day.dayNumber, category)]: record,
          }));
        }

        setSaveMessage(`${categoryLabels[category]} saved for Day ${day.dayNumber}.`);
      } catch (error) {
        console.error('Error saving booking selection:', error);
        setSaveError(
          error instanceof Error
            ? error.message
            : 'Unable to save this option right now. Please try again.'
        );
      } finally {
        setIsSavingSelection(false);
      }
    },
    [daySections, selectedDayIndex, selectedGroupId, user]
  );

  // Fetch user home location
  useEffect(() => {
    if (!user) {
      setUserHomeLocation(null);
      return;
    }

    const fetchHomeLocation = async () => {
      try {
        const supabase = await getAuthenticatedSupabaseClient();
        const { data, error } = await supabase
          .from('users')
          .select('home_location')
          .eq('id', user.uid)
          .single();

        if (!error && data?.home_location) {
          setUserHomeLocation(data.home_location);
        }
      } catch (error) {
        console.error('Error fetching user home location:', error);
      }
    };

    fetchHomeLocation();
  }, [user]);

  // Auto-fetch all transport modes for Day 1 and Last Day
  useEffect(() => {
    if (daySections.length === 0) return;

    const firstDay = daySections[0];
    const lastDay = daySections[daySections.length - 1];

    if (!firstDay || !lastDay) return;

    // Auto-fetch Day 1 (first trip: home → destination)
    const fetchDay1 = async () => {
      const categories: TravelCategory[] = ['flights', 'trains', 'buses'];
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const stateKey = `${firstDay.dayNumber}-${category}`;
        const existing = dayResults[firstDay.dayNumber]?.[category];
        if (existing && existing.length > 0) continue;
        if (dayLoading[stateKey]) continue;

        // Add delay between each category fetch (3 seconds)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        try {
          await fetchCategoryResults(0, category, false);
        } catch (error) {
          console.error(`Failed to auto-fetch ${category} for Day 1:`, error);
          // Continue to next category even if one fails
        }
      }
    };

    // Auto-fetch Last Day (return trip: destination → home)
    const fetchLastDay = async () => {
      // Wait 5 seconds after Day 1 fetches complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      const categories: TravelCategory[] = ['flights', 'trains', 'buses'];
      const lastDayIndex = daySections.length - 1;
      for (let i = 0; i < categories.length; i++) {
        const category = categories[i];
        const stateKey = `${lastDay.dayNumber}-${category}`;
        const existing = dayResults[lastDay.dayNumber]?.[category];
        if (existing && existing.length > 0) continue;
        if (dayLoading[stateKey]) continue;

        // Add delay between each category fetch (3 seconds)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        try {
          await fetchCategoryResults(lastDayIndex, category, false);
        } catch (error) {
          console.error(`Failed to auto-fetch ${category} for Last Day:`, error);
          // Continue to next category even if one fails
        }
      }
    };

    // Delay auto-fetch to avoid overwhelming APIs on page load
    const timeoutId = setTimeout(() => {
      fetchDay1();
      if (daySections.length > 1) {
        // fetchLastDay will wait for Day 1 to complete
        fetchLastDay();
      }
    }, 2000); // Increased initial delay to 2 seconds

    return () => clearTimeout(timeoutId);
  }, [daySections.length, fetchCategoryResults, dayResults, dayLoading]);

  useEffect(() => {
    const day = daySections[selectedDayIndex];
    if (!day) {
      return;
    }
    const stateKey = `${day.dayNumber}-${selectedCategory}`;
    const existing = dayResults[day.dayNumber]?.[selectedCategory];
    if (existing && existing.length > 0) {
      return;
    }
    if (dayLoading[stateKey]) {
      return;
    }
    // Only auto-fetch for intermediate days if user manually selects category
    // Day 1 and Last Day are handled by the auto-fetch useEffect above
    const isDay1 = day.dayNumber === daySections[0]?.dayNumber;
    const isLastDay = day.dayNumber === daySections[daySections.length - 1]?.dayNumber;
    if (isDay1 || isLastDay) {
      return; // Already handled by auto-fetch
    }
    // For intermediate days, don't auto-fetch - user must use manual search
  }, [
    daySections,
    selectedDayIndex,
    selectedCategory,
    dayResults,
    dayLoading,
    fetchCategoryResults,
  ]);

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">
            🎫 Smart Booking
          </h1>
          <p className="text-xl text-secondary">
            Day-wise travel & stay planner with live flights, trains, buses, and hotels
          </p>
        </div>

        {/* Group Sync Section */}
        <div className="mb-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-primary">Group Travel Sync</h2>
              <p className="text-sm text-secondary">
                Link your booking searches with a group’s finalized itinerary.
              </p>
            </div>

            {selectedGroup && selectedPlan && !planMessage && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-400/40 bg-emerald-400/10 text-sm text-emerald-200 transition-all duration-300">
                <BadgeCheck className="h-4 w-4" />
                <span>
                  Linked Group:{' '}
                  <strong className="text-emerald-100">
                    {selectedPlan.planName || selectedGroup.groupName}
                  </strong>
                </span>
                <span className="text-xs text-emerald-200/70">Plan Loaded ✅</span>
              </div>
            )}
          </div>

          {groupsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-secondary" />
            </div>
          ) : groupError ? (
            <div className="glass-card p-4 text-sm text-red-400 border border-red-500/30">
              {groupError}
            </div>
          ) : userGroups.length === 0 ? (
            <div className="glass-card p-6 text-sm text-secondary">
              Join a travel group to start syncing trip plans with your bookings.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {userGroups.map((group) => {
                const isActive = group.id === selectedGroupId;
              return (
                <button
                    key={group.id}
                    type="button"
                    onClick={() => handleSelectGroup(group.id)}
                    className={`text-left glass-card p-6 rounded-2xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${
                      isActive
                        ? 'border-primary/60 bg-white/10 shadow-xl shadow-primary/20'
                        : 'border-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-primary">
                          {group.groupName}
                        </h3>
                        <div className="flex items-center text-secondary text-sm mt-1">
                          <MapPin className="h-4 w-4 mr-1 text-primary/70" />
                          {group.destination}
                        </div>
                      </div>
                      <div className="text-xs text-secondary bg-white/5 px-3 py-1 rounded-full">
                        {isActive ? 'Selected' : 'Select'}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-secondary/80">
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-primary/70" />
                        {group.members.length} member
                        {group.members.length === 1 ? '' : 's'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-primary/70" />
                        {formatDateRange(group.startDate, group.endDate)}
                      </span>
                    </div>
                </button>
              );
            })}
          </div>
          )}
        </div>

        {/* Linked Plan Overview */}
        <div className="mb-10">
          {selectedGroupId ? (
            planLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-secondary" />
              </div>
            ) : planMessage ? (
              <div className="glass-card p-4 text-sm text-secondary">{planMessage}</div>
            ) : selectedPlan ? (
              <div className="glass-card p-6 border border-primary/20 transition-all duration-300">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-bold text-primary mb-1">
                      📍 {selectedPlan.planName || selectedGroup?.groupName || 'Group Trip'}
                    </h3>
                    <div className="text-sm text-secondary mb-3">
                      {formatDateRange(selectedPlan.startDate, selectedPlan.endDate)}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-secondary/90">
                      <span className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary/70" />
                        Destination: {selectedPlan.destination}
                      </span>
                      {selectedGroup && (
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-primary/70" />
                          {selectedGroup.members.length} traveller
                          {selectedGroup.members.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="bg-white/10 px-4 py-3 rounded-xl text-sm text-secondary/90 shadow-inner">
                    <div className="font-semibold text-primary mb-1">Trip Snapshot</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 text-xs">
                      <span>
                        <strong className="text-secondary">Total Days:</strong>{' '}
                        {(selectedPlan.totalDays ?? daySections.length) || '—'}
                      </span>
                      <span>
                        <strong className="text-secondary">Budget:</strong>{' '}
                        {selectedPlan.totalEstimatedBudget
                          ? `₹${selectedPlan.totalEstimatedBudget.toLocaleString('en-IN')}`
                          : '—'}
                      </span>
                      <span>
                        <strong className="text-secondary">Itinerary Days Loaded:</strong>{' '}
                        {daySections.length > 0 ? daySections.length : '—'}
                      </span>
                      <span>
                        <strong className="text-secondary">Finalized At:</strong>{' '}
                        {selectedPlan.finalizedAt
                          ? formatDisplayDate(selectedPlan.finalizedAt)
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {dailyHighlights.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-secondary uppercase tracking-wide mb-3">
                      Daily Highlights
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {dailyHighlights.slice(0, 6).map((highlight) => (
                        <div
                          key={`${highlight.dayLabel}-${highlight.date}`}
                          className="glass-card p-4 border border-white/5"
                        >
                          <div className="text-xs text-secondary/80 mb-1">
                            {highlight.dayLabel} · {formatDisplayDate(highlight.date)}
            </div>
                          <div className="text-sm text-primary/90">{highlight.highlight}</div>
          </div>
                      ))}
                    </div>
                  </div>
                )}

                {planError && (
                  <div className="mt-4 text-xs text-red-400 bg-red-500/5 px-3 py-2 rounded-lg">
                    {planError}
                  </div>
                )}
              </div>
            ) : (
              <div className="glass-card p-4 text-sm text-secondary">
                Select a group to see its synchronized trip plan.
              </div>
            )
          ) : null}
        </div>

        {selectedPlan && daySections.length > 0 && (
          <div className="mb-12">
            <div className="glass-card p-6 border border-white/10 transition-all duration-300">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-primary">
                      Day-wise Travel & Stay Booking
                    </h3>
                    <p className="text-sm text-secondary">
                      Pick a day to fetch live flights, trains, buses, or hotels that match the plan.
                    </p>
                  </div>
                  {currentSelection && (
                    <div className="px-4 py-2 bg-emerald-400/10 border border-emerald-400/30 rounded-xl text-xs text-emerald-200">
                      {categoryLabels[bookingCategoryMap[currentSelection.bookingType]]} saved for Day{' '}
                      {currentSelection.dayNumber}.
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <div className="flex gap-3 min-w-max">
                    {daySections.map((day, index) => {
                      const isActive = index === selectedDayIndex;
                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => handleSelectDay(index)}
                          className={`px-4 py-3 rounded-xl border transition-all duration-300 text-left min-w-[140px] ${
                            isActive
                              ? 'bg-white text-black border-white shadow-lg shadow-primary/20'
                              : 'glass-card border-white/10 text-secondary hover:bg-white/5'
                          }`}
                        >
                          <div className="text-xs uppercase tracking-wide opacity-70">
                            Day {day.dayNumber}
                          </div>
                          <div className="text-sm font-semibold text-primary">
                            {formatDisplayDate(day.date)}
                          </div>
                          <div className="text-xs text-secondary mt-1 truncate">
                            {day.from && day.to
                              ? `${day.from} → ${day.to}`
                              : day.location || selectedPlan.destination}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {currentDay ? (
                  <>
                    <div className="glass-card border border-white/10 p-5">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-primary mb-1">
                            {currentDay.from && currentDay.to
                              ? `${currentDay.from} → ${currentDay.to}`
                              : currentDay.location || selectedPlan.destination}
                          </div>
                          <div className="text-xs text-secondary/80 mb-2">
                            {formatDisplayDate(currentDay.date)} ·{' '}
                            {currentDay.summary || 'Plan details coming soon'}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {currentDay.transportHints.map((hint) => (
                              <span
                                key={hint}
                                className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                                  hint === 'flights'
                                    ? 'bg-blue-500/15 text-blue-200'
                                    : hint === 'trains'
                                    ? 'bg-green-500/15 text-green-200'
                                    : hint === 'buses'
                                    ? 'bg-amber-500/15 text-amber-200'
                                    : 'bg-purple-500/15 text-purple-200'
                                }`}
                              >
                                {categoryLabels[hint]} suggested
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-xs text-secondary/70">
                          Tap a mode below to pull live options for Day {currentDay.dayNumber}.
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {categories.map((category) => {
                        const Icon = category.icon;
                        const isActive = selectedCategory === category.id;
                        // Check if this category is AI-suggested
                        const isAISuggested = currentDay?.suggestedTransport === 'flight' && category.id === 'flights' ||
                          currentDay?.suggestedTransport === 'train' && category.id === 'trains' ||
                          currentDay?.suggestedTransport === 'bus' && category.id === 'buses';
                        return (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => handleCategoryClick(category.id)}
                            className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all duration-200 ${
                              isActive
                                ? 'bg-white text-black shadow-lg shadow-primary/20'
                                : isAISuggested
                                ? 'glass-card text-primary border-2 border-primary/50 hover:bg-primary/10'
                                : 'glass-card text-secondary hover:bg-white/10'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {category.label}
                            {isAISuggested && (
                              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-primary text-black text-[9px] font-bold rounded-full">
                                AI
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {(saveMessage || saveError) && (
                      <div
                        className={`text-xs px-4 py-2 rounded-xl border ${
                          saveError
                            ? 'border-red-400/40 bg-red-500/10 text-red-200'
                            : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                        }`}
                      >
                        {saveError ?? saveMessage}
                      </div>
                    )}

                    <div className="min-h-[220px]">
                      {currentLoading ? (
                        <div className="flex items-center justify-center py-12 text-secondary">
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          Fetching {categoryLabels[selectedCategory]} options for Day{' '}
                          {currentDay.dayNumber}...
                        </div>
                      ) : currentError ? (
                        <div className="glass-card p-4 text-sm text-amber-200 border border-amber-400/30">
                          {currentError}
                        </div>
                      ) : displayedResults.length === 0 ? (
                        <div className="glass-card p-4 text-sm text-secondary border border-white/10">
                          Choose a category above to fetch live options for this day.
                        </div>
                      ) : (
                        renderResultsList()
                      )}
                    </div>

                    {/* Manual Search Form for Selected Category */}
                    {currentDay && (
                      <div className="mt-6 glass-card p-5 border border-white/10">
                        <div className="flex items-center gap-2 mb-4">
                          {selectedCategory === 'flights' && <Plane className="h-5 w-5 text-primary" />}
                          {selectedCategory === 'trains' && <Train className="h-5 w-5 text-primary" />}
                          {selectedCategory === 'buses' && <Bus className="h-5 w-5 text-primary" />}
                          {selectedCategory === 'hotels' && <Building2 className="h-5 w-5 text-primary" />}
                          <span className="text-sm font-semibold text-primary">
                            🔍 Manual Search {categoryLabels[selectedCategory]}
                          </span>
                        </div>

                        {selectedCategory === 'flights' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="From (city)"
                                value={manualSearchForms[`${currentDay.dayNumber}-flights`]?.from || ''}
                                onChange={(e) => updateManualForm('flights', 'from', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                              <input
                                type="text"
                                placeholder="To (city)"
                                value={manualSearchForms[`${currentDay.dayNumber}-flights`]?.to || ''}
                                onChange={(e) => updateManualForm('flights', 'to', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="date"
                                value={manualSearchForms[`${currentDay.dayNumber}-flights`]?.date || ''}
                                onChange={(e) => updateManualForm('flights', 'date', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                              <input
                                type="number"
                                placeholder="Travelers"
                                min="1"
                                value={manualSearchForms[`${currentDay.dayNumber}-flights`]?.travelers || ''}
                                onChange={(e) => updateManualForm('flights', 'travelers', parseInt(e.target.value) || undefined)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                            </div>
                            <button
                              onClick={() => handleManualSearchSubmit('flights')}
                              className="premium-button-primary w-full text-sm py-2.5"
                            >
                              Search Flights
                            </button>
                            <p className="text-xs text-secondary/70">
                              💡 Enter city names and date to search flights manually
                            </p>
                          </div>
                        )}

                        {selectedCategory === 'trains' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="From (station/city)"
                                value={manualSearchForms[`${currentDay.dayNumber}-trains`]?.from || ''}
                                onChange={(e) => updateManualForm('trains', 'from', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                              <input
                                type="text"
                                placeholder="To (station/city)"
                                value={manualSearchForms[`${currentDay.dayNumber}-trains`]?.to || ''}
                                onChange={(e) => updateManualForm('trains', 'to', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                            </div>
                            <input
                              type="date"
                              value={manualSearchForms[`${currentDay.dayNumber}-trains`]?.date || ''}
                              onChange={(e) => updateManualForm('trains', 'date', e.target.value)}
                              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                            />
                            <button
                              onClick={() => handleManualSearchSubmit('trains')}
                              className="premium-button-primary w-full text-sm py-2.5"
                            >
                              Search Trains
                            </button>
                            <p className="text-xs text-secondary/70">
                              💡 Enter station names or cities and date to search trains
                            </p>
                          </div>
                        )}

                        {selectedCategory === 'buses' && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="text"
                                placeholder="From (city)"
                                value={manualSearchForms[`${currentDay.dayNumber}-buses`]?.from || ''}
                                onChange={(e) => updateManualForm('buses', 'from', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                              <input
                                type="text"
                                placeholder="To (city)"
                                value={manualSearchForms[`${currentDay.dayNumber}-buses`]?.to || ''}
                                onChange={(e) => updateManualForm('buses', 'to', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                            </div>
                            <input
                              type="date"
                              value={manualSearchForms[`${currentDay.dayNumber}-buses`]?.date || ''}
                              onChange={(e) => updateManualForm('buses', 'date', e.target.value)}
                              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                            />
                            <button
                              onClick={() => handleManualSearchSubmit('buses')}
                              className="premium-button-primary w-full text-sm py-2.5"
                            >
                              Search Buses
                            </button>
                            <p className="text-xs text-secondary/70">
                              💡 Enter city names and date to find bus routes
                            </p>
                          </div>
                        )}

                        {selectedCategory === 'hotels' && (
                          <div className="space-y-3">
                            <input
                              type="text"
                              placeholder="City"
                              value={manualSearchForms[`${currentDay.dayNumber}-hotels`]?.city || ''}
                              onChange={(e) => updateManualForm('hotels', 'city', e.target.value)}
                              className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <input
                                type="date"
                                placeholder="Check-in"
                                value={manualSearchForms[`${currentDay.dayNumber}-hotels`]?.checkin || ''}
                                onChange={(e) => updateManualForm('hotels', 'checkin', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                              <input
                                type="date"
                                placeholder="Check-out"
                                value={manualSearchForms[`${currentDay.dayNumber}-hotels`]?.checkout || ''}
                                onChange={(e) => updateManualForm('hotels', 'checkout', e.target.value)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <input
                                type="number"
                                placeholder="Min ₹/night"
                                min="0"
                                value={manualSearchForms[`${currentDay.dayNumber}-hotels`]?.budgetMin || ''}
                                onChange={(e) => updateManualForm('hotels', 'budgetMin', parseFloat(e.target.value) || undefined)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                              <input
                                type="number"
                                placeholder="Max ₹/night"
                                min="0"
                                value={manualSearchForms[`${currentDay.dayNumber}-hotels`]?.budgetMax || ''}
                                onChange={(e) => updateManualForm('hotels', 'budgetMax', parseFloat(e.target.value) || undefined)}
                                className="glass-input w-full px-3 py-2 rounded-lg text-sm"
                              />
                            </div>
                            <button
                              onClick={() => handleManualSearchSubmit('hotels')}
                              className="premium-button-primary w-full text-sm py-2.5"
                            >
                              Search Hotels
                            </button>
                            <p className="text-xs text-secondary/70">
                              💡 Select budget range to find options (5-10 results with price diversity)
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-secondary">
                    Add itinerary activities to your plan to unlock day-wise bookings.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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