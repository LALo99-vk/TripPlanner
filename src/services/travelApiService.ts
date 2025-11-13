import { z } from 'zod';

type TravelCategory = 'flight' | 'train' | 'bus' | 'hotel';

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

export interface FlightOption {
  id: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price: number;
  currency: string;
  origin: string;
  destination: string;
  raw: unknown;
}

export interface TrainOption {
  id: string;
  name: string;
  number: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price?: number;
  origin: string;
  destination: string;
  raw: unknown;
}

export interface BusOption {
  id: string;
  operator: string;
  busType: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price?: number;
  origin: string;
  destination: string;
  raw: unknown;
}

export interface HotelOption {
  id: string;
  name: string;
  location: string;
  rating?: number;
  pricePerNight?: number;
  currency?: string;
  imageUrl?: string;
  bookingSource: 'amadeus' | 'booking';
  raw: unknown;
}

const AMADEUS_API_KEY = import.meta.env.VITE_AMADEUS_API_KEY;
const AMADEUS_API_SECRET = import.meta.env.VITE_AMADEUS_API_SECRET;
const RAPID_API_KEY = import.meta.env.VITE_RAPIDAPI_KEY;

const AMADEUS_BASE_URL = 'https://test.api.amadeus.com';
let tokenCache: TokenCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RATE_LIMIT_COOLDOWN_MS = 120 * 1000; // 120 seconds (2 minutes) - increased to prevent 429 errors
const MIN_API_INTERVAL_MS = 3000; // 3 seconds between API calls - increased to prevent rate limits
const LOCALSTORAGE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const locationCache = new Map<string, CacheEntry<LocationResolutionResult | null>>();
const flightCache = new Map<string, CacheEntry<FlightOption[]>>();
const trainCache = new Map<string, CacheEntry<TrainOption[]>>();
const busCache = new Map<string, CacheEntry<BusOption[]>>();
const hotelCache = new Map<string, CacheEntry<HotelOption[]>>();
const rateLimitCooldowns = new Map<string, number>();

// Global rate limiter - tracks last API call time
let lastApiCallTime = 0;

/**
 * Cleans location names by removing descriptive words and keeping only city/place names
 * Example: "visit the temple and enjoy a panoramic view of Pune city" -> "Pune"
 */
function cleanLocationName(raw: string): string {
  if (!raw) return '';
  
  return raw
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\b(visit|temple|hill|view|enjoy|panoramic|city|climb|up|the|and|near|to|from|go|see|place|spot|station|airport|bus|train|hotel|restaurant|beach|park|museum|monument|fort|palace|garden|lake|river|bridge|market|mall|shopping|center|centre)\b/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 2) // Remove very short words
    .slice(0, 2) // Take first 2 meaningful words
    .join(' ');
}

/**
 * Rate limiter - ensures minimum delay between API calls
 */
async function rateLimitedApiCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, MIN_API_INTERVAL_MS - (now - lastApiCallTime));
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  lastApiCallTime = Date.now();
  return fn();
}

/**
 * localStorage caching helpers
 */
function getCachedResultFromStorage<T>(key: string, maxAge = LOCALSTORAGE_CACHE_TTL_MS): T | null {
  if (!isBrowser) return null;
  
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const { data, ts } = JSON.parse(cached);
    if (Date.now() - ts > maxAge) {
      localStorage.removeItem(key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

function cacheResultToStorage<T>(key: string, data: T): void {
  if (!isBrowser) return;
  
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Ignore localStorage errors (quota exceeded, etc.)
  }
}

function getCachedValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string
): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  data: T,
  ttl = CACHE_TTL_MS
) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  });
}

function isRateLimited(key: string): boolean {
  const cooldownUntil = rateLimitCooldowns.get(key);
  if (!cooldownUntil) {
    return false;
  }
  if (cooldownUntil < Date.now()) {
    rateLimitCooldowns.delete(key);
    return false;
  }
  return true;
}

// Export for use in BookingPage
export function checkRateLimit(key: string): boolean {
  return isRateLimited(key);
}

function setRateLimit(key: string) {
  rateLimitCooldowns.set(key, Date.now() + RATE_LIMIT_COOLDOWN_MS);
}

const isBrowser = typeof window !== 'undefined';

function ensureEnvFor(category: TravelCategory): void {
  if (category === 'flight' || category === 'hotel') {
    if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
      throw new Error(
        'Amadeus API credentials missing. Please set VITE_AMADEUS_API_KEY and VITE_AMADEUS_API_SECRET.'
      );
    }
  }

  if (category === 'train' || category === 'bus' || category === 'hotel') {
    if (!RAPID_API_KEY) {
      throw new Error('RapidAPI key missing. Please set VITE_RAPIDAPI_KEY.');
    }
  }
}

async function fetchWithTimeout(
  resource: RequestInfo,
  options: RequestInit = {},
  timeout = 15000,
  retries = 2
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, { ...options, signal: controller.signal });
    
    // Retry on 429 with exponential backoff
    if (response.status === 429 && retries > 0) {
      clearTimeout(timeoutId);
      const wait = Math.pow(2, 3 - retries) * 2000; // 2s → 4s
      console.warn(`429 Too Many Requests — retrying in ${wait / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, wait));
      return fetchWithTimeout(resource, options, timeout, retries - 1);
    }
    
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function getAmadeusToken(): Promise<string> {
  ensureEnvFor('flight');

  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_API_KEY ?? '',
    client_secret: AMADEUS_API_SECRET ?? '',
  });

  const response = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Amadeus auth failed: ${text}`);
  }

  const data = await response.json();
  const expiresInMs = (data.expires_in ?? 0) * 1000;
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs - 60_000, // Renew a minute early
  };
  return tokenCache.token;
}

interface LocationResolutionResult {
  cityCode?: string;
  airportCode?: string;
}

function normalizeAmadeusKeyword(keyword: string): string | null {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return null;
  }

  const primarySegment = trimmed.split(/[,/|]/)[0] ?? trimmed;
  const words = primarySegment
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);

  if (words.length === 0) {
    return null;
  }

  return words.join(' ');
}

async function resolveAmadeusLocation(
  keyword: string,
  subtype: 'CITY' | 'AIRPORT' | 'CITY,AIRPORT' = 'CITY'
): Promise<LocationResolutionResult | null> {
  if (!keyword) {
    return null;
  }

  // Clean location name first to remove descriptive words
  const cleaned = cleanLocationName(keyword);
  const normalizedKeyword = normalizeAmadeusKeyword(cleaned || keyword);
  if (!normalizedKeyword) {
    return null;
  }

  const cacheKey = `${subtype}:${normalizedKeyword.toLowerCase()}`;
  const cached = getCachedValue(locationCache, cacheKey);
  if (cached !== null) {
    return cached;
  }

  const rateLimitKey = `amadeus-location-${subtype}`;
  if (isRateLimited(rateLimitKey)) {
    // Return null instead of throwing - let the calling function handle it gracefully
    console.warn(`Amadeus location lookup is cooling down for ${rateLimitKey}. Using cached or fallback data.`);
    return null;
  }

  // Rate limit this specific call
  await rateLimitedApiCall(async () => {
    // This will add delay if needed
  });

  const token = await getAmadeusToken();
  const params = new URLSearchParams({
    keyword: normalizedKeyword,
    subType: subtype,
    'page[limit]': '5',
  });

  const response = await fetchWithTimeout(`${AMADEUS_BASE_URL}/v1/reference-data/locations?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      setRateLimit(rateLimitKey);
      // Cache null result to prevent repeated failed calls
      setCachedValue(locationCache, cacheKey, null, RATE_LIMIT_COOLDOWN_MS);
      console.warn(`Amadeus location lookup rate-limited for ${normalizedKeyword}. Will retry after cooldown.`);
      return null; // Return null instead of throwing
    }
    if (response.status === 400) {
      // Cache null result for bad requests
      setCachedValue(locationCache, cacheKey, null, LOCATION_CACHE_TTL_MS);
      console.warn(`Amadeus could not understand location query: ${normalizedKeyword}`);
      return null; // Return null instead of throwing
    }
    // For other errors, return null
    return null;
  }

  const json = await response.json();
  const { data } = json;
  if (!Array.isArray(data) || data.length === 0) {
    setCachedValue(locationCache, cacheKey, null, LOCATION_CACHE_TTL_MS);
    return null;
  }

  const firstCity = data.find((item: any) => item.subType === 'CITY');
  const firstAirport = data.find((item: any) => item.subType === 'AIRPORT');

  const result = {
    cityCode: firstCity?.iataCode ?? firstAirport?.address?.cityCode ?? firstAirport?.iataCode,
    airportCode: firstAirport?.iataCode ?? firstCity?.iataCode,
  };
  setCachedValue(locationCache, cacheKey, result, LOCATION_CACHE_TTL_MS);
  return result;
}

function pickBest<T>(options: T[], score: (item: T) => number): T | null {
  if (options.length === 0) {
    return null;
  }
  return options.reduce((best, current) => (score(current) < score(best) ? current : best));
}

const AmadeusFlightOfferSchema = z.object({
  id: z.string(),
  price: z.object({
    total: z.string(),
    currency: z.string(),
  }),
  itineraries: z
    .array(
      z.object({
        duration: z.string().optional(),
        segments: z.array(
          z.object({
            departure: z.object({
              at: z.string(),
              iataCode: z.string(),
            }),
            arrival: z.object({
              at: z.string(),
              iataCode: z.string(),
            }),
            carrierCode: z.string().optional(),
            number: z.string().optional(),
          })
        ),
      })
    )
    .min(1),
});

function formatDuration(isoDuration?: string): string {
  if (!isoDuration?.startsWith('PT')) {
    return '—';
  }
  const hoursMatch = isoDuration.match(/(\d+)H/);
  const minutesMatch = isoDuration.match(/(\d+)M/);
  const hours = hoursMatch ? `${hoursMatch[1]}h` : '';
  const minutes = minutesMatch ? `${minutesMatch[1]}m` : '';
  return `${hours}${hours && minutes ? ' ' : ''}${minutes}` || '—';
}

export async function searchFlights(params: {
  originCity: string;
  destinationCity: string;
  departureDate: string;
  travelers?: number;
}): Promise<FlightOption[]> {
  ensureEnvFor('flight');

  // Clean location names before processing
  const fromCity = cleanLocationName(params.originCity);
  const toCity = cleanLocationName(params.destinationCity);
  
  if (!fromCity || !toCity) {
    throw new Error('Invalid city names for flight search. Please provide valid city names.');
  }

  const cacheKey = `flight:${fromCity.toLowerCase()}:${toCity.toLowerCase()}:${params.departureDate}:${params.travelers ?? 1}`;
  
  // Check localStorage cache first
  const storageCached = getCachedResultFromStorage<FlightOption[]>(cacheKey);
  if (storageCached) {
    return storageCached;
  }
  
  // Check in-memory cache
  const cached = getCachedValue(flightCache, cacheKey);
  if (cached) {
    return cached;
  }

  // Rate limit and resolve locations with delays between calls
  const [origin, destination] = await rateLimitedApiCall(async () => {
    // Resolve origin first
    const orig = await resolveAmadeusLocation(fromCity, 'CITY,AIRPORT');
    // Wait before resolving destination
    await new Promise(resolve => setTimeout(resolve, 3000));
    const dest = await resolveAmadeusLocation(toCity, 'CITY,AIRPORT');
    return [orig, dest];
  });

  if (!origin?.airportCode || !destination?.airportCode) {
    // Return empty array instead of throwing - let UI show error message
    console.warn(`Unable to determine IATA codes for ${fromCity} → ${toCity}. Location lookup may have failed or cities not found.`);
    return [];
  }

  // Rate limit and fetch flights
  const results = await rateLimitedApiCall(async () => {
    const token = await getAmadeusToken();

    const body = {
      currencyCode: 'INR',
      originDestinations: [
        {
          id: '1',
          originLocationCode: origin.airportCode,
          destinationLocationCode: destination.airportCode,
          departureDateTimeRange: {
            date: params.departureDate,
          },
        },
      ],
      travelers: Array.from({ length: params.travelers ?? 1 }, (_, index) => ({
        id: `${index + 1}`,
        travelerType: 'ADULT',
      })),
      sources: ['GDS'],
      searchCriteria: {
        maxFlightOffers: 6,
      },
    };

    const response = await fetchWithTimeout(`${AMADEUS_BASE_URL}/v2/shopping/flight-offers`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429) {
        setRateLimit('amadeus-flight');
        console.warn('Amadeus flight search rate-limited. Will retry after cooldown.');
        return []; // Return empty array instead of throwing
      }
      console.warn(`Amadeus flight search failed with status ${response.status}`);
      return []; // Return empty array instead of throwing
    }

    const json = await response.json();
    const offers = Array.isArray(json.data) ? json.data : [];

    return offers
      .map((offer: unknown) => {
        const parsed = AmadeusFlightOfferSchema.safeParse(offer);
        if (!parsed.success) {
          return null;
        }

        const { data } = parsed;
        const firstItinerary = data.itineraries[0];
        const firstSegment = firstItinerary.segments[0];
        const lastSegment = firstItinerary.segments[firstItinerary.segments.length - 1];

        const airlineCode = firstSegment.carrierCode ?? '';
        const flightNumber = `${airlineCode}${firstSegment.number ?? ''}`.trim();

        return {
          id: data.id,
          airline: airlineCode || 'Airline',
          flightNumber,
          departureTime: firstSegment.departure.at,
          arrivalTime: lastSegment.arrival.at,
          duration: formatDuration(firstItinerary.duration),
          price: Number.parseFloat(data.price.total),
          currency: data.price.currency,
          origin: firstSegment.departure.iataCode,
          destination: lastSegment.arrival.iataCode,
          raw: offer,
        } as FlightOption;
      })
      .filter((item): item is FlightOption => Boolean(item));
  });

  // Cache results
  setCachedValue(flightCache, cacheKey, results);
  cacheResultToStorage(cacheKey, results);
  
  return results;
}

const IRCTCStationSchema = z.object({
  stationCode: z.string(),
  stationName: z.string(),
});

async function resolveTrainStation(city: string): Promise<string | null> {
  ensureEnvFor('train');

  if (!city) {
    return null;
  }

  // Clean location name first
  const cleaned = cleanLocationName(city);
  const searchTerm = cleaned || city;

  const params = new URLSearchParams({
    search: searchTerm,
  });

  const response = await fetchWithTimeout(
    `https://irctc1.p.rapidapi.com/api/v1/searchStation?${params.toString()}`,
    {
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY ?? '',
        'X-RapidAPI-Host': 'irctc1.p.rapidapi.com',
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  const { data } = json;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const parsed = IRCTCStationSchema.safeParse(data[0]);
  if (!parsed.success) {
    return null;
  }

  return parsed.data.stationCode;
}

const IRCTCTrainSchema = z.object({
  trainNumber: z.string(),
  trainName: z.string(),
  from: z.object({
    departureTime: z.string(),
  }),
  to: z.object({
    arrivalTime: z.string(),
  }),
  duration: z.string().optional(),
  classes: z.array(z.object({ classCode: z.string() })).optional(),
});

export async function searchTrains(params: {
  originCity: string;
  destinationCity: string;
  date?: string;
}): Promise<TrainOption[]> {
  ensureEnvFor('train');

  // Clean location names before processing
  const fromCity = cleanLocationName(params.originCity);
  const toCity = cleanLocationName(params.destinationCity);
  
  if (!fromCity || !toCity) {
    throw new Error('Invalid city names for train search. Please provide valid city names.');
  }

  const cacheKey = `train:${fromCity.toLowerCase()}:${toCity.toLowerCase()}:${params.date ?? 'N/A'}`;
  
  // Check localStorage cache first
  const storageCached = getCachedResultFromStorage<TrainOption[]>(cacheKey);
  if (storageCached) {
    return storageCached;
  }
  
  // Check in-memory cache
  const cached = getCachedValue(trainCache, cacheKey);
  if (cached) {
    return cached;
  }

  // Rate limit and resolve stations with delays
  const [originCode, destinationCode] = await rateLimitedApiCall(async () => {
    // Resolve origin first
    const orig = await resolveTrainStation(fromCity);
    // Wait before resolving destination
    await new Promise(resolve => setTimeout(resolve, 3000));
    const dest = await resolveTrainStation(toCity);
    return [orig, dest];
  });

  if (!originCode || !destinationCode) {
    console.warn(`Unable to find train stations for ${fromCity} → ${toCity}. Station lookup may have failed.`);
    return []; // Return empty array instead of throwing
  }

  // Rate limit and fetch trains
  const results = await rateLimitedApiCall(async () => {
    const searchParams = new URLSearchParams({
      fromStationCode: originCode,
      toStationCode: destinationCode,
    });

    if (params.date) {
      searchParams.set('date', params.date);
    }

    const response = await fetchWithTimeout(
      `https://irctc1.p.rapidapi.com/api/v1/searchTrain?${searchParams.toString()}`,
      {
        headers: {
          'X-RapidAPI-Key': RAPID_API_KEY ?? '',
          'X-RapidAPI-Host': 'irctc1.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        setRateLimit('irctc-train');
        console.warn('IRCTC train search rate-limited. Will retry after cooldown.');
        return []; // Return empty array instead of throwing
      }
      console.warn(`IRCTC train search failed with status ${response.status}`);
      return []; // Return empty array instead of throwing
    }

    const json = await response.json();
    const { data } = json;
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((item: unknown) => {
        const parsed = IRCTCTrainSchema.safeParse(item);
        if (!parsed.success) {
          return null;
        }
        const { trainNumber, trainName, from, to, duration } = parsed.data;

        return {
          id: trainNumber,
          name: trainName,
          number: trainNumber,
          departureTime: from.departureTime,
          arrivalTime: to.arrivalTime,
          duration: duration ?? '—',
          origin: fromCity,
          destination: toCity,
          raw: item,
        } as TrainOption;
      })
      .filter((item): item is TrainOption => Boolean(item));
  });

  // Cache results
  setCachedValue(trainCache, cacheKey, results);
  cacheResultToStorage(cacheKey, results);
  
  return results;
}

const RedbusTripSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  travels: z.string(),
  busType: z.string(),
  departureTime: z.string(),
  arrivalTime: z.string(),
  duration: z.string().optional(),
  fare: z.number().optional(),
});

export async function searchBuses(params: {
  originCity: string;
  destinationCity: string;
  date: string;
}): Promise<BusOption[]> {
  ensureEnvFor('bus');

  // Clean location names before processing
  const fromCity = cleanLocationName(params.originCity);
  const toCity = cleanLocationName(params.destinationCity);
  
  if (!fromCity || !toCity) {
    throw new Error('Invalid city names for bus search. Please provide valid city names.');
  }

  const cacheKey = `bus:${fromCity.toLowerCase()}:${toCity.toLowerCase()}:${params.date}`;
  
  // Check localStorage cache first
  const storageCached = getCachedResultFromStorage<BusOption[]>(cacheKey);
  if (storageCached) {
    return storageCached;
  }
  
  // Check in-memory cache
  const cached = getCachedValue(busCache, cacheKey);
  if (cached) {
    return cached;
  }

  // Rate limit and fetch buses
  const results = await rateLimitedApiCall(async () => {
    const searchParams = new URLSearchParams({
      from: fromCity,
      to: toCity,
      date: params.date,
    });

    const response = await fetchWithTimeout(
      `https://redbus-service.p.rapidapi.com/search?${searchParams.toString()}`,
      {
        headers: {
          'X-RapidAPI-Key': RAPID_API_KEY ?? '',
          'X-RapidAPI-Host': 'redbus-service.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        setRateLimit('redbus');
        console.warn('RedBus search rate-limited. Will retry after cooldown.');
        return []; // Return empty array instead of throwing
      }
      if (response.status === 400) {
        console.warn(`RedBus could not understand city names: ${fromCity} → ${toCity}. Try simplifying.`);
        return []; // Return empty array instead of throwing
      }
      console.warn(`RedBus search failed with status ${response.status}`);
      return []; // Return empty array instead of throwing
    }

    const json = await response.json();
    const { data } = json;
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((item: unknown) => {
        const parsed = RedbusTripSchema.safeParse(item);
        if (!parsed.success) {
          return null;
        }
        const { id, travels, busType, departureTime, arrivalTime, duration, fare } = parsed.data;
        return {
          id,
          operator: travels,
          busType,
          departureTime,
          arrivalTime,
          duration: duration ?? '—',
          price: fare,
          origin: fromCity,
          destination: toCity,
          raw: item,
        } as BusOption;
      })
      .filter((item): item is BusOption => Boolean(item));
  });

  // Cache results
  setCachedValue(busCache, cacheKey, results);
  cacheResultToStorage(cacheKey, results);
  
  return results;
}

const AmadeusHotelSchema = z.object({
  chainCode: z.string().optional(),
  iataCode: z.string().optional(),
  name: z.string(),
  hotelId: z.string(),
  geoCode: z
    .object({
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    })
    .optional(),
  address: z
    .object({
      cityName: z.string().optional(),
      lines: z.array(z.string()).optional(),
    })
    .optional(),
});

const BookingHotelSchema = z.object({
  hotel_id: z.string(),
  name: z.string(),
  review_score: z.number().optional(),
  price_breakdown: z
    .object({
      currency: z.string().optional(),
      gross_price: z.number().optional(),
    })
    .optional(),
  photo1: z.string().optional(),
  address: z.string().optional(),
});

async function searchAmadeusHotels(city: string): Promise<HotelOption[]> {
  ensureEnvFor('hotel');

  // Clean location name first
  const cleaned = cleanLocationName(city);
  const searchCity = cleaned || city;

  const location = await resolveAmadeusLocation(searchCity, 'CITY');
  const cityCode = location?.cityCode;

  if (!cityCode) {
    return [];
  }

  const token = await getAmadeusToken();
  const params = new URLSearchParams({
    cityCode,
  });

  const response = await fetchWithTimeout(`${AMADEUS_BASE_URL}/v1/reference-data/locations/hotels/by-city?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Amadeus hotel search is temporarily rate-limited. Please try again later.');
    }
    if (response.status === 400) {
      throw new Error('Amadeus could not match that city. Try a simpler city name for hotels.');
    }
    const text = await response.text();
    throw new Error(`Amadeus hotel search failed: ${text}`);
  }

  const json = await response.json();
  const { data } = json;
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item: unknown) => {
      const parsed = AmadeusHotelSchema.safeParse(item);
      if (!parsed.success) {
        return null;
      }
      const { hotelId, name, address } = parsed.data;
      return {
        id: hotelId,
        name,
        location: address?.cityName ?? searchCity,
        bookingSource: 'amadeus' as const,
        raw: item,
      };
    })
    .filter((item): item is HotelOption => Boolean(item));
}

async function searchBookingHotels(params: {
  cityName: string;
  checkin: string;
  checkout: string;
}): Promise<HotelOption[]> {
  ensureEnvFor('hotel');

  // Clean location name first
  const cleaned = cleanLocationName(params.cityName);
  const searchCity = cleaned || params.cityName;

  const searchParams = new URLSearchParams({
    city_name: searchCity,
    checkin_date: params.checkin,
    checkout_date: params.checkout,
    units: 'metric',
    adults_number: '2',
    order_by: 'price',
  });

  const response = await fetchWithTimeout(
    `https://booking-com.p.rapidapi.com/v1/hotels/search?${searchParams.toString()}`,
    {
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY ?? '',
        'X-RapidAPI-Host': 'booking-com.p.rapidapi.com',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Booking.com search limit reached. Please try again shortly.');
    }
    const text = await response.text();
    throw new Error(`Booking.com search failed: ${text}`);
  }

  const json = await response.json();
  const { result } = json;
  if (!Array.isArray(result)) {
    return [];
  }

  return result
    .map((item: unknown) => {
      const parsed = BookingHotelSchema.safeParse(item);
      if (!parsed.success) {
        return null;
      }
      const { hotel_id, name, review_score, price_breakdown, photo1, address } = parsed.data;
      return {
        id: hotel_id,
        name,
        rating: review_score,
        pricePerNight: price_breakdown?.gross_price,
        currency: price_breakdown?.currency,
        imageUrl: photo1,
        location: address ?? searchCity,
        bookingSource: 'booking' as const,
        raw: item,
      };
    })
    .filter((item): item is HotelOption => Boolean(item));
}

export async function searchHotels(params: {
  cityName: string;
  checkin: string;
  checkout: string;
  budgetMin?: number;
  budgetMax?: number;
  limit?: number;
}): Promise<HotelOption[]> {
  ensureEnvFor('hotel');

  // Clean location name before processing
  const cleaned = cleanLocationName(params.cityName);
  const searchCity = cleaned || params.cityName;
  
  if (!searchCity) {
    throw new Error('Invalid city name for hotel search. Please provide a valid city name.');
  }

  const cacheKey = `hotel:${searchCity.toLowerCase()}:${params.checkin}:${params.checkout}:${params.budgetMin ?? 'all'}:${params.budgetMax ?? 'all'}`;
  
  // Check localStorage cache first
  const storageCached = getCachedResultFromStorage<HotelOption[]>(cacheKey);
  if (storageCached) {
    return applyHotelFilters(storageCached, params.budgetMin, params.budgetMax, params.limit);
  }
  
  // Check in-memory cache
  const cached = getCachedValue(hotelCache, cacheKey);
  if (cached) {
    return applyHotelFilters(cached, params.budgetMin, params.budgetMax, params.limit);
  }

  // Rate limit and fetch hotels from both sources
  const results = await rateLimitedApiCall(async () => {
    const [amadeusHotels, bookingHotels] = await Promise.allSettled([
      searchAmadeusHotels(searchCity),
      searchBookingHotels({
        ...params,
        cityName: searchCity,
      }),
    ]);

    const hotelResults: HotelOption[] = [];

    if (amadeusHotels.status === 'fulfilled') {
      hotelResults.push(...amadeusHotels.value);
    }
    if (bookingHotels.status === 'fulfilled') {
      hotelResults.push(...bookingHotels.value);
    }

    return hotelResults;
  });

  // Apply filters and limit
  const filteredResults = applyHotelFilters(results, params.budgetMin, params.budgetMax, params.limit);

  // Cache original results (before filtering) for reuse with different filters
  setCachedValue(hotelCache, cacheKey, results);
  cacheResultToStorage(cacheKey, results);
  
  return filteredResults;
}

/**
 * Filter and limit hotel results by budget range with price diversity
 */
function applyHotelFilters(
  hotels: HotelOption[],
  budgetMin?: number,
  budgetMax?: number,
  limit: number = 10
): HotelOption[] {
  let filtered = [...hotels];

  // Filter by budget range if provided
  if (budgetMin !== undefined || budgetMax !== undefined) {
    filtered = filtered.filter((hotel) => {
      const price = hotel.pricePerNight;
      if (price === undefined) return true; // Include hotels without price if no budget filter
      
      if (budgetMin !== undefined && price < budgetMin) return false;
      if (budgetMax !== undefined && price > budgetMax) return false;
      return true;
    });
  }

  // If no limit specified or results are fewer than limit, return all
  if (limit === undefined || filtered.length <= limit) {
    return filtered;
  }

  // Sort by price
  const sorted = [...filtered].sort((a, b) => {
    const priceA = a.pricePerNight ?? Number.POSITIVE_INFINITY;
    const priceB = b.pricePerNight ?? Number.POSITIVE_INFINITY;
    return priceA - priceB;
  });

  // Divide into price ranges and pick diverse options
  const total = sorted.length;
  const budgetRange = sorted[total - 1].pricePerNight ?? 0 - (sorted[0].pricePerNight ?? 0);
  
  if (budgetRange === 0) {
    // All same price, just return first N
    return sorted.slice(0, limit);
  }

  // Divide into 3 buckets: budget, mid-range, luxury
  const budgetEnd = sorted[0].pricePerNight ?? 0 + budgetRange / 3;
  const midEnd = sorted[0].pricePerNight ?? 0 + (budgetRange * 2) / 3;

  const budgetHotels = sorted.filter((h) => (h.pricePerNight ?? 0) <= budgetEnd);
  const midHotels = sorted.filter((h) => (h.pricePerNight ?? 0) > budgetEnd && (h.pricePerNight ?? 0) <= midEnd);
  const luxuryHotels = sorted.filter((h) => (h.pricePerNight ?? 0) > midEnd);

  // Pick from each bucket
  const perBucket = Math.ceil(limit / 3);
  const selected: HotelOption[] = [];

  // Pick from budget (2-3 hotels)
  selected.push(...budgetHotels.slice(0, Math.min(perBucket, budgetHotels.length)));

  // Pick from mid-range (2-3 hotels)
  if (selected.length < limit) {
    selected.push(...midHotels.slice(0, Math.min(perBucket, midHotels.length)));
  }

  // Pick from luxury (2-3 hotels)
  if (selected.length < limit) {
    selected.push(...luxuryHotels.slice(0, Math.min(perBucket, luxuryHotels.length)));
  }

  // If we still need more, fill from remaining
  const selectedIds = new Set(selected.map((h) => h.id));
  const remaining = sorted.filter((h) => !selectedIds.has(h.id));
  selected.push(...remaining.slice(0, limit - selected.length));

  // Shuffle to mix price ranges
  return selected.sort(() => Math.random() - 0.5).slice(0, limit);
}

export function highlightRecommendedOption<T extends { price?: number }>(options: T[]): T | null {
  const priceCandidates = options.filter((item) => typeof item.price === 'number');
  if (priceCandidates.length > 0) {
    return pickBest(priceCandidates, (item) => item.price ?? Number.POSITIVE_INFINITY);
  }
  return options[0] ?? null;
}

export function isBrowserEnvironment(): boolean {
  return isBrowser;
}


