import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createServer } from 'http';
import { Server } from 'socket.io';
import axios from 'axios';

// In-memory storage for SOS sessions (prototype - use database in production)
const sosSessions: Record<string, any> = {};
const sosSessionsByPhone: Record<string, string> = {};

// Load environment variables
// Try loading from server directory first, then root
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // In production, specify your frontend URLs
    methods: ['GET', 'POST'],
  },
});
const PORT = process.env.PORT || 3001;

// Validate required environment variables
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY is missing!');
  console.error('📝 Please create a .env file in the server directory with:');
  console.error('   OPENAI_API_KEY=your_openai_api_key_here');
  console.error('   OPENWEATHER_API_KEY=your_openweather_api_key_here');
  console.error('');
  console.error('💡 Get your keys from:');
  console.error('   OpenAI: https://platform.openai.com/api-keys');
  console.error('   OpenWeather: https://openweathermap.org/api');
  process.exit(1);
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// OpenWeather API Configuration
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

if (!OPENWEATHER_API_KEY) {
  console.warn('⚠️  WARNING: OPENWEATHER_API_KEY not found in environment variables');
  console.warn('   Weather features will not work. Add OPENWEATHER_API_KEY to your .env file');
  console.warn('   Get your key from: https://openweathermap.org/api');
} else {
  const key = OPENWEATHER_API_KEY.trim();
  console.log(`✅ OpenWeather API key loaded: ${key.substring(0, 4)}...${key.substring(key.length - 4)} (length: ${key.length})`);
}

const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const OPENWEATHER_GEO_URL = 'https://api.openweathermap.org/geo/1.0'; // Geocoding API uses different base URL

// TextBee Configuration for SMS
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_BASE_URL = 'https://api.textbee.dev/api/v1';

let textbeeConfigured = false;

if (TEXTBEE_API_KEY && TEXTBEE_DEVICE_ID) {
  textbeeConfigured = true;
  console.log(`✅ TextBee initialized with device: ${TEXTBEE_DEVICE_ID.substring(0, 8)}...`);
} else {
  console.warn('⚠️  WARNING: TextBee credentials not found. SMS features will not work.');
  console.warn('   Add TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID to your .env file');
  console.warn('   Get your credentials from: https://textbee.dev');
}

// Weather data interface
interface WeatherData {
  date: string;
  temperature: number;
  condition: string;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

// Seasonal validation interface
interface SeasonalValidation {
  isValid: boolean;
  warnings: string[];
  suggestions: string[];
  severity: 'safe' | 'caution' | 'unsafe';
}

// Seasonal rules database for Indian destinations
interface SeasonalRule {
  location: string; // Can be city name or region
  bestMonths: number[]; // 1-12
  avoidMonths: number[]; // 1-12
  unsafeMonths: number[]; // 1-12 (absolutely unsafe)
  reason: string;
  alternatives?: string;
  specificWarnings?: { [key: number]: string }; // month -> warning
}

// Comprehensive seasonal rules for popular Indian destinations
const SEASONAL_RULES: SeasonalRule[] = [
  // Beach destinations - Monsoon warnings
  {
    location: 'Goa',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [6, 7, 8, 9],
    unsafeMonths: [7, 8],
    reason: 'Heavy monsoon makes beaches unsafe, water sports unavailable, strong currents and rough seas',
    alternatives: 'Consider Kerala backwaters, Pondicherry (off-season but accessible), or wait until October',
    specificWarnings: {
      6: 'Monsoon starting - beaches becoming unsafe, many shacks closed',
      7: 'Peak monsoon - beaches closed, water sports completely unavailable, dangerous sea conditions',
      8: 'Heavy rainfall continues - most beach activities unsafe, limited restaurant options',
      9: 'Monsoon tail-end - still rainy, beaches not fully operational'
    }
  },
  {
    location: 'Kerala',
    bestMonths: [9, 10, 11, 12, 1, 2, 3],
    avoidMonths: [5, 6, 7, 8],
    unsafeMonths: [],
    reason: 'Monsoon season (June-August) brings heavy rains but backwaters are still accessible. May is extremely hot and humid.',
    alternatives: 'Backwater stays are beautiful during monsoon (June-August) but beach activities not recommended. October-March is ideal for all activities.',
    specificWarnings: {
      5: 'Extreme heat and humidity - outdoor activities very uncomfortable',
      6: 'Monsoon starts - beaches less suitable, backwaters beautiful',
      7: 'Peak monsoon - expect heavy rains, plan indoor activities',
      8: 'Monsoon continues - lush greenery but frequent rain'
    }
  },
  {
    location: 'Andaman',
    bestMonths: [10, 11, 12, 1, 2, 3, 4],
    avoidMonths: [5, 6, 7, 8, 9],
    unsafeMonths: [6, 7, 8],
    reason: 'Monsoon brings rough seas, many ferries cancelled, water sports unsafe, poor visibility for diving',
    alternatives: 'Visit between October-April for best weather and water activities',
    specificWarnings: {
      6: 'Monsoon begins - ferry services disrupted, snorkeling/diving poor visibility',
      7: 'Peak monsoon - many islands inaccessible, water sports cancelled',
      8: 'Heavy rains continue - rough seas make ferry travel uncomfortable and unsafe'
    }
  },
  
  // High-altitude destinations - Winter warnings
  {
    location: 'Ladakh',
    bestMonths: [5, 6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4],
    unsafeMonths: [12, 1, 2],
    reason: 'Roads closed due to heavy snowfall, extreme cold (-20°C to -30°C), most hotels closed, oxygen levels dangerously low',
    alternatives: 'Visit May-September only. For winter experiences, consider Manali, Shimla, or Auli which remain accessible.',
    specificWarnings: {
      10: 'Getting very cold, some roads starting to close',
      11: 'Many roads closed, most hotels shut for winter',
      12: 'Complete road closure (Manali-Leh, Srinagar-Leh), extreme cold, no tourism infrastructure',
      1: 'Peak winter - roads blocked, temperatures -25°C, life-threatening conditions',
      2: 'Still extreme winter conditions, roads remain closed',
      3: 'Snow melting begins but roads still closed, unpredictable weather',
      4: 'Roads opening late April - still risky, carry winter gear'
    }
  },
  {
    location: 'Spiti Valley',
    bestMonths: [6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4, 5],
    unsafeMonths: [11, 12, 1, 2, 3],
    reason: 'Roads completely closed, extreme snowfall, temperatures drop to -30°C, no access possible',
    alternatives: 'Only accessible June-September. For winter mountain trips, visit Manali, Shimla, or Mussoorie.',
    specificWarnings: {
      11: 'Roads closing, heavy snowfall begins',
      12: 'Completely cut off from rest of India',
      1: 'Peak winter - no access, extreme cold',
      2: 'Continues to be inaccessible',
      3: 'Roads still blocked'
    }
  },
  {
    location: 'Manali',
    bestMonths: [3, 4, 5, 6, 9, 10, 11],
    avoidMonths: [7, 8],
    unsafeMonths: [],
    reason: 'July-August is monsoon season with landslides and road blockages common. December-February is very cold but accessible for snow lovers.',
    alternatives: 'March-June and September-November are ideal. December-January good for snow activities but carry heavy winter gear.',
    specificWarnings: {
      7: 'Monsoon - frequent landslides, road closures common',
      8: 'Peak monsoon - risky mountain roads, avoid if possible',
      12: 'Heavy snowfall - roads may be closed temporarily, carry chains',
      1: 'Peak winter - heavy snow, sub-zero temperatures, snow activities available',
      2: 'Still very cold, roads can be blocked after fresh snowfall'
    }
  },
  {
    location: 'Leh',
    bestMonths: [5, 6, 7, 8, 9],
    avoidMonths: [10, 11, 12, 1, 2, 3, 4],
    unsafeMonths: [11, 12, 1, 2],
    reason: 'Same as Ladakh - extreme winter conditions, complete road closure',
    alternatives: 'Only May-September. Fly in if visiting in shoulder months (April/October) as roads may be closed.'
  },
  
  // Desert destinations - Summer warnings
  {
    location: 'Jaisalmer',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [4, 5, 6, 7, 8],
    unsafeMonths: [5, 6],
    reason: 'Extreme desert heat (45-50°C), sand storms, outdoor activities dangerous, risk of heat stroke',
    alternatives: 'October-March is perfect. For summer travel, consider hill stations like Shimla, Ooty, or Coorg.',
    specificWarnings: {
      4: 'Heat building up (38-42°C) - outdoor activities uncomfortable',
      5: 'Extreme heat (45-48°C) - desert safaris dangerous, camel rides only early morning/evening',
      6: 'Peak summer (48-50°C) - outdoor activities life-threatening, stay indoors 10 AM - 6 PM',
      7: 'Monsoon heat and humidity - still very hot (40-45°C)',
      8: 'Continued heat - not recommended for tourism'
    }
  },
  {
    location: 'Jodhpur',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [4, 5, 6, 7],
    unsafeMonths: [5, 6],
    reason: 'Extreme desert heat makes sightseeing unbearable, fort visits dangerous due to heat exposure',
    alternatives: 'Visit October-March. Summer alternatives: Udaipur (slightly cooler), or hill stations.',
    specificWarnings: {
      5: 'Extreme heat (44-48°C) - fort visits only early morning, risk of dehydration',
      6: 'Peak heat (46-50°C) - avoid midday activities, heat exhaustion risk'
    }
  },
  {
    location: 'Bikaner',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [4, 5, 6, 7],
    unsafeMonths: [5, 6],
    reason: 'Similar to Jaisalmer - extreme desert heat',
    alternatives: 'October-March only for comfortable sightseeing.'
  },
  
  // Hill stations - Snow and Monsoon considerations
  {
    location: 'Shimla',
    bestMonths: [3, 4, 5, 6, 10, 11, 12],
    avoidMonths: [7, 8, 9],
    unsafeMonths: [],
    reason: 'Monsoon brings heavy rainfall and landslides. December-January has snow (good for snow lovers).',
    alternatives: 'March-June for pleasant weather, December-January for snow experience.',
    specificWarnings: {
      7: 'Heavy monsoon - landslides common on mountain roads',
      8: 'Peak monsoon - road travel risky',
      1: 'Snowfall expected - carry winter gear, roads may be temporarily closed'
    }
  },
  {
    location: 'Mussoorie',
    bestMonths: [3, 4, 5, 6, 9, 10, 11],
    avoidMonths: [7, 8],
    unsafeMonths: [],
    reason: 'Heavy monsoon rains, poor visibility, landslides on approach roads',
    alternatives: 'March-June and September-November ideal. December-February cold but accessible.',
    specificWarnings: {
      7: 'Monsoon - frequent landslides',
      8: 'Heavy rains continue'
    }
  },
  {
    location: 'Ooty',
    bestMonths: [10, 11, 12, 1, 2, 3, 4, 5],
    avoidMonths: [6, 7, 8, 9],
    unsafeMonths: [],
    reason: 'Monsoon season - heavy rains, landslides, poor visibility',
    alternatives: 'October-May is excellent with pleasant weather year-round.'
  },
  {
    location: 'Darjeeling',
    bestMonths: [3, 4, 5, 10, 11],
    avoidMonths: [6, 7, 8, 9],
    unsafeMonths: [],
    reason: 'Monsoon brings heavy rains, landslides, and obscures mountain views (no Kanchenjunga visibility)',
    alternatives: 'March-May and October-November for clear mountain views.',
    specificWarnings: {
      6: 'Monsoon starts - views getting obscured',
      7: 'Heavy rains - landslides, no mountain views',
      8: 'Peak monsoon - dangerous roads, zero visibility'
    }
  },
  
  // Coastal and Monsoon-affected regions
  {
    location: 'Mumbai',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [6, 7, 8],
    unsafeMonths: [],
    reason: 'Heavy monsoon rains, flooding in low-lying areas, local train disruptions',
    alternatives: 'October-March is ideal. Monsoon (June-August) can be experienced but expect rain daily.',
    specificWarnings: {
      7: 'Peak monsoon - flooding possible, carry umbrellas, check local train status',
      8: 'Heavy rains continue - some areas waterlogged'
    }
  },
  {
    location: 'Coorg',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [6, 7, 8],
    unsafeMonths: [],
    reason: 'Heavy monsoon rains, leeches in forests, waterfalls dangerous due to strong currents',
    alternatives: 'October-March is best. Monsoon is beautiful (lush green) but outdoor activities limited.',
    specificWarnings: {
      7: 'Heavy rains - trekking not recommended, waterfalls dangerous',
      8: 'Peak monsoon - leeches in forests, slippery trails'
    }
  },
  
  // Plains - Extreme summer warnings
  {
    location: 'Delhi',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [5, 6, 7],
    unsafeMonths: [],
    reason: 'Extreme heat in May-June (45°C+), uncomfortable for sightseeing. July-August is humid due to monsoon.',
    alternatives: 'October-March is perfect. April and September are manageable.',
    specificWarnings: {
      5: 'Extreme heat (42-46°C) - sightseeing uncomfortable, stay in AC',
      6: 'Peak summer (44-48°C) - outdoor monuments unbearable midday',
      7: 'Hot and humid monsoon - rain and heat combination'
    }
  },
  {
    location: 'Agra',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [5, 6, 7],
    unsafeMonths: [],
    reason: 'Extreme heat makes Taj Mahal visit exhausting. Smog in winter mornings but temperatures pleasant.',
    alternatives: 'October-March best. Sunrise Taj visit recommended in summer if visiting.',
    specificWarnings: {
      5: 'Extreme heat (44-48°C) - visit Taj Mahal only early morning or late evening',
      6: 'Peak summer - avoid midday monument visits'
    }
  },
  {
    location: 'Jaipur',
    bestMonths: [10, 11, 12, 1, 2, 3],
    avoidMonths: [5, 6, 7],
    unsafeMonths: [],
    reason: 'Desert heat makes fort visits exhausting and potentially dangerous',
    alternatives: 'October-March ideal. Carry water and sun protection in summer.',
    specificWarnings: {
      5: 'Extreme heat (43-47°C) - fort visits only early morning',
      6: 'Peak heat - risk of heat stroke during outdoor activities'
    }
  }
];

// Function to validate season-place compatibility
function validateSeasonalCompatibility(destination: string, travelMonth: number): SeasonalValidation {
  const validation: SeasonalValidation = {
    isValid: true,
    warnings: [],
    suggestions: [],
    severity: 'safe'
  };

  // Find matching seasonal rule
  const rule = SEASONAL_RULES.find(r => 
    destination.toLowerCase().includes(r.location.toLowerCase()) ||
    r.location.toLowerCase().includes(destination.toLowerCase())
  );

  if (!rule) {
    // No specific rule found, but add general seasonal advice for India
    if (travelMonth >= 6 && travelMonth <= 8) {
      validation.warnings.push('Monsoon season in most of India - expect rainfall');
      validation.suggestions.push('Carry rain gear and check weather forecasts daily');
    } else if (travelMonth >= 4 && travelMonth <= 6 && 
               (destination.toLowerCase().includes('delhi') || 
                destination.toLowerCase().includes('rajasthan') ||
                destination.toLowerCase().includes('north india'))) {
      validation.warnings.push('Summer season - can be very hot in plains and desert areas');
      validation.suggestions.push('Plan indoor activities during midday (12 PM - 4 PM)');
    }
    return validation;
  }

  // Check if month is unsafe
  if (rule.unsafeMonths.includes(travelMonth)) {
    validation.isValid = false;
    validation.severity = 'unsafe';
    validation.warnings.push(`⚠️ UNSAFE: ${destination} in ${getMonthName(travelMonth)} - ${rule.reason}`);
    if (rule.alternatives) {
      validation.suggestions.push(`STRONGLY RECOMMENDED: ${rule.alternatives}`);
    }
    validation.suggestions.push(`Best months to visit ${destination}: ${rule.bestMonths.map(m => getMonthName(m)).join(', ')}`);
  }
  // Check if month should be avoided
  else if (rule.avoidMonths.includes(travelMonth)) {
    validation.isValid = true; // Not blocking, but warning
    validation.severity = 'caution';
    validation.warnings.push(`⚠️ CAUTION: ${destination} in ${getMonthName(travelMonth)} - ${rule.reason}`);
    if (rule.alternatives) {
      validation.suggestions.push(`Consider: ${rule.alternatives}`);
    }
  }
  // Check if it's best months (add positive reinforcement)
  else if (rule.bestMonths.includes(travelMonth)) {
    validation.warnings.push(`✅ EXCELLENT TIMING: ${getMonthName(travelMonth)} is one of the best months to visit ${destination}`);
    validation.severity = 'safe';
  }

  // Add specific monthly warnings if available
  if (rule.specificWarnings && rule.specificWarnings[travelMonth]) {
    validation.warnings.push(rule.specificWarnings[travelMonth]);
  }

  return validation;
}

// Helper function to get month name
function getMonthName(month: number): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || 'Unknown';
}

// OpenWeather API response types
interface GeoLocationResponse {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

interface WeatherForecastItem {
  dt: number;
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{
    main: string;
    description: string;
    icon: string;
  }>;
  wind?: {
    speed: number;
  };
}

interface WeatherForecastResponse {
  list: WeatherForecastItem[];
}

// Function to fetch weather forecast for a city
async function fetchWeatherForecast(city: string, startDate: string, endDate: string): Promise<WeatherData[]> {
  try {
    // Validate API key
    if (!OPENWEATHER_API_KEY || OPENWEATHER_API_KEY.length < 10) {
      console.warn('OpenWeather API key appears to be missing or invalid. Weather data will be unavailable.');
      console.warn('💡 Tip: Make sure your .env file contains: OPENWEATHER_API_KEY=your_key_here');
      return [];
    }

    // Clean and validate API key (remove any whitespace)
    const cleanApiKey = OPENWEATHER_API_KEY?.trim() || '';
    
    if (!cleanApiKey || cleanApiKey.length < 10) {
      console.warn('OpenWeather API key appears to be missing or invalid. Weather data will be unavailable.');
      console.warn('💡 Tip: Make sure your .env file contains: OPENWEATHER_API_KEY=your_key_here');
      return [];
    }
    
    // Use the cleaned API key
    const apiKeyToUse = cleanApiKey;

    // Always search with ", India" to get correct location (avoid confusion with cities in other countries)
    // For example: "Goa" could match "Goa, Philippines" instead of "Goa, India"
    const searchQuery = `${city}, India`;
    console.log(`Fetching weather for: "${searchQuery}"`);
    
    const geoResponse = await fetch(
      `${OPENWEATHER_GEO_URL}/direct?q=${encodeURIComponent(searchQuery)}&limit=1&appid=${apiKeyToUse}`
    );
    
    if (!geoResponse.ok) {
      const errorText = await geoResponse.text();
      console.error(`Weather API error (${geoResponse.status}) for "${searchQuery}":`, errorText.substring(0, 200));
      
      // Check if it's an API key issue
      if (geoResponse.status === 401 || geoResponse.status === 403) {
        console.error('❌ OpenWeather API key error (401/403) - Invalid API key.');
        console.error('📋 Troubleshooting steps:');
        console.error('   1. Verify your API key at: https://home.openweathermap.org/api_keys');
        console.error('   2. New API keys can take 2-24 hours to activate');
        console.error('   3. Make sure your .env file is in the server/ directory');
        console.error('   4. Check your .env file format: OPENWEATHER_API_KEY=your_key_here (no quotes, no spaces)');
        console.error('   5. Geocoding API might require a paid subscription - check your plan');
        console.error('   6. Restart your server after updating .env file');
        console.error(`   Current key being used: ${apiKeyToUse.substring(0, 4)}...${apiKeyToUse.substring(apiKeyToUse.length - 4)}`);
        return []; // Return empty array instead of throwing
      }
        
        // Don't throw - just return empty array so plan generation can continue
        console.warn(`Skipping weather data for "${city}". Plan generation will continue without weather information.`);
        return [];
    }
    
    const geoData = await geoResponse.json() as GeoLocationResponse[];
    if (!geoData || geoData.length === 0) {
      console.log(`❌ No coordinates found for city: ${searchQuery}`);
      return []; // Return empty array, plan generation will continue without weather
    }
    
    const { lat, lon, name, country, state } = geoData[0];
    console.log(`✅ Found coordinates: ${name}, ${state || ''}, ${country} (${lat.toFixed(4)}, ${lon.toFixed(4)})`);
    
    // Get 5-day forecast
    const forecastResponse = await fetch(
      `${OPENWEATHER_BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${apiKeyToUse}`
    );
    
    if (!forecastResponse.ok) {
      const forecastErrorText = await forecastResponse.text();
      console.error(`Weather forecast API error (${forecastResponse.status}):`, forecastErrorText.substring(0, 200));
      console.warn(`Could not fetch weather forecast for "${city}". Plan generation will continue without weather information.`);
      return []; // Return empty array instead of throwing
    }
    
    const forecastData = await forecastResponse.json() as WeatherForecastResponse;
    
    // Calculate date range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days: WeatherData[] = [];
    const processedDates = new Set<string>();
    
    // Process forecasts and group by day
    if (forecastData.list && Array.isArray(forecastData.list)) {
      forecastData.list.forEach((forecast) => {
        const forecastDate = new Date(forecast.dt * 1000);
        const dateKey = forecastDate.toISOString().split('T')[0];
        
        // Only include dates within trip range and take first forecast of each day
        if (forecastDate >= start && forecastDate <= end && !processedDates.has(dateKey)) {
          processedDates.add(dateKey);
          days.push({
            date: dateKey,
            temperature: Math.round(forecast.main.temp),
            condition: forecast.weather[0]?.main || 'Unknown',
            description: forecast.weather[0]?.description || 'No description',
            icon: forecast.weather[0]?.icon || '01d',
            humidity: forecast.main.humidity,
            windSpeed: forecast.wind?.speed || 0
          });
        }
      });
    }
    
    return days;
  } catch (error) {
    console.error('Error fetching weather:', error);
    return []; // Return empty array on error, plan generation will continue
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Simple in-memory cache for travel search results
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const travelCache = new Map<string, CacheEntry<any>>();

function getCacheKey(type: string, params: Record<string, string | number>): string {
  return `${type}:${JSON.stringify(params)}`;
}

function getCached<T>(key: string): T | null {
  const entry = travelCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    travelCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttlMinutes: number = 15): void {
  travelCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
  });
}

// Generate mock flight data using OpenAI when API is unavailable
async function generateMockFlightsWithOpenAI(originIata: string, destIata: string, date: string, travelers: number, fromCity: string, toCity: string): Promise<any[]> {
  console.log(`🤖 Generating mock flight data using OpenAI for ${fromCity} (${originIata}) → ${toCity} (${destIata}) on ${date}`);
  
  try {
    const prompt = `Generate realistic flight data for a domestic flight route in India. 

Route: ${fromCity} (${originIata}) to ${toCity} (${destIata})
Date: ${date}
Number of travelers: ${travelers}

Generate 6-8 realistic flight options with the following details for each flight:
- Airline name (use real Indian airlines like IndiGo, Air India, SpiceJet, Vistara, GoAir, AirAsia India)
- Flight number (format: airline code + 3-4 digits, e.g., 6E123, AI456, SG789)
- Departure time (between 06:00 and 22:00, in HH:MM format)
- Arrival time (1-4 hours after departure, in HH:MM format)
- Duration (calculate from departure to arrival, format: "Xh Ym")
- Price per person in INR (between ₹3,000 and ₹15,000, vary by time of day and airline)

Return ONLY a valid JSON array with this exact structure:
[
  {
    "airline": "Airline Name",
    "flightNumber": "XX123",
    "departureTime": "HH:MM",
    "arrivalTime": "HH:MM",
    "duration": "Xh Ym",
    "pricePerPerson": 5000
  },
  ...
]

Make the flights realistic - morning flights should be cheaper, evening flights more expensive. Include a mix of budget and full-service airlines.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a flight data generator. Always return valid JSON arrays only, no additional text or explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    console.log(`📥 OpenAI response: ${responseText.substring(0, 200)}...`);

    // Parse JSON from response (might have markdown code blocks)
    let flightsData: any[] = [];
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      flightsData = JSON.parse(cleanedResponse);
      
      if (!Array.isArray(flightsData)) {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      console.warn('⚠️ Failed to parse OpenAI response as JSON, using fallback generator');
      return generateMockFlights(originIata, destIata, date, travelers, fromCity, toCity);
    }

    // Format flights to match expected structure
    const flights = flightsData.map((flight: any, index: number) => {
      const price = Math.round((flight.pricePerPerson || 5000) * travelers);
      const flightNumber = flight.flightNumber || `FL${100 + index}`;
      const airline = flight.airline || 'Airline';
      
      return {
        id: `${flightNumber}-${Date.now()}-${index}`,
        airline: airline,
        flightNumber: flightNumber,
        departureTime: flight.departureTime || '00:00',
        arrivalTime: flight.arrivalTime || '00:00',
        duration: flight.duration || '2h 0m',
        price: price,
        currency: 'INR',
        origin: originIata,
        destination: destIata,
        raw: {
          flight: { iata: flightNumber, number: flightNumber },
          airline: { name: airline, iata: airline.substring(0, 2).toUpperCase() },
          departure: { iata: originIata, scheduled: `${date}T${flight.departureTime || '00:00'}:00` },
          arrival: { iata: destIata, scheduled: `${date}T${flight.arrivalTime || '00:00'}:00` },
        },
      };
    });

    console.log(`✅ Generated ${flights.length} mock flights using OpenAI`);
    return flights;
  } catch (error) {
    console.error('❌ Error generating flights with OpenAI:', error);
    console.log('📝 Falling back to simple mock flight generator...');
    return generateMockFlights(originIata, destIata, date, travelers, fromCity, toCity);
  }
}

// Generate simple mock flight data (fallback when OpenAI fails)
function generateMockFlights(originIata: string, destIata: string, date: string, travelers: number, fromCity: string, toCity: string): any[] {
  console.log(`📝 Generating simple mock flight data for ${fromCity} (${originIata}) → ${toCity} (${destIata}) on ${date}`);
  
  const airlines = ['IndiGo', 'Air India', 'SpiceJet', 'Vistara', 'GoAir', 'AirAsia'];
  const basePrice = 5000 + Math.random() * 15000;
  
  // Generate 5-8 mock flights
  const flightCount = 5 + Math.floor(Math.random() * 4);
  const flights = [];
  
  for (let i = 0; i < flightCount; i++) {
    const airline = airlines[Math.floor(Math.random() * airlines.length)];
    const flightNumber = `${airline.substring(0, 2).toUpperCase()}${100 + i}${Math.floor(Math.random() * 10)}`;
    
    // Generate departure time between 6 AM and 10 PM
    const depHour = 6 + Math.floor(Math.random() * 16);
    const depMin = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
    const depTime = `${String(depHour).padStart(2, '0')}:${String(depMin).padStart(2, '0')}`;
    
    // Arrival time 1-4 hours later
    const durationHours = 1 + Math.floor(Math.random() * 3);
    const durationMins = Math.floor(Math.random() * 4) * 15;
    const arrHour = depHour + durationHours;
    const arrMin = depMin + durationMins;
    const arrTime = `${String(arrHour % 24).padStart(2, '0')}:${String(arrMin % 60).padStart(2, '0')}`;
    
    const duration = `${durationHours}h ${durationMins}m`;
    const price = Math.round(basePrice * (1 + i * 0.15) * travelers);
    
    flights.push({
      id: `${flightNumber}-${Date.now()}-${i}`,
      airline: airline,
      flightNumber: flightNumber,
      departureTime: depTime,
      arrivalTime: arrTime,
      duration: duration,
      price: price,
      currency: 'INR',
      origin: originIata,
      destination: destIata,
      raw: {
        flight: { iata: flightNumber, number: flightNumber },
        airline: { name: airline, iata: airline.substring(0, 2).toUpperCase() },
        departure: { iata: originIata, scheduled: `${date}T${depTime}:00` },
        arrival: { iata: destIata, scheduled: `${date}T${arrTime}:00` },
      },
    });
  }
  
  console.log(`✅ Generated ${flights.length} simple mock flights`);
  return flights;
}

// Helper function to clean location names - improved to extract city names from addresses
function cleanLocationName(raw: string): string {
  if (!raw) return '';
  
  // Common Indian city names to look for
  const indianCities = [
    'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata', 'pune', 'ahmedabad',
    'jaipur', 'surat', 'lucknow', 'kanpur', 'nagpur', 'indore', 'thane', 'bhopal', 'visakhapatnam',
    'patna', 'vadodara', 'ghaziabad', 'ludhiana', 'agra', 'nashik', 'faridabad', 'meerut', 'rajkot',
    'varanasi', 'varanaasi', 'srinagar', 'amritsar', 'ranchi', 'jabalpur', 'gwalior', 'coimbatore',
    'vijayawada', 'jodhpur', 'madurai', 'raipur', 'kota', 'guwahati', 'chandigarh', 'solapur',
    'hubli', 'dharwad', 'mysore', 'kochi', 'kozhikode', 'thiruvananthapuram', 'bhubaneswar', 'dehradun'
  ];
  
  const lowerRaw = raw.toLowerCase();
  
  // Try to find a known city name in the input
  for (const city of indianCities) {
    if (lowerRaw.includes(city)) {
      // Return the proper case version
      if (city === 'bengaluru') return 'Bangalore';
      if (city === 'varanaasi') return 'Varanasi';
      return city.charAt(0).toUpperCase() + city.slice(1);
    }
  }
  
  // If no known city found, try to extract the last significant word (usually the city)
  // Remove common address parts
  let cleaned = raw
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\b(road|rd|street|st|avenue|ave|lane|ln|drive|dr|boulevard|blvd|circle|cir|way|state|district|pin|pincode|postal|code|area|locality|colony|nagar|layout|extension|ext|main|cross|near|opposite|opp|behind|beside|next|to|from|and|the|of|in|at|on)\b/gi, ' ')
    .trim();
  
  // Split and get the last meaningful word (usually city name)
  const words = cleaned.split(/\s+/).filter(word => word.length > 2);
  if (words.length > 0) {
    return words[words.length - 1].charAt(0).toUpperCase() + words[words.length - 1].slice(1).toLowerCase();
  }
  
  // Fallback: return first two words
  return words.slice(0, 2).join(' ');
}

// Amadeus API configuration
const AMADEUS_API_KEY = process.env.VITE_AMADEUS_API_KEY || process.env.AMADEUS_API_KEY;
const AMADEUS_API_SECRET = process.env.VITE_AMADEUS_API_SECRET || process.env.AMADEUS_API_SECRET;
const RAPID_API_KEY = process.env.VITE_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
const AMADEUS_BASE_URL = 'https://test.api.amadeus.com';

// Log API key status on startup (after dotenv loads)
setTimeout(() => {
  console.log('\n🔑 API Keys Status:');
  console.log(`  AMADEUS_API_KEY: ${AMADEUS_API_KEY ? `✅ Set (${AMADEUS_API_KEY.substring(0, 4)}...)` : '❌ Missing'}`);
  console.log(`  AMADEUS_API_SECRET: ${AMADEUS_API_SECRET ? `✅ Set (${AMADEUS_API_SECRET.substring(0, 4)}...)` : '❌ Missing'}`);
  console.log(`  RAPID_API_KEY: ${RAPID_API_KEY ? `✅ Set (${RAPID_API_KEY.substring(0, 4)}...)` : '❌ Missing'}\n`);
}, 1000);

interface AmadeusToken {
  token: string;
  expiresAt: number;
}

let amadeusTokenCache: AmadeusToken | null = null;

async function getAmadeusToken(): Promise<string> {
  if (amadeusTokenCache && Date.now() < amadeusTokenCache.expiresAt) {
    return amadeusTokenCache.token;
  }

  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
    throw new Error('Amadeus API credentials not configured');
  }

  const response = await fetch(`${AMADEUS_BASE_URL}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${AMADEUS_API_KEY}&client_secret=${AMADEUS_API_SECRET}`,
  });

  if (!response.ok) {
    throw new Error('Failed to get Amadeus token');
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  amadeusTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Refresh 1 minute early
  };

  return amadeusTokenCache.token;
}

// Global rate limiter for API calls
let lastApiCallTime = 0;
const MIN_API_INTERVAL_MS = 3000; // 3 seconds between calls

async function rateLimitedCall<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, MIN_API_INTERVAL_MS - (now - lastApiCallTime));
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  lastApiCallTime = Date.now();
  return fn();
}

// Search flights using AviationStack API
async function searchFlightsAPI(origin: string, destination: string, date: string, travelers: number = 1): Promise<any[]> {
  const AVIATIONSTACK_API_KEY = (process.env.AVIATIONSTACK_API_KEY || process.env.AVIATION_EDGE_API_KEY || '').trim();
  
  if (!AVIATIONSTACK_API_KEY || AVIATIONSTACK_API_KEY.length < 10) {
    console.error('❌ AVIATIONSTACK_API_KEY is missing or invalid. Please set it in your .env file.');
    console.error('   Get your API key from: https://aviationstack.com/');
    return [];
  }
  
  // Debug: Show first/last few chars of API key (for verification)
  const keyPreview = AVIATIONSTACK_API_KEY.length > 8 
    ? `${AVIATIONSTACK_API_KEY.substring(0, 4)}...${AVIATIONSTACK_API_KEY.substring(AVIATIONSTACK_API_KEY.length - 4)}`
    : '***';
  console.log(`🔑 Using AviationStack API Key: ${keyPreview} (length: ${AVIATIONSTACK_API_KEY.length})`);

  try {
    console.log(`🔍 Searching flights: ${origin} → ${destination} on ${date}`);
    const fromCity = cleanLocationName(origin);
    const toCity = cleanLocationName(destination);
    console.log(`📍 Cleaned locations: ${fromCity} → ${toCity}`);

    // Map common city names to IATA codes (fallback if API lookup fails)
    const cityToIataMap: Record<string, string> = {
      'bangalore': 'BLR',
      'bengaluru': 'BLR',
      'mumbai': 'BOM',
      'delhi': 'DEL',
      'new delhi': 'DEL',
      'chennai': 'MAA',
      'kolkata': 'CCU',
      'hyderabad': 'HYD',
      'pune': 'PNQ',
      'ahmedabad': 'AMD',
      'jaipur': 'JAI',
      'lucknow': 'LKO',
      'varanasi': 'VNS',
      'goa': 'GOI',
      'kochi': 'COK',
      'cochin': 'COK',
      'thiruvananthapuram': 'TRV',
      'surat': 'STV',
      'bhopal': 'BHO',
      'indore': 'IDR',
      'vadodara': 'BDQ',
      'nagpur': 'NAG',
      'patna': 'PAT',
      'chandigarh': 'IXC',
      'amritsar': 'ATQ',
      'udaipur': 'UDR',
      'jodhpur': 'JDH',
      'raipur': 'RPR',
      'bhubaneswar': 'BBI',
      'visakhapatnam': 'VTZ',
      'mysore': 'MYQ',
      'mangalore': 'IXE',
    };

    // Try to get IATA codes from city name mapping first
    const fromCityLower = fromCity.toLowerCase().trim();
    const toCityLower = toCity.toLowerCase().trim();
    
    let originIata = cityToIataMap[fromCityLower] || fromCity.toUpperCase().substring(0, 3);
    let destIata = cityToIataMap[toCityLower] || toCity.toUpperCase().substring(0, 3);

    // Try to get IATA codes from airport database by city name (using AviationStack)
    try {
      const originAirportsResponse = await fetch(
        `https://api.aviationstack.com/v1/airports?access_key=${AVIATIONSTACK_API_KEY}&search=${encodeURIComponent(fromCity)}&limit=10`
      );
      
      if (originAirportsResponse.ok) {
        const responseText = await originAirportsResponse.text();
        try {
          const originData = JSON.parse(responseText) as any[];
          if (originData && Array.isArray(originData) && originData.length > 0) {
            // Find the best match (prefer main airports with IATA codes)
            const mainAirport = originData.find((airport: any) => 
              airport.codeIataAirport && 
              airport.typeAirport === 'airport' &&
              (airport.nameCity?.toLowerCase().includes(fromCityLower) || 
               airport.nameAirport?.toLowerCase().includes(fromCityLower))
            ) || originData.find((airport: any) => airport.codeIataAirport) || originData[0];
            
            if (mainAirport?.codeIataAirport) {
              originIata = mainAirport.codeIataAirport;
              console.log(`✅ Found origin airport: ${originIata} - ${mainAirport.nameAirport || ''} (${mainAirport.nameCity || ''})`);
            }
          } else {
            const errorData = responseText ? JSON.parse(responseText) : null;
            if (errorData?.error === 'Invalid API Key') {
              console.error('🔑 API Key validation failed during airport lookup');
            } else {
              console.warn(`⚠️ No airports found for origin city: ${fromCity}`);
            }
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse origin airport response: ${responseText.substring(0, 100)}`);
        }
      } else {
        const errorText = await originAirportsResponse.text();
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error === 'Invalid API Key') {
            console.error('🔑 API Key is invalid. Please check your AVIATIONSTACK_API_KEY');
            console.error('   Response:', errorData);
      return [];
    }
        } catch (e) {
          console.warn(`⚠️ Airport lookup failed for origin: ${errorText.substring(0, 100)}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error looking up origin airport:`, error instanceof Error ? error.message : error);
    }

    try {
      const destAirportsResponse = await fetch(
        `https://api.aviationstack.com/v1/airports?access_key=${AVIATIONSTACK_API_KEY}&search=${encodeURIComponent(toCity)}&limit=10`
      );
      
      if (destAirportsResponse.ok) {
        const responseText = await destAirportsResponse.text();
        try {
          const destData = JSON.parse(responseText) as any[];
          if (destData && Array.isArray(destData) && destData.length > 0) {
            const mainAirport = destData.find((airport: any) => 
              airport.codeIataAirport && 
              airport.typeAirport === 'airport' &&
              (airport.nameCity?.toLowerCase().includes(toCityLower) || 
               airport.nameAirport?.toLowerCase().includes(toCityLower))
            ) || destData.find((airport: any) => airport.codeIataAirport) || destData[0];
            
            if (mainAirport?.codeIataAirport) {
              destIata = mainAirport.codeIataAirport;
              console.log(`✅ Found destination airport: ${destIata} - ${mainAirport.nameAirport || ''} (${mainAirport.nameCity || ''})`);
            }
          } else {
            console.warn(`⚠️ No airports found for destination city: ${toCity}`);
          }
        } catch (parseError) {
          console.warn(`⚠️ Failed to parse destination airport response: ${responseText.substring(0, 100)}`);
        }
      } else {
        const errorText = await destAirportsResponse.text();
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.code === 104 || errorData.error?.message?.includes('Invalid')) {
            console.error('🔑 API Key is invalid. Please check your AVIATIONSTACK_API_KEY');
            return [];
          }
        } catch (e) {
          console.warn(`⚠️ Airport lookup failed for destination: ${errorText.substring(0, 100)}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error looking up destination airport:`, error instanceof Error ? error.message : error);
    }

    console.log(`✈️ Using IATA Codes: ${originIata} → ${destIata}`);

    // Search flights using AviationStack API
    // Free tier: Real-time flights only (no flight_date parameter)
    // Paid tier: Historical flights with flight_date parameter
    const encodedKey = encodeURIComponent(AVIATIONSTACK_API_KEY);
    
    // Try real-time flights first (free tier supports this)
    let flightUrl = `https://api.aviationstack.com/v1/flights?access_key=${encodedKey}&dep_iata=${originIata}&arr_iata=${destIata}`;
    console.log(`🌐 Calling AviationStack API (real-time): ${flightUrl.replace(encodedKey, '***')}`);
    console.log(`🔑 API Key preview: ${AVIATIONSTACK_API_KEY.substring(0, 4)}...${AVIATIONSTACK_API_KEY.substring(AVIATIONSTACK_API_KEY.length - 4)} (length: ${AVIATIONSTACK_API_KEY.length})`);
    
    let flightResponse = await fetch(flightUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WanderWise-TripPlanner/1.0',
      },
    });

    let responseText = await flightResponse.text();
    console.log(`📡 Response status: ${flightResponse.status} ${flightResponse.statusText}`);
    console.log(`📡 Response preview: ${responseText.substring(0, 300)}`);

    // Check for API errors
    let hasError = false;
    let errorMessage = '';
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.error) {
        hasError = true;
        const errorCode = errorData.error.code;
        errorMessage = errorData.error.message || errorData.error.info || 'Unknown error';
        
        // If function_access_restricted, generate flights using OpenAI
        if (errorCode === 'function_access_restricted' || errorMessage.includes('subscription plan')) {
          console.warn('⚠️ Free tier detected - AviationStack API restricted');
          console.warn('   Generating realistic flight data using OpenAI...');
          
          // Generate mock flight data using OpenAI
          return await generateMockFlightsWithOpenAI(originIata, destIata, date, travelers, fromCity, toCity);
        }
        
        if (errorCode === 104 || errorMessage.includes('Invalid') || errorMessage.includes('access_key')) {
          console.error(`❌ AviationStack API Key Error: ${errorMessage}`);
          console.error('🔑 Troubleshooting:');
          console.error('   1. Verify API key in AviationStack dashboard: https://aviationstack.com/');
          console.error('   2. Check if key is active (not expired or revoked)');
          console.error(`   3. Current key length: ${AVIATIONSTACK_API_KEY.length} chars`);
          return [];
        } else {
          console.error(`❌ AviationStack API Error (${errorCode}): ${errorMessage}`);
          return [];
        }
      }
    } catch (e) {
      // Not a JSON error response, continue
    }

    if (!flightResponse.ok) {
      let errorMessage = `HTTP ${flightResponse.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error?.message || errorData.error?.info || errorMessage;
        console.error(`❌ Flight search failed: ${errorMessage}`);
      } catch (e) {
        console.error(`❌ Flight search failed (${flightResponse.status}):`, responseText.substring(0, 200));
      }
      return [];
    }

    if (!flightResponse.ok) {
      let errorMessage = `HTTP ${flightResponse.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorData.message || errorMessage;
        console.error(`❌ Flight search failed: ${errorMessage}`);
      } catch (e) {
        console.error(`❌ Flight search failed (${flightResponse.status}):`, responseText.substring(0, 200));
      }
      return [];
    }

    // Parse AviationStack response format: { data: [...], pagination: {...} }
    let flights: any[] = [];
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.data && Array.isArray(parsed.data)) {
        flights = parsed.data;
      } else if (Array.isArray(parsed)) {
        flights = parsed;
      } else if (parsed.flights && Array.isArray(parsed.flights)) {
        flights = parsed.flights;
      } else if (parsed.error) {
        console.error(`❌ API returned error: ${parsed.error.message || parsed.error.info || 'Unknown error'}`);
        return [];
      } else {
        console.warn('⚠️ Unexpected response format:', Object.keys(parsed));
        flights = [];
      }
    } catch (e) {
      console.error('❌ Failed to parse flight response as JSON:', e);
      return [];
    }
    
    console.log(`✅ Found ${flights.length} flights`);
    
    if (flights.length === 0) {
      console.warn(`⚠️ No flights found from AviationStack API for ${fromCity} → ${toCity} on ${date}`);
      console.warn(`   Tried IATA codes: ${originIata} → ${destIata}`);
      console.warn(`   Generating realistic flight data using OpenAI...`);
      
      // Generate mock flights using OpenAI when no results found
      return await generateMockFlightsWithOpenAI(originIata, destIata, date, travelers, fromCity, toCity);
    }
    
    // Generate prices based on route and date (AviationStack doesn't provide prices)
    const basePrice = 5000 + Math.random() * 15000;
    
    return flights.slice(0, 10).map((flight: any, index: number) => {
      // AviationStack API response format:
      // { flight: { number, iata, icao }, airline: { name, iata, icao }, 
      //   departure: { airport, iata, scheduled, timezone }, 
      //   arrival: { airport, iata, scheduled, timezone } }
      
      const depTimeStr = flight.departure?.scheduled || flight.departure?.time || '';
      const arrTimeStr = flight.arrival?.scheduled || flight.arrival?.time || '';
      
      const depTime = depTimeStr.includes('T') 
        ? depTimeStr.split('T')[1]?.substring(0, 5) || '00:00'
        : depTimeStr.substring(11, 16) || '00:00';
      
      const arrTime = arrTimeStr.includes('T')
        ? arrTimeStr.split('T')[1]?.substring(0, 5) || '00:00'
        : arrTimeStr.substring(11, 16) || '00:00';
      
      // Calculate duration
      const depDate = new Date(flight.departure?.scheduled || flight.departure?.time || Date.now());
      const arrDate = new Date(flight.arrival?.scheduled || flight.arrival?.time || Date.now());
      const durationMs = arrDate.getTime() - depDate.getTime();
      const hours = Math.floor(Math.abs(durationMs) / (1000 * 60 * 60));
      const minutes = Math.floor((Math.abs(durationMs) % (1000 * 60 * 60)) / (1000 * 60));
      const durationFormatted = `${hours}h ${minutes}m`;
      
      // Extract flight details from AviationStack format
      const flightNumber = flight.flight?.iata || flight.flight?.number || flight.flight?.icao || 'Unknown';
      const airlineCode = flight.airline?.iata || flight.airline?.icao || '';
      const airlineName = flight.airline?.name || 'Airline';
      const originCode = flight.departure?.iata || flight.departure?.airport?.iata || originIata;
      const destCode = flight.arrival?.iata || flight.arrival?.airport?.iata || destIata;
      
      return {
        id: flightNumber || `flight-${Date.now()}-${index}`,
        airline: airlineCode || airlineName,
        flightNumber: flightNumber,
        departureTime: depTime,
        arrivalTime: arrTime,
        duration: durationFormatted,
        price: Math.round(basePrice * (1 + index * 0.1) * travelers),
        currency: 'INR',
        origin: originCode,
        destination: destCode,
        raw: flight,
      };
    });
  } catch (error) {
    console.error('❌ Error searching flights:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
}

// Search trains using OpenAI to generate train data
async function searchTrainsAPI(source: string, destination: string, date: string): Promise<any[]> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OpenAI API key not configured, returning empty results');
    return [];
  }

  try {
    console.log(`🚂 Searching trains: ${source} → ${destination} on ${date}`);
    const sourceCity = cleanLocationName(source);
    const destCity = cleanLocationName(destination);
    console.log(`📍 Cleaned locations: ${sourceCity} → ${destCity}`);

    // Use OpenAI to generate train schedule data
    const prompt = `Generate a realistic train schedule from ${sourceCity} to ${destCity} for date ${date}. 
Return a JSON array of 5-8 train options with the following structure:
[
  {
    "name": "Train name (e.g., Rajdhani Express, Shatabdi Express)",
    "number": "Train number (e.g., 12345)",
    "departureTime": "HH:MM format",
    "arrivalTime": "HH:MM format",
    "duration": "Xh Ym format",
    "price": number in INR
  }
]
Only return the JSON array, no other text.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a train schedule generator. Always return valid JSON arrays only, no explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '[]';
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch ? jsonMatch[0] : '[]';
    
    const trains = JSON.parse(jsonText) as any[];
    
    console.log(`✅ Generated ${trains.length} trains`);
    
    if (trains.length === 0) {
      console.warn(`⚠️ No trains generated for ${sourceCity} → ${destCity} on ${date}`);
      return [];
    }
    
    return trains.map((train: any, index: number) => ({
      id: train.number || `train-${Date.now()}-${index}`,
      name: train.name || 'Express Train',
      number: train.number || '',
      departureTime: train.departureTime || '00:00',
      arrivalTime: train.arrivalTime || '00:00',
        duration: train.duration || '—',
      price: train.price ? Math.round(train.price) : undefined,
        origin: sourceCity,
        destination: destCity,
        raw: train,
    }));
  } catch (error) {
    console.error('❌ Error searching trains:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
}

// Search hotels using Amadeus API
async function searchHotelsAPI(location: string, checkIn: string, checkOut: string): Promise<any[]> {
  if (!AMADEUS_API_KEY || !AMADEUS_API_SECRET) {
    console.warn('Amadeus API credentials not configured, returning empty results');
    return [];
  }

  try {
    const token = await getAmadeusToken();
    const cityName = cleanLocationName(location);

    // Search hotels with rate limiting
    const hotelResponse = await rateLimitedCall(async () =>
      fetch(
        `${AMADEUS_BASE_URL}/v3/shopping/hotel-offers?cityCode=${encodeURIComponent(cityName.toUpperCase())}&checkInDate=${checkIn}&checkOutDate=${checkOut}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
    );

    if (!hotelResponse.ok) {
      return [];
    }

    const hotelData = await hotelResponse.json() as { data?: Array<any> };
    return hotelData.data?.map((hotel: any, index: number) => {
      const offer = hotel.offers?.[0];
      return {
        id: `hotel-${index}`,
        name: hotel.hotel?.name || 'Unknown Hotel',
        location: cityName,
        rating: hotel.hotel?.rating || undefined,
        pricePerNight: offer?.price?.total ? parseFloat(offer.price.total) : undefined,
        currency: offer?.price?.currency || 'INR',
        imageUrl: hotel.hotel?.media?.[0]?.uri || undefined,
        bookingSource: 'amadeus' as const,
        raw: hotel,
      };
    }) || [];
  } catch (error) {
    console.error('Error searching hotels:', error);
    return [];
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'WanderWise API is running' });
});

// AI Chat Assistant endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, context } = req.body;

    const systemPrompt = `You are WanderWise AI, an expert Indian travel assistant. You help users plan trips across India, provide budget advice, booking recommendations, and travel insights. 

Key guidelines:
- Focus on Indian destinations, culture, and travel patterns
- Provide practical advice with specific costs in Indian Rupees (₹)
- Suggest authentic local experiences
- Consider Indian weather patterns and seasons
- Be helpful, friendly, and culturally aware
- Keep responses concise but informative

Context: ${context || 'General travel assistance'}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process that request.";

    res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI response',
      message: 'Please try again later'
    });
  }
});

// Helper function to generate a detailed plan for a single day
async function generateSingleDayPlan(params: {
  dayNumber: number;
  totalDays: number;
  date: string;
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  budget: number;
  travelers: number;
  interests: string[];
  customDestinations: string[];
  customActivities: string[];
  activitiesPerDay: number;
  tripStyle: string;
  groupType: string;
  tripIntent: string;
  budgetTier: string;
  comfortLevel: string;
  crowdTolerance: string;
  foodPreference: string;
  planRigidity: string;
  culturalNotesRequired: boolean;
  travelMaturity: string;
  isFirstVisit: boolean;
  tripTheme: string;
  arrivalTime: string;
  departureTime: string;
  vibePreference: string;
  weatherData?: WeatherData;
  previousDaysSummary?: string;
  remainingBudget: number;
  travelMonth: number;
  seasonalValidation: SeasonalValidation;
}): Promise<any> {
  const {
    dayNumber,
    totalDays,
    date,
    from,
    to,
    budget,
    travelers,
    interests,
    customDestinations,
    customActivities,
    activitiesPerDay,
    tripStyle,
    groupType,
    tripIntent,
    budgetTier,
    comfortLevel,
    crowdTolerance,
    foodPreference,
    planRigidity,
    culturalNotesRequired,
    travelMaturity,
    isFirstVisit,
    tripTheme,
    arrivalTime,
    departureTime,
    vibePreference,
    weatherData,
    previousDaysSummary,
    remainingBudget,
    travelMonth,
    seasonalValidation
  } = params;

  // Build context about previous days
  let previousContext = '';
  if (previousDaysSummary) {
    previousContext = `\n\nPREVIOUS DAYS SUMMARY (for consistency and continuity):\n${previousDaysSummary}\n\nIMPORTANT: Make sure Day ${dayNumber} activities complement and don't repeat the previous days.`;
  }

  // Build weather and seasonal context for this specific day
  let weatherContext = '';
  if (weatherData) {
    weatherContext = `\n\nWEATHER FOR DAY ${dayNumber} (${date}):\n`;
    weatherContext += `Temperature: ${weatherData.temperature}°C\n`;
    weatherContext += `Condition: ${weatherData.condition} (${weatherData.description})\n`;
    weatherContext += `Humidity: ${weatherData.humidity}%, Wind: ${weatherData.windSpeed} m/s\n\n`;
    weatherContext += `WEATHER ADJUSTMENTS NEEDED:\n`;
    if (weatherData.temperature > 30) {
      weatherContext += `- Very hot (${weatherData.temperature}°C): Schedule outdoor activities early morning (before 10 AM) or evening (after 5 PM)\n`;
      weatherContext += `- Suggest indoor/covered activities during midday heat\n`;
      weatherContext += `- Include water breaks and hydration stops\n`;
    } else if (weatherData.temperature < 15) {
      weatherContext += `- Cool weather (${weatherData.temperature}°C): Include warm indoor activities, suggest layered clothing\n`;
    }
    if (weatherData.condition.toLowerCase().includes('rain')) {
      weatherContext += `- Rainy conditions: Focus on indoor activities, museums, covered markets, cafes\n`;
      weatherContext += `- Include umbrella/rain gear recommendations\n`;
    } else if (weatherData.condition.toLowerCase().includes('clear') || weatherData.condition.toLowerCase().includes('sun')) {
      weatherContext += `- Clear/sunny: Perfect for outdoor activities and photography\n`;
    }
  }

  // Determine if this is arrival day or departure day
  const isArrivalDay = dayNumber === 1;
  const isDepartureDay = dayNumber === totalDays;
  const isMiddleDay = dayNumber > 1 && dayNumber < totalDays;
  
  // Get day of week for Monday check
  const dayDateObj = new Date(date);
  const dayOfWeek = dayDateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const isMonday = dayOfWeek === 1;
  
  // Determine if it's a metro city (add traffic buffer)
  const metroCities = ['Mumbai', 'Delhi', 'Bangalore', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune'];
  const isMetroCity = metroCities.some(city => to.toLowerCase().includes(city.toLowerCase()));

  // Calculate energy capacity based on group type, vibe, and day type
  const getEnergyCapacity = (): { level: string; maxActivities: number; description: string } => {
    // Base energy by group type
    let baseEnergy = 3; // moderate
    if (groupType === 'friends') baseEnergy = 4; // high
    if (groupType === 'couples') baseEnergy = 3; // medium
    if (groupType === 'family-kids') baseEnergy = 2; // low
    if (groupType === 'solo') baseEnergy = 3.5; // medium-high
    
    // Modify by vibe preference
    if (vibePreference === 'chill') baseEnergy -= 1;
    if (vibePreference === 'active') baseEnergy += 0.5;
    if (vibePreference === 'intense') baseEnergy += 1;
    
    // Modify by day type
    if (isArrivalDay) baseEnergy = Math.min(baseEnergy, 2); // cap at 2 for arrival
    if (isDepartureDay) baseEnergy = Math.min(baseEnergy, 2); // cap at 2 for departure
    
    // Modify by trip intent
    if (tripIntent === 'relaxation' || tripIntent === 'honeymoon') baseEnergy -= 0.5;
    if (tripIntent === 'adventure' || tripIntent === 'celebration') baseEnergy += 0.5;
    
    const finalEnergy = Math.max(1, Math.min(5, Math.round(baseEnergy)));
    
    const levels: { [key: number]: { level: string; description: string } } = {
      1: { level: 'very-light', description: 'Rest day with minimal activity' },
      2: { level: 'light', description: 'Easy pace, 1-2 activities max' },
      3: { level: 'moderate', description: 'Comfortable pace, 2-3 activities' },
      4: { level: 'active', description: 'Full day, 3-4 activities' },
      5: { level: 'intense', description: 'Action-packed, 4-5 activities' }
    };
    
    return { ...levels[finalEnergy], maxActivities: finalEnergy };
  };
  
  const energyCapacity = getEnergyCapacity();
  
  // If user specified fixed activities, use that; otherwise use energy-based
  const useFixedActivities = activitiesPerDay > 0;
  const targetActivities = useFixedActivities ? activitiesPerDay : energyCapacity.maxActivities;

  const prompt = `You are an expert HUMAN travel planner, not a generic itinerary generator.

Your job is to create a REALISTIC, ENJOYABLE, and HUMAN-LIKE trip plan that adapts dynamically based on who is traveling, why they are traveling, their preferences, and their physical and emotional energy limits.

⚠️ CRITICAL: This is NOT a generic template itinerary. Every activity MUST align with the user's specific travel style, preferences, interests, and seasonal conditions.

⚠️ ABSOLUTE RULE:
${useFixedActivities 
  ? `User has requested EXACTLY ${activitiesPerDay} activities. Honor this override.` 
  : `Do NOT generate a fixed number of activities. Activities must EMERGE NATURALLY based on group type, trip intent, energy, and logistics.
Today's ENERGY CAPACITY: ${energyCapacity.level.toUpperCase()} (${energyCapacity.description})
SUGGESTED ACTIVITY RANGE: 1-${energyCapacity.maxActivities} activities (stop when the day feels "complete")`}

════════════════════════════════════════
SEASONAL COMPATIBILITY (ABSOLUTELY CRITICAL)
════════════════════════════════════════

Travel Month: ${getMonthName(travelMonth)}
Destination: ${to}

${seasonalValidation.warnings.length > 0 ? `
⚠️ SEASONAL WARNINGS FOR THIS TRIP:
${seasonalValidation.warnings.map(w => `• ${w}`).join('\n')}

${seasonalValidation.suggestions.length > 0 ? `REQUIRED ADJUSTMENTS:
${seasonalValidation.suggestions.map(s => `• ${s}`).join('\n')}` : ''}

YOU MUST:
1. ${seasonalValidation.severity === 'caution' ? 'Avoid or minimize activities affected by seasonal conditions' : 'Acknowledge good timing and plan accordingly'}
2. Do NOT recommend activities that are unsafe or unavailable due to season
3. Suggest indoor/alternative activities if weather is challenging
4. Include specific seasonal tips in activity descriptions

EXAMPLES OF ACTIVITIES TO AVOID (if applicable):
- Beach activities during heavy monsoon (July-August in Goa, Andaman)
- Water sports when seas are rough or unsafe
- High-altitude road trips during peak winter snowfall
- Desert outdoor activities during extreme summer heat (May-June in Rajasthan)
- Outdoor sightseeing during extreme heat waves (45°C+)
- Mountain roads during monsoon landslide season
- Wildlife safaris in parks closed for breeding season

ALWAYS VALIDATE: Before including any activity, ask yourself:
"Is this activity safe, practical, and enjoyable in ${getMonthName(travelMonth)} at ${to}?"
If answer is NO or RISKY, either:
  a) Skip it entirely, or
  b) Modify it (e.g., indoor alternative, different timing, weather-protected version)
  c) Add explicit warnings about conditions

` : `✅ GOOD SEASONAL TIMING: ${getMonthName(travelMonth)} is suitable for ${to}.
However, still consider:
- Daily weather patterns (heat, rain, humidity)
- Activity timing (avoid midday heat if applicable)
- Seasonal crowd levels
`}

────────────────────────────────────────
USER PROFILE (STRICTLY ENFORCE - NOT SUGGESTIONS, THESE ARE REQUIREMENTS)
────────────────────────────────────────

🎯 TRIP STYLE: ${tripStyle}
   ${tripStyle === 'relaxing' ? '→ Focus on: Spas, beaches, calm environments, leisurely meals, no rushing' : ''}
   ${tripStyle === 'adventure' ? '→ Focus on: Trekking, sports, outdoor activities, physical challenges, adrenaline' : ''}
   ${tripStyle === 'cultural' ? '→ Focus on: Museums, heritage sites, local traditions, art, history, cultural performances' : ''}
   ${tripStyle === 'family' ? '→ Focus on: Parks, safe kid-friendly activities, family restaurants, easy logistics' : ''}
   ${tripStyle === 'luxury' ? '→ Focus on: 5-star experiences, fine dining, premium activities, private tours, comfort' : ''}
   ⚠️ EVERY activity must align with this style. Do NOT mix random activities that don't fit.

👥 GROUP COMPOSITION: ${groupType}
   This fundamentally changes what activities are appropriate.

🎭 TRIP INTENT: ${tripIntent}
   ${tripIntent === 'honeymoon' ? '→ ROMANTIC focus: Private experiences, sunset dinners, couples spa, scenic moments' : ''}
   ${tripIntent === 'celebration' ? '→ CELEBRATORY focus: Special experiences, group fun, memorable moments, photo ops' : ''}
   ${tripIntent === 'relaxation' ? '→ RELAXATION focus: Slow pace, spa, nature, minimal scheduling, comfort' : ''}
   ${tripIntent === 'adventure' ? '→ ADVENTURE focus: Physical activities, exploration, thrills, outdoor experiences' : ''}
   ${tripIntent === 'spiritual' ? '→ SPIRITUAL focus: Temples, meditation, yoga, peaceful environments, introspection' : ''}
   ⚠️ The entire day should reflect this intent. Every activity should serve this purpose.

💫 VIBE / ENERGY PREFERENCE: ${vibePreference}
   This tells you how packed or relaxed the day should be.

💰 BUDGET TIER: ${budgetTier}
   ${budgetTier === 'budget' ? '→ Street food, public transport, budget stays, free/low-cost activities' : ''}
   ${budgetTier === 'mid-range' ? '→ Mix of local and comfortable, shared/private transport, decent restaurants' : ''}
   ${budgetTier === 'luxury' ? '→ Premium everything: Private cabs, fine dining, exclusive experiences, 5-star comfort' : ''}

🛋️ COMFORT LEVEL: ${comfortLevel}
   ${comfortLevel === 'basic' ? '→ Basic accommodations acceptable, shared transport OK, focus on experiences' : ''}
   ${comfortLevel === 'comfortable' ? '→ Good quality stays, mix of transport, balance comfort and experience' : ''}
   ${comfortLevel === 'premium' ? '→ High comfort priority, premium stays, private transport, quality over quantity' : ''}

👫 CROWD TOLERANCE: ${crowdTolerance}
   ${crowdTolerance === 'avoid-crowds' ? '→ Schedule popular spots at off-peak times, suggest quieter alternatives' : ''}
   ${crowdTolerance === 'moderate' ? '→ Balance popular and quiet spots' : ''}
   ${crowdTolerance === 'love-crowds' ? '→ Include bustling markets, peak-time visits, social experiences' : ''}

🍽️ FOOD PREFERENCE: ${foodPreference}
   ${foodPreference === 'vegetarian' ? '⚠️ CRITICAL: ALL food recommendations MUST be vegetarian only' : ''}
   ${foodPreference === 'vegan' ? '⚠️ CRITICAL: ALL food recommendations MUST be vegan only' : ''}
   ${foodPreference === 'non-vegetarian' ? '→ Include local non-veg specialties' : ''}

📅 PLAN FLEXIBILITY: ${planRigidity}
   ${planRigidity === 'flexible' ? '→ Include buffer time, backup options, "if time permits" alternatives' : ''}
   ${planRigidity === 'strict' ? '→ Precise timings, structured schedule, clear sequence' : ''}
   ${planRigidity === 'balanced' ? '→ Structured but with some flexibility' : ''}

📚 CULTURAL NOTES REQUIRED: ${culturalNotesRequired ? 'YES - Include cultural context, etiquette, local customs' : 'No'}

🎒 TRAVEL MATURITY: ${travelMaturity}
   ${travelMaturity === 'first_timer' ? '→ Iconic spots, clear directions, helpful tips, well-known places, safety guidance' : ''}
   ${travelMaturity === 'experienced' ? '→ Hidden gems, offbeat locations, minimal hand-holding, local secrets' : ''}

🆕 FIRST VISIT TO DESTINATION: ${isFirstVisit ? 'YES - Must include iconic experiences they cannot miss' : 'NO - Focus on new/different experiences'}

📍 DESTINATION: ${to}
📆 TRAVEL DATES: Day ${dayNumber} of ${totalDays} | Month: ${getMonthName(travelMonth)}
${isArrivalDay ? `🛬 ARRIVAL TIME: ${arrivalTime}` : ''}
${isDepartureDay ? `🛫 DEPARTURE TIME: ${departureTime}` : ''}

🎨 USER'S SPECIFIC INTERESTS: ${Array.isArray(interests) && interests.length > 0 ? interests.join(', ') : 'Not specified'}
   ${interests && interests.length > 0 ? `⚠️ CRITICAL: Prioritize activities matching these interests: ${interests.join(', ')}` : ''}

${customActivities && customActivities.length > 0 ? `
🎯 USER'S REQUESTED ACTIVITIES (MUST INCLUDE):
${customActivities.map(a => `   • ${a}`).join('\n')}
⚠️ These are EXPLICIT requests. Find natural ways to include them across the trip.
` : ''}

${customDestinations && customDestinations.length > 0 ? `
📍 USER'S REQUESTED DESTINATIONS (MUST VISIT):
${customDestinations.map(d => `   • ${d}`).join('\n')}
⚠️ These destinations MUST appear in the itinerary. Plan route efficiently.
` : ''}

⚠️⚠️⚠️ CRITICAL ENFORCEMENT ⚠️⚠️⚠️
This is NOT a suggestion list. These are REQUIREMENTS.
- If user wants ${tripStyle} style → Plan ONLY ${tripStyle} activities
- If user wants ${tripIntent} intent → Entire trip should serve this purpose
- If user selected interests → Activities MUST match those interests
- If user requested specific activities/destinations → They MUST appear
- If user is ${travelMaturity} → Adjust complexity accordingly

DO NOT CREATE GENERIC PLANS. Every activity must pass this test:
"Does this activity match the user's style (${tripStyle}), intent (${tripIntent}), interests (${interests.join(', ')}), and preferences?"

If answer is NO → DO NOT INCLUDE IT.

────────────────────────────────────────
TRIP THEME LOCK (CONSISTENCY GUARD)
────────────────────────────────────────

The overall theme of this trip is "${tripTheme}".
Do NOT change tone abruptly between days unless justified by arrival/departure or energy curve.

Theme Descriptions:
- "party" → Energetic, social, nightlife-focused, fun group activities
- "romantic" → Intimate, scenic, private moments, couples experiences
- "explorer" → Discovery-focused, diverse experiences, adventure
- "relaxed" → Slow-paced, comfort-first, minimal rushing
- "mixed" → Balanced variety, no dominant mood

CONSISTENCY RULE: Today's activities must feel like a natural continuation of this ${tripTheme} theme.

TRIP OVERVIEW (Context for all days):
- From: ${from}
- To: ${to}
- Total Duration: ${totalDays} days
- Budget per day: ₹${Math.round(remainingBudget / (totalDays - dayNumber + 1))} (out of total ₹${budget})
- Interests: ${Array.isArray(interests) ? interests.join(', ') : interests}
${customDestinations && customDestinations.length > 0 ? `- Must-visit destinations (must appear in the itinerary at least once across the trip): ${customDestinations.join(', ')}\n` : ''}
${customActivities && customActivities.length > 0 ? `- Specific activities requested (must appear in the itinerary at least once across the trip): ${customActivities.join(', ')}\n` : ''}

DAY ${dayNumber} SPECIFIC DETAILS:
- Date: ${date}${isMonday ? ' (MONDAY - NO MUSEUMS OR ZOOS)' : ''}
- Activities needed: Exactly ${activitiesPerDay} activities
- Budget for this day: Approximately ₹${Math.round(remainingBudget / (totalDays - dayNumber + 1))}
- Day Type: ${isArrivalDay ? 'ARRIVAL DAY (must be LIGHT)' : isDepartureDay ? 'DEPARTURE DAY (must be LIGHT, end activities 4 hours before departure)' : 'MIDDLE DAY (peak energy)'}
${weatherContext}${previousContext}

==============================
NON-NEGOTIABLE BEHAVIOR RULES
==============================

────────────────────────────────────────
GROUP-SPECIFIC BEHAVIOR (NON-NEGOTIABLE)
────────────────────────────────────────

${groupType === 'friends' ? `FRIENDS GROUP DETECTED:
• Prioritize adventure, nightlife, social energy, bonding moments
• AVOID museums, slow art galleries, overly quiet spots
• Late mornings are acceptable (no 6 AM starts)
• If adventure-focused → include physically engaging experiences
• If nights go late → next morning MUST start slow
• Energy tolerance: HIGH` : ''}
${groupType === 'couples' ? `COUPLES DETECTED:
• Prioritize privacy, romance, scenic dining, emotional connection
• AVOID noisy, crowded, group-heavy activities
• Include intimate experiences (sunset, candlelight dinner, scenic walks)
• Energy tolerance: MEDIUM` : ''}
${groupType === 'family-kids' ? `FAMILY WITH KIDS DETECTED:
• Prioritize safety, rest, washrooms, easy logistics
• NO late nights (nothing after 8 PM)
• MANDATORY breaks every few hours
• AVOID steep treks or high-risk adventure
• Kid-friendly venues and food only
• Energy tolerance: LOW` : ''}
${groupType === 'solo' ? `SOLO TRAVELER DETECTED:
• Prioritize social hostels, cafes with WiFi, group tours
• AVOID family resorts and overly romantic spots
• Encourage social interaction without forcing it
• Energy tolerance: MEDIUM-HIGH` : ''}

Violating group logic makes the plan INVALID.

────────────────────────────────────────
ENERGY-BASED DAILY PLANNING (CRITICAL)
────────────────────────────────────────

⚠️ Do NOT plan by fixed activity count. Plan by ENERGY.

TODAY'S ENERGY PROFILE:
• Day Type: ${isArrivalDay ? 'ARRIVAL DAY (very light)' : isDepartureDay ? 'DEPARTURE DAY (light, stress-free)' : 'MIDDLE DAY (peak energy)'}
• Energy Level: ${energyCapacity.level.toUpperCase()}
• Vibe: ${vibePreference}
• Max Activities: ${targetActivities} (but stop earlier if day feels complete)
${isArrivalDay ? `• Arrival Time: ${arrivalTime} - Allow buffer for check-in before first activity` : ''}
${isDepartureDay ? `• Departure Time: ${departureTime} - End all activities 4 HOURS before this` : ''}

DAY TYPE RULES:
${isArrivalDay ? '• ARRIVAL DAY → VERY LIGHT. No major activity. Allow hotel check-in (12-2 PM). Maybe 1-2 easy activities max.' : ''}
${isMiddleDay ? '• MIDDLE DAY → Peak energy. Best experiences go here. Signature moments.' : ''}
${isDepartureDay ? '• DEPARTURE DAY → Minimal, stress-free. Light breakfast activity at most. Pack and leave relaxed.' : ''}

TRIP INTENT ENERGY MODIFIER:
${tripIntent === 'relaxation' || tripIntent === 'honeymoon' ? '• Relaxation/Honeymoon → Slower pacing, fewer activities, more downtime' : ''}
${tripIntent === 'adventure' || tripIntent === 'celebration' ? '• Adventure/Celebration → Higher energy days, more activities possible' : ''}
${tripIntent === 'business' ? '• Business/Workation → Half-days only for activities' : ''}

────────────────────────────────────────
ACTIVITY INTENSITY AWARENESS
────────────────────────────────────────

ACTIVITY INTENSITY LEVELS:
• LOW: Cafe, leisurely walk, beach lounging, shopping browse → 1 energy point
• MEDIUM: Sightseeing, market exploration, museum, boat ride → 2 energy points
• HIGH: Trekking, scuba, safari, water sports, intense adventure → 3 energy points
• NIGHT: Party/clubbing → 2 points + AFFECTS NEXT MORNING

STACKING RULES:
• NEVER stack multiple HIGH intensity activities on the same day
• If partying/clubbing at night → Next morning MUST start after 11 AM
• Family with kids → No HIGH intensity activities at all
• After HIGH intensity → follow with LOW intensity rest period

────────────────────────────────────────
VIBE & ENERGY (HOW IT SHOULD FEEL)
────────────────────────────────────────

${vibePreference === 'chill' ? '• CHILL VIBE: Max 1-2 locations/day. Long meals. Rest time. No rushing.' : ''}
${vibePreference === 'balanced' ? '• BALANCED VIBE: Mix of activity and rest. 2-3 activities with breathing room.' : ''}
${vibePreference === 'active' ? '• ACTIVE VIBE: Full days but not exhausting. 3-4 activities with good pacing.' : ''}
${vibePreference === 'intense' ? '• INTENSE VIBE: Pack in experiences. Early starts, late nights. 4-5 activities.' : ''}
${tripStyle === 'party' || tripStyle === 'adventure' ? '• Party/Adventure → Apply hangover buffer. NO early mornings after nightlife.' : ''}
${tripStyle === 'relaxing' ? '• Relaxed → Comfort > coverage. Quality over quantity.' : ''}

4. LOGISTICS REALITY:
${isArrivalDay ? '- ARRIVAL DAY: Must be LIGHT. No full itineraries. Account for hotel check-in (12-2 PM).' : ''}
${isDepartureDay ? '- DEPARTURE DAY: Must be LIGHT. Activities must END 4 hours before departure time.' : ''}
- Do NOT crisscross the city. Cluster activities geographically.
${isMetroCity ? '- METRO CITY DETECTED: Add 30% buffer to all travel times. Traffic is heavy.' : ''}

5. SEASONAL & TIME RULES:
${weatherData && weatherData.temperature > 30 ? '- PEAK SUMMER: No outdoor activities between 12-4 PM. Schedule indoor/covered activities during midday.' : ''}
${weatherData && weatherData.condition.toLowerCase().includes('rain') ? '- MONSOON: No beaches. Focus on indoor activities, museums, covered markets, cafes.' : ''}
${isMonday ? '- MONDAY: NO museums or zoos (they are closed).' : ''}
- Photography → Scenic spots ONLY at sunrise or sunset.
- Meal times: Breakfast (8-10 AM), Lunch (12:30-2:30 PM), Dinner (7-9 PM)

6. BUDGET REALITY:
${budgetTier === 'budget' ? '- Budget → Public transport, street food, budget accommodations. Quality experiences, not luxury.' : ''}
${budgetTier === 'mid-range' ? '- Mid-Range → Mix of public and private transport, local restaurants, comfortable stays.' : ''}
${budgetTier === 'luxury' ? '- Luxury → Private cabs, fine dining, premium experiences.' : ''}
- Budget affects comfort and transport, NOT activity quality.

7. CROWD TOLERANCE:
${crowdTolerance === 'avoid-crowds' ? '- Avoid Crowds → Schedule popular spots early morning or late evening. Suggest off-beat alternatives.' : ''}
${crowdTolerance === 'love-crowds' ? '- Love Crowds → Include bustling markets, popular tourist spots, peak-time visits.' : ''}
${crowdTolerance === 'moderate' ? '- Moderate → Balance popular and quiet spots.' : ''}

8. FOOD PREFERENCE:
${foodPreference === 'vegetarian' ? '- Vegetarian → Only vegetarian restaurants and food recommendations.' : ''}
${foodPreference === 'vegan' ? '- Vegan → Only vegan restaurants and food recommendations.' : ''}
${foodPreference === 'non-vegetarian' ? '- Non-Vegetarian → Include local non-veg specialties.' : ''}

9. TRAVEL MATURITY (HUGE REALISM BOOST):
${travelMaturity === 'first_timer' ? `- First-Time Traveler → Provide clear directions, stick to iconic & well-known spots, include helpful tips.
- Give detailed navigation instructions and landmarks.
- Avoid overwhelming with too many options.
- Include safety tips and what to expect.
- Recommend tourist-friendly establishments.` : `- Experienced Traveler → Focus on offbeat locations, hidden gems, less explanation needed.
- Skip the obvious tourist traps they've likely seen.
- Include local-only spots and insider recommendations.
- Less hand-holding, more discovery.
- Suggest unique experiences over mainstream ones.`}

==============================
NO-REGRET RULE (TRUST ANCHOR)
==============================

${isFirstVisit ? `FIRST VISIT DETECTED - NO-REGRET RULE APPLIES:
Even if the user prefers offbeat experiences, include at least ONE iconic experience per destination.
This ensures they feel they truly visited the place.

Examples of iconic experiences:
- Gateway of India in Mumbai
- Red Fort in Delhi
- Taj Mahal in Agra
- Marina Beach in Chennai
- Mysore Palace in Mysore

The user should never regret missing something obvious on their first visit.` : `REPEAT VISIT - FOCUS ON NEW EXPERIENCES:
Since this is not their first visit, prioritize:
- Hidden gems they likely missed before
- New restaurants and cafes
- Seasonal experiences
- Lesser-known neighborhoods
- Local-only spots`}

==============================
SIGNATURE EXPERIENCE REQUIREMENT
==============================

Each trip MUST include at least ONE "Signature Moment" (preferably on middle days):
- Emotionally memorable
- Unique to the destination
- Aligned with trip intent (${tripIntent})
- Something they'll remember forever

${isMiddleDay ? `DAY ${dayNumber} IS A MIDDLE DAY - IDEAL FOR SIGNATURE EXPERIENCES.
Consider including THE signature moment here if not yet planned.` : ''}
${isArrivalDay ? 'Day 1 is NOT ideal for signature experiences (travelers are tired from journey).' : ''}
${isDepartureDay ? 'Last day is NOT ideal for signature experiences (keep it light and stress-free).' : ''}

Signature Experience Ideas by Trip Intent:
${tripIntent === 'honeymoon' ? '- Private sunset dinner, couples spa, romantic boat ride, stargazing' : ''}
${tripIntent === 'celebration' ? '- Cake cutting at scenic spot, group photo session, special dinner, surprise activity' : ''}
${tripIntent === 'adventure' ? '- Peak summit, waterfall rappelling, wildlife safari highlight, extreme sport' : ''}
${tripIntent === 'spiritual' ? '- Temple darshan at auspicious time, meditation session, aarti ceremony, holy dip' : ''}
${tripIntent === 'exploration' ? '- Local home visit, artisan workshop, heritage walk with historian, cooking class' : ''}
${tripIntent === 'relaxation' ? '- Spa day, private beach time, yoga at sunrise, nature retreat' : ''}

==============================
MICRO-DELIGHT RULE
==============================

Each day may include ONE optional micro-surprise:
- A hidden chai stop
- A secret viewpoint
- A local dessert
- A street food gem

Optional, never forced. Only if it fits naturally.

==============================
FAIL-SAFE LOGIC
==============================

For each day, include:
- At least one backup activity triggered by rain, fatigue, or crowds.
- Alternative indoor options if weather is bad.
- Rest spots if energy is low.

────────────────────────────────────────
TIME & LOGISTICS REALITY
────────────────────────────────────────

• ${isArrivalDay ? `Arrival at ${arrivalTime} - Add 1-2 hour buffer before first activity for check-in/freshening up` : ''}
• ${isDepartureDay ? `Departure at ${departureTime} - End ALL activities 4 hours before this time` : ''}
• Respect hotel check-in (typically 12-2 PM)
• Do NOT crisscross the city — geo-cluster activities by area
${isMetroCity ? '• METRO CITY: Assume heavy traffic. Add 30% buffer to travel times. Plan nearby places.' : ''}
• Include realistic travel time between activities

────────────────────────────────────────
CRITICAL REQUIREMENTS
────────────────────────────────────────

${useFixedActivities 
  ? `1. Generate EXACTLY ${activitiesPerDay} activities for Day ${dayNumber} (user override)` 
  : `1. Generate 1-${energyCapacity.maxActivities} activities based on energy (${energyCapacity.level}). STOP when day feels complete.`}
2. Each activity MUST have a precise time (format: "HH:MM" like "08:30", "14:15", "19:00")
3. Distribute activities naturally across available time:
   ${isArrivalDay ? `- Start AFTER ${arrivalTime} + check-in buffer` : '- Morning: 8:00 AM - 12:00 PM'}
   - Afternoon: 12:00 PM - 5:00 PM  
   ${isDepartureDay ? `- End by ${parseInt(departureTime.split(':')[0]) - 4}:00 (4 hours before departure)` : `- Evening: 5:00 PM - ${groupType === 'family-kids' ? '8:00 PM (family curfew)' : '10:00 PM'}`}
4. Include detailed transport information${isMetroCity ? ' - Add 30% traffic buffer' : ''}
5. Add food/cafe recommendations respecting ${foodPreference} preference
6. Consider activity INTENSITY - don't stack high-intensity activities
7. ${weatherData ? 'Adjust for weather conditions' : 'Plan weather-appropriate activities'}
8. Provide realistic costs in INR
9. ${culturalNotesRequired ? 'Include cultural context and etiquette tips' : ''}
10. ${isFirstVisit ? 'Include at least one iconic must-see experience' : 'Focus on hidden gems'}
11. ${planRigidity === 'flexible' ? 'Include buffer time and flexibility' : planRigidity === 'strict' ? 'Precise timings' : 'Balanced pacing'}

==============================
HUMAN REALITY CHECKLIST (VERIFY ALL)
==============================

Before generating, verify:
□ ${isArrivalDay ? 'Day 1 is LIGHT (no packed schedule)' : isDepartureDay ? 'Last day ends 4+ hours before departure' : 'Middle day has peak experiences'}
□ Activities are geographically clustered (no crisscrossing)
□ ${groupType === 'family-kids' ? 'No activities after 8 PM' : groupType === 'friends' ? 'No boring museums or early mornings' : groupType === 'couples' ? 'No crowded group tours' : 'Opportunities to meet people'}
□ ${isMonday ? 'NO museums or zoos (Monday closure)' : 'Open attractions only'}
□ ${weatherData && weatherData.temperature > 30 ? 'No outdoor activities 12-4 PM' : 'Weather-appropriate activities'}
□ ${foodPreference !== 'no-preference' ? `All food is ${foodPreference}` : 'Food preferences respected'}
□ ${isFirstVisit ? 'At least 1 iconic experience included' : 'Focus on new experiences'}
□ ${tripTheme} theme is consistent throughout
□ Backup activity exists for rain/fatigue/crowds
□ Realistic travel times${isMetroCity ? ' (+30% buffer for traffic)' : ''}

==============================
FINAL HUMAN APPROVAL SIMULATION
==============================

Before finalizing, ask yourself:
1. "Would this trip feel fun, comfortable, and worth the money for a ${groupType} group with ${tripIntent} intent?"
2. "Does this day feel like a natural part of a ${tripTheme} trip?"
3. "Would a real human with real energy levels enjoy this?"
4. "Are there any moments where they might feel rushed, lost, or disappointed?"

If ANY day feels:
- Boring → Add excitement matching the theme
- Stressful → Remove activities or add buffer time
- Rushed → Reduce activities or extend timings
- Mismatched → Realign with user profile
- Exhausting → Add rest periods

FIX IT before outputting.

OUTPUT JSON SCHEMA (follow exactly):
{
  "day": ${dayNumber},
  "header": "Creative day title that matches the ${tripTheme} theme",
  "date": "${date}",
  "dayType": "${isArrivalDay ? 'arrival' : isDepartureDay ? 'departure' : 'middle'}",
  "energyLevel": "${energyCapacity.level}",
  "energyCapacity": {
    "level": "${energyCapacity.level}",
    "maxActivities": ${targetActivities},
    "description": "${energyCapacity.description}"
  },
  "themeConsistency": "${tripTheme}",
  ${isArrivalDay ? `"arrivalTime": "${arrivalTime}",` : ''}
  ${isDepartureDay ? `"departureTime": "${departureTime}",` : ''}
  ${weatherData ? `"weather": {
    "temperature": ${weatherData.temperature},
    "condition": "${weatherData.condition}",
    "description": "${weatherData.description}",
    "icon": "${weatherData.icon}",
    "humidity": ${weatherData.humidity},
    "windSpeed": ${weatherData.windSpeed}
  },` : ''}
  "slots": {
    "morning": [
      {
        "name": "Activity name",
        "time": "08:30",
        "description": "Detailed description",
        "location": "Specific address or area",
        "duration": "1-2 hours",
        "intensity": "low / medium / high",
        "costINR": 500,
        "travelDistanceKm": 2.5,
        "transportMode": "local cab / walking / auto-rickshaw",
        "transportCostINR": 150,
        "foodRecommendation": "Nearby restaurant (${foodPreference})",
        "highlights": "Key experiences",
        "tips": "Practical tips",
        "whyThisFitsGroup": "Why this activity suits ${groupType}",
        "isSignatureExperience": false,
        "isIconicMustSee": false
        ${culturalNotesRequired ? ',"culturalNotes": "Local customs and etiquette"' : ''}
      }
    ],
    "afternoon": [...],
    "evening": [...]
  },
  "microDelight": {
    "name": "Hidden gem / local surprise",
    "description": "Brief description",
    "location": "Where to find it",
    "costINR": 50
  },
  "backupActivities": [
    {
      "name": "Backup option",
      "trigger": "rain / fatigue / crowds",
      "description": "What to do instead",
      "intensity": "low",
      "location": "Where"
    }
  ],
  "signatureExperience": ${isMiddleDay ? '{ "name": "Signature moment", "description": "Why special", "emotionalValue": "Memorable because..." }' : 'null'},
  "whyThisDayWorks": "Human reasoning for why this day plan makes sense for ${groupType} on a ${tripIntent} trip",
  "humanRealityCheck": {
    "totalActivities": "number of activities planned",
    "energyUsed": "${energyCapacity.level}",
    "fatigueRisk": "${isArrivalDay ? 'high (just arrived)' : isDepartureDay ? 'must-avoid (departure stress)' : 'manageable'}",
    "paceDescription": "${isArrivalDay ? 'Very light start' : isDepartureDay ? 'Relaxed wind-down' : 'Active exploration'}",
    "groupFit": "Why this fits ${groupType}",
    "moodMatch": "How this matches ${tripTheme} theme"
  },
  "aiTip": "Day-specific tip for ${groupType}",
  "totalDayCostINR": 3500,
  "breakdown": {
    "transport": 500,
    "food": 1200,
    "activities": 1500,
    "misc": 300
  }
}

────────────────────────────────────────
FINAL HUMAN APPROVAL SIMULATION
────────────────────────────────────────

Before finalizing, ask yourself:

"Would a real group of ${groupType} on a ${tripIntent} trip feel excited, comfortable, and satisfied with this day?"

If any day feels:
• Forced → Remove activities
• Overpacked → Reduce to fit energy level
• Boring → Add excitement matching the theme
• Unrealistic → Fix logistics and timing

FIX IT BEFORE OUTPUT.

────────────────────────────────────────
OUTPUT RULES
────────────────────────────────────────

${useFixedActivities 
  ? `- Generate exactly ${activitiesPerDay} activities (user override)` 
  : `- Generate 1-${energyCapacity.maxActivities} activities naturally. STOP when day feels complete.`}
- Times must be realistic with travel buffers${isMetroCity ? ' (+30% for metro traffic)' : ''}
- Include meal recommendations (${foodPreference})
- Provide transport details (mode, cost, duration)
- Add local insights and micro-delights
- Ensure totalDayCostINR matches sum of all costs
- ALWAYS include backup activities
- Mark signature experiences and iconic must-sees
- Include "humanRealityCheck" with accurate energy assessment
- Include "whyThisDayWorks" explanation

Return ONLY valid JSON. No explanations. No markdown wrapping.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: `You are a HUMAN-AWARE TRAVEL PLANNING ENGINE — not just an itinerary generator.

You understand that:
- Humans get tired, especially on Day 1 after travel
- Emotions matter — trips should FEEL right, not just look right on paper
- Logistics can make or break a trip — traffic, check-in times, weather all matter
- Different groups (friends/couples/families/solo) have fundamentally different needs
- The energy curve of a trip matters: warm-up → peak → wind-down
- Nobody wants to regret missing iconic experiences on their first visit
- Mood consistency across days prevents "whiplash" experiences
- User preferences and travel styles are MANDATORY requirements, not suggestions
- Seasonal conditions can make activities unsafe, unavailable, or unpleasant
- Every activity MUST align with the user's stated style, intent, interests, and seasonal conditions

CRITICAL SEASONAL AWARENESS:
- Beach activities during monsoon = UNSAFE (rough seas, closed facilities)
- High-altitude trips during peak winter = INACCESSIBLE (roads closed, extreme cold)
- Desert activities during peak summer = DANGEROUS (heat stroke risk, 45-50°C)
- Outdoor sightseeing during heat waves = UNCOMFORTABLE and potentially unsafe
- Mountain roads during monsoon = RISKY (landslides)

Before including ANY activity, validate:
1. Is it safe in this season?
2. Is it available/accessible?
3. Will weather conditions allow enjoyment?

If NO to any → either skip it, modify it (indoor alternative), or add explicit warnings.

Your job is to create trips that feel HUMAN — realistic, emotionally satisfying, safe, and stress-free.
Plans must be PERSONALIZED to user's specific style and preferences, not generic templates.

ALWAYS return STRICT JSON per the provided schema. No explanations, no markdown, just valid JSON.` 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 3000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "{}";
    
    // Parse JSON with error handling
    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch (e) {
      // Try fixing JSON
      let trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      const firstBrace = trimmed.indexOf('{');
      if (firstBrace > 0) trimmed = trimmed.substring(firstBrace);
      const lastBrace = trimmed.lastIndexOf('}');
      if (lastBrace >= 0 && lastBrace < trimmed.length - 1) {
        trimmed = trimmed.substring(0, lastBrace + 1);
      }
      trimmed = trimmed.replace(/,(\s*[}\]])/g, '$1');
      
      try {
        parsed = JSON.parse(trimmed);
      } catch (e2) {
        console.error(`Failed to parse Day ${dayNumber} response:`, e2);
        throw new Error(`Invalid JSON response for Day ${dayNumber}`);
      }
    }

    return parsed;
  } catch (error) {
    console.error(`Error generating Day ${dayNumber} plan:`, error);
    throw error;
  }
}

// AI Trip Planning endpoint (returns structured JSON) - NOW WITH PER-DAY GENERATION
app.post('/api/ai/plan-trip', async (req, res) => {
  try {
    const { from, to, startDate, endDate, budget, travelers, interests, customDestinations, customActivities, activitiesPerDay, tripStyle, groupType, tripIntent, budgetTier, comfortLevel, crowdTolerance, foodPreference, planRigidity, culturalNotesRequired, travelMaturity, isFirstVisit, arrivalTime, departureTime, vibePreference } = req.body;
    
    // Calculate duration and travel month
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const travelMonth = start.getMonth() + 1; // 1-12
    
    // SEASONAL VALIDATION - Check if trip is safe for the season
    console.log(`🌍 Validating seasonal compatibility: ${to} in ${getMonthName(travelMonth)}...`);
    const seasonalValidation = validateSeasonalCompatibility(to, travelMonth);
    
    // Log warnings to console
    if (seasonalValidation.warnings.length > 0) {
      console.log('⚠️  SEASONAL WARNINGS:');
      seasonalValidation.warnings.forEach(w => console.log(`   - ${w}`));
    }
    if (seasonalValidation.suggestions.length > 0) {
      console.log('💡 SEASONAL SUGGESTIONS:');
      seasonalValidation.suggestions.forEach(s => console.log(`   - ${s}`));
    }
    
    // If destination is unsafe for the season, return error with alternatives
    if (seasonalValidation.severity === 'unsafe') {
      return res.json({
        success: false,
        error: 'Unsafe seasonal conditions',
        seasonalValidation: seasonalValidation,
        message: `${to} is not safe to visit in ${getMonthName(travelMonth)}. ${seasonalValidation.warnings.join(' ')} ${seasonalValidation.suggestions.join(' ')}`
      });
    }
    
    // Derive trip theme for consistency guard (prevents mood whiplash between days)
    const deriveTripTheme = (): string => {
      // Party theme
      if (groupType === 'friends' && (tripStyle === 'adventure' || tripIntent === 'celebration')) {
        return 'party';
      }
      // Romantic theme
      if (groupType === 'couples' && (tripIntent === 'honeymoon' || tripIntent === 'celebration')) {
        return 'romantic';
      }
      // Relaxed theme
      if (tripStyle === 'relaxing' || tripIntent === 'relaxation' || planRigidity === 'flexible') {
        return 'relaxed';
      }
      // Explorer theme
      if (tripIntent === 'exploration' || tripIntent === 'adventure' || tripStyle === 'adventure') {
        return 'explorer';
      }
      // Mixed/balanced theme
      return 'mixed';
    };
    
    const tripTheme = deriveTripTheme();
    
    console.log(`📅 Generating ${durationDays}-day trip plan with ${activitiesPerDay} activities per day`);
    console.log(`📍 From: ${from} → To: ${to}`);
    console.log(`🎯 Trip Theme: ${tripTheme}`);
    console.log(`👥 Group: ${groupType} | Intent: ${tripIntent} | Style: ${tripStyle}`);

    // Fetch weather data for all days
    console.log('🌤️  Fetching weather data for:', to);
    let weatherForecast: WeatherData[] = [];
    try {
      weatherForecast = await fetchWeatherForecast(to, startDate, endDate);
      if (weatherForecast && weatherForecast.length > 0) {
    console.log(`✅ Weather forecast received: ${weatherForecast.length} days`);
        console.log(`📊 Sample weather for Day 1:`, weatherForecast[0]);
      } else {
        console.warn('⚠️  Weather forecast returned empty array - weather data will not be available in plans');
      }
    } catch (weatherError) {
      console.error('❌ Weather fetch failed:', weatherError);
      console.warn('⚠️  Continuing without weather data - plans will still generate');
    }

    // Generate plans for each day sequentially (with context from previous days)
    const allDays: any[] = [];
    let previousDaysSummary = '';
    let totalCostSoFar = 0;
    let remainingBudget = budget;
    
    console.log(`🚀 Starting per-day generation for ${durationDays} days...`);
    
    for (let dayNum = 1; dayNum <= durationDays; dayNum++) {
      // Calculate date for this day
      const dayDate = new Date(start);
      dayDate.setDate(start.getDate() + dayNum - 1);
      const dateString = dayDate.toISOString().split('T')[0];
      
      // Get weather for this specific day
      const dayWeather = weatherForecast[dayNum - 1] || null;
      
      console.log(`📝 Generating Day ${dayNum}/${durationDays}...`);
      
      try {
        const dayPlan = await generateSingleDayPlan({
          dayNumber: dayNum,
          totalDays: durationDays,
          date: dateString,
          from,
          to,
          startDate,
          endDate,
          budget,
          travelers,
          interests: interests || [],
          customDestinations: customDestinations || [],
          customActivities: customActivities || [],
          activitiesPerDay: activitiesPerDay || 3,
          tripStyle: tripStyle || '',
          groupType: groupType || 'friends',
          tripIntent: tripIntent || 'exploration',
          budgetTier: budgetTier || 'mid-range',
          comfortLevel: comfortLevel || 'comfortable',
          crowdTolerance: crowdTolerance || 'moderate',
          foodPreference: foodPreference || 'no-preference',
          planRigidity: planRigidity || 'balanced',
          culturalNotesRequired: culturalNotesRequired || false,
          travelMaturity: travelMaturity || 'first_timer',
          isFirstVisit: isFirstVisit !== false,
          tripTheme: tripTheme,
          arrivalTime: arrivalTime || '12:00',
          departureTime: departureTime || '18:00',
          vibePreference: vibePreference || 'balanced',
          weatherData: dayWeather || undefined,
          previousDaysSummary: previousDaysSummary || undefined,
          remainingBudget: remainingBudget,
          travelMonth: travelMonth,
          seasonalValidation: seasonalValidation
        });
        
        // Add weather data if not included by AI (ensure it's always added if available)
        if (dayWeather) {
          dayPlan.weather = {
            temperature: dayWeather.temperature,
            condition: dayWeather.condition,
            description: dayWeather.description,
            icon: dayWeather.icon,
            humidity: dayWeather.humidity,
            windSpeed: dayWeather.windSpeed
          };
          console.log(`   ✅ Weather added for Day ${dayNum}: ${dayWeather.temperature}°C ${dayWeather.condition}`);
        } else {
          console.log(`   ⚠️  No weather data available for Day ${dayNum}`);
        }
        
        // Ensure date is set
        if (!dayPlan.date) {
          dayPlan.date = dateString;
        }

        // Ensure all activities have time field
        ['morning', 'afternoon', 'evening'].forEach((slot: string) => {
          if (dayPlan.slots && dayPlan.slots[slot] && Array.isArray(dayPlan.slots[slot])) {
            dayPlan.slots[slot].forEach((activity: any, actIndex: number) => {
              if (!activity.time) {
                // Assign default times
                if (slot === 'morning') {
                  const times = ['08:00', '09:30', '11:00'];
                  activity.time = times[actIndex] || '09:00';
                } else if (slot === 'afternoon') {
                  const times = ['13:00', '14:30', '16:00'];
                  activity.time = times[actIndex] || '14:00';
                } else if (slot === 'evening') {
                  const times = ['18:00', '19:30', '21:00'];
                  activity.time = times[actIndex] || '18:00';
                }
              }
            });
          }
        });
        
        allDays.push(dayPlan);
        totalCostSoFar += dayPlan.totalDayCostINR || 0;
        remainingBudget = budget - totalCostSoFar;
        
        // Build summary of this day for next day's context
        const dayActivities = [
          ...(dayPlan.slots?.morning || []),
          ...(dayPlan.slots?.afternoon || []),
          ...(dayPlan.slots?.evening || [])
        ];
        
        if (previousDaysSummary) {
          previousDaysSummary += '\n';
        }
        previousDaysSummary += `Day ${dayNum}: ${dayPlan.header || `Day ${dayNum} activities`}`;
        previousDaysSummary += ` - Visited: ${dayActivities.slice(0, 3).map((a: any) => a.name).join(', ')}${dayActivities.length > 3 ? '...' : ''}`;
        
        console.log(`✅ Day ${dayNum} completed: ${dayPlan.header || `Day ${dayNum}`}`);
        
      } catch (dayError) {
        console.error(`❌ Error generating Day ${dayNum}:`, dayError);
        // Create a fallback day plan
        allDays.push({
          day: dayNum,
          header: `Day ${dayNum}`,
          date: dateString,
          weather: dayWeather ? {
            temperature: dayWeather.temperature,
            condition: dayWeather.condition,
            description: dayWeather.description,
            icon: dayWeather.icon,
            humidity: dayWeather.humidity,
            windSpeed: dayWeather.windSpeed
          } : undefined,
          slots: { morning: [], afternoon: [], evening: [] },
          aiTip: 'Unable to generate detailed plan for this day. Please try again.',
          totalDayCostINR: 0
        });
      }
    }
    
    console.log(`✨ All ${durationDays} days generated successfully!`);
    
    // Calculate totals
    const totalCost = allDays.reduce((sum, day) => sum + (day.totalDayCostINR || 0), 0);
    const totals = {
      totalCostINR: totalCost,
      breakdown: {
        stay: 0,
        food: allDays.reduce((sum, day) => sum + (day.breakdown?.food || 0), 0),
        transport: allDays.reduce((sum, day) => sum + (day.breakdown?.transport || 0), 0),
        activities: allDays.reduce((sum, day) => {
          const dayActivities = [
            ...(day.slots?.morning || []),
            ...(day.slots?.afternoon || []),
            ...(day.slots?.evening || [])
          ];
          return sum + dayActivities.reduce((s: number, a: any) => s + (a.costINR || 0), 0);
        }, 0),
        misc: allDays.reduce((sum, day) => sum + (day.breakdown?.misc || 0), 0)
      }
    };
    
    // Create overview summary
    const overview = {
      from,
      to,
      durationDays,
      budgetINR: budget,
      travelers,
      interests: interests || [],
      summary: `A ${durationDays}-day ${tripStyle || 'balanced'} trip from ${from} to ${to} with ${activitiesPerDay || 3} activities per day, covering ${allDays.map(d => d.header).join(', ')}.`
    };
    
    const budgetWarning = totalCost > budget ? `Total estimated cost (₹${totalCost.toLocaleString('en-IN')}) exceeds budget (₹${budget.toLocaleString('en-IN')}) by ₹${(totalCost - budget).toLocaleString('en-IN')}` : null;
    
    // Build final response
    const parsed = {
      overview,
      days: allDays,
      totals,
      budgetWarning,
      seasonalInfo: {
        month: getMonthName(travelMonth),
        destination: to,
        severity: seasonalValidation.severity,
        warnings: seasonalValidation.warnings,
        suggestions: seasonalValidation.suggestions
      }
    };

    // Send response
    res.json({
      success: true,
      data: parsed,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Trip Planning Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate trip plan',
      message: 'Please try again later'
    });
  }
});

// AI Budget Analysis endpoint
app.post('/api/ai/budget-analysis', async (req, res) => {
  try {
    const { expenses, totalBudget, destination, duration } = req.body;

    const prompt = `Analyze this travel budget for a ${duration}-day trip to ${destination}:

Total Budget: ₹${totalBudget}
Current Expenses: ${JSON.stringify(expenses)}

Please provide:
1. Budget analysis and spending patterns
2. Recommendations for cost optimization
3. Suggestions for remaining budget allocation
4. Warnings if overspending in any category
5. Tips for saving money in ${destination}

Keep the response practical and specific to Indian travel costs.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a financial advisor specializing in Indian travel budgets. Provide practical money-saving tips and budget analysis." },
        { role: "user", content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Unable to analyze budget";

    res.json({
      success: true,
      analysis: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Budget Analysis Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze budget',
      message: 'Please try again later'
    });
  }
});

// AI Budget Optimization endpoint
app.post('/api/ai/optimize-budget', async (req, res) => {
  try {
    const { plan, targetAdjustmentINR, preference } = req.body; // preference: 'reduce_cost' | 'upgrade'

    const prompt = `You will optimize the following trip plan JSON by ${preference === 'reduce_cost' ? 'reducing' : 'upgrading'} total cost by approximately ${targetAdjustmentINR} INR while keeping overall structure. Return STRICT JSON with fields: { updatedPlan, changes: [{type, before, after, rationale}], newTotals }.

Plan JSON:
${JSON.stringify(plan)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a budget optimization assistant. Always return strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1200,
      temperature: 0.4,
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(aiResponse); } catch {
      const trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }
    if (!parsed) return res.status(502).json({ success: false, error: 'Invalid AI response' });
    res.json({ success: true, data: parsed, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Budget Optimization Error:', error);
    res.status(500).json({ success: false, error: 'Failed to optimize budget', message: 'Please try again later' });
  }
});

// AI Smart Adjust endpoint
app.post('/api/ai/smart-adjust', async (req, res) => {
  try {
    const { plan, action } = req.body; // action: { type: 'reduce_cost' | 'add_activities', amountINR?: number, theme?: string }

    const prompt = `Apply this smart adjustment to the trip plan and return STRICT JSON { updatedPlan, note }.
Action: ${JSON.stringify(action)}
Plan JSON:
${JSON.stringify(plan)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a trip customization assistant. Always return strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.6,
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(aiResponse); } catch {
      const trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }
    if (!parsed) return res.status(502).json({ success: false, error: 'Invalid AI response' });
    res.json({ success: true, data: parsed, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Smart Adjust Error:', error);
    res.status(500).json({ success: false, error: 'Failed to apply smart adjustment', message: 'Please try again later' });
  }
});

// AI Regenerate Plan Parts endpoint
app.post('/api/ai/regenerate-plan', async (req, res) => {
  try {
    const { instructions, context, fullItinerary } = req.body as {
      instructions: string;
      context: Array<{ type: string; currentValue: string; label: string }>;
      fullItinerary: any[];
    };

    if (!instructions || !Array.isArray(context) || context.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing instructions or context',
        message: 'Please provide edit instructions and at least one selected part.',
      });
    }

    // Build a compact summary of the full itinerary for additional context
    let itinerarySummary = '';
    try {
      const daysByDate: Record<string, any[]> = {};
      (fullItinerary || []).forEach((activity: any) => {
        const dateKey = activity.date || 'unknown-date';
        if (!daysByDate[dateKey]) daysByDate[dateKey] = [];
        daysByDate[dateKey].push(activity);
      });

      itinerarySummary = Object.entries(daysByDate)
        .map(([date, acts]) => {
          const titles = (acts as any[]).slice(0, 5).map((a) => a.title).join(', ');
          return `- ${date}: ${titles}${(acts as any[]).length > 5 ? '…' : ''}`;
        })
        .join('\n');
    } catch {
      itinerarySummary = 'Itinerary structure unavailable';
    }

    const contextDescription = context
      .map((item, index) => {
        return `PART ${index + 1} [${item.type.toUpperCase()}]\nLabel: ${item.label}\nCurrent value: ${item.currentValue}`;
      })
      .join('\n\n');

    const prompt = `You are WanderWise, an expert Indian travel planner. You will update specific parts of an existing group itinerary based on the user's instructions.

IMPORTANT RULES:
- You must return STRICT JSON ONLY, no extra text, in the format: { "regeneratedContent": ["string", "string", ...] }
- The regeneratedContent array MUST have the same length and same order as the parts listed below.
- Each item in regeneratedContent MUST be a single string value that can be directly used to replace the corresponding current value.
- Preserve the overall style and realism of an Indian trip itinerary (locations, times, descriptions).
- If instructions are vague, make sensible but conservative improvements.

USER INSTRUCTIONS:
"""${instructions}"""

SELECTED ITINERARY PARTS (in order):
${contextDescription}

FULL ITINERARY SUMMARY (for context, do not rewrite all of this):
${itinerarySummary}

Now generate the updated values ONLY for the selected parts, in the same order, as strict JSON: { "regeneratedContent": ["newValue1", "newValue2", ...] }`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a precise trip editing assistant. Always return strict JSON only.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.6,
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';

    let parsed: any = null;
    try {
      parsed = JSON.parse(aiResponse);
    } catch {
      const trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = null;
      }
    }

    if (!parsed || !Array.isArray(parsed.regeneratedContent)) {
      return res.status(502).json({
        success: false,
        error: 'Invalid AI response',
        message: 'AI did not return the expected JSON format.',
      });
    }

    // Ensure the array length matches the number of selected parts
    const regeneratedContent: string[] = parsed.regeneratedContent.slice(0, context.length).map((val: any) => {
      if (typeof val === 'string') return val;
      if (val == null) return '';
      return String(val);
    });

    res.json({
      success: true,
      data: { regeneratedContent },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Regenerate Plan Parts Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate plan parts',
      message: 'Please try again later',
    });
  }
});

// AI Booking Recommendations endpoint
app.post('/api/ai/booking-recommendations', async (req, res) => {
  try {
    const { from, to, date, type, preferences } = req.body;

    const prompt = `Provide booking recommendations for ${type} travel from ${from} to ${to} on ${date}.

Preferences: ${preferences}

Please suggest:
1. Best booking platforms for this route
2. Optimal timing for bookings
3. Cost-saving tips
4. Alternative options
5. What to expect for pricing

Focus on Indian travel booking platforms and realistic pricing in Indian Rupees.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert on Indian travel bookings. Provide practical advice on flights, trains, and hotels in India." },
        { role: "user", content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content || "Unable to provide recommendations";

    res.json({
      success: true,
      recommendations: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Booking Recommendations Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: 'Please try again later'
    });
  }
});

// Get group with locked plan data
app.get('/api/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // This endpoint should fetch group data from Supabase
    // For now, return a placeholder structure
    // The frontend will need to call Supabase directly or we can add Supabase client here
    res.json({
      success: true,
      data: {
        id,
        // Group data will be fetched by frontend using groupRepository
        message: 'Use groupRepository.getGroup() in frontend to fetch group data'
      }
    });
  } catch (error) {
    console.error('Get Group Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get group',
      message: 'Please try again later'
    });
  }
});

// Flights search endpoint
app.get('/api/flights/search', async (req, res) => {
  try {
    const { source, destination, date, travellers } = req.query;
    
    if (!source || !destination || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: source, destination, date'
      });
    }

    const sourceStr = Array.isArray(source) ? source[0] : source;
    const destinationStr = Array.isArray(destination) ? destination[0] : destination;
    const dateStr = Array.isArray(date) ? date[0] : date;
    const travellersNum = travellers ? (Array.isArray(travellers) ? parseInt(travellers[0] as string) : parseInt(travellers as string)) : 1;

    const cacheKey = getCacheKey('flight', { 
      source: sourceStr as string, 
      destination: destinationStr as string, 
      date: dateStr as string, 
      travellers: travellersNum 
    });
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Call external flight API
    const flights = await searchFlightsAPI(sourceStr as string, destinationStr as string, dateStr as string, travellersNum);
    
    setCached(cacheKey, flights, 15);
    
    res.json({
      success: true,
      data: flights
    });
  } catch (error) {
    console.error('Flights Search Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search flights',
      message: 'Please try again later'
    });
  }
});

// Trains search endpoint
app.get('/api/trains/search', async (req, res) => {
  try {
    const { source, destination, date, travellers } = req.query;
    
    if (!source || !destination || !date) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: source, destination, date'
      });
    }

    const sourceStr = Array.isArray(source) ? source[0] : source;
    const destinationStr = Array.isArray(destination) ? destination[0] : destination;
    const dateStr = Array.isArray(date) ? date[0] : date;
    const travellersNum = travellers ? (Array.isArray(travellers) ? parseInt(travellers[0] as string) : parseInt(travellers as string)) : 1;

    const cacheKey = getCacheKey('train', { 
      source: sourceStr as string, 
      destination: destinationStr as string, 
      date: dateStr as string, 
      travellers: travellersNum 
    });
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Call external train API
    const trains = await searchTrainsAPI(sourceStr as string, destinationStr as string, dateStr as string);
    
    setCached(cacheKey, trains, 15);
    
    res.json({
      success: true,
      data: trains
    });
  } catch (error) {
    console.error('Trains Search Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search trains',
      message: 'Please try again later'
    });
  }
});

// StayAPI - Search hotels
async function searchHotelsStayAPI(location: string, checkIn: string, checkOut: string, adults: number): Promise<any[]> {
  const STAYAPI_KEY = process.env.STAYAPI_KEY || process.env.HIGHNOTE_API_KEY;
  
  if (!STAYAPI_KEY) {
    console.error('❌ STAYAPI_KEY is missing. Please set it in your .env file.');
    return [];
  }
  
  try {
    console.log(`🏨 Searching hotels: ${location} from ${checkIn} to ${checkOut}`);
    
    // StayAPI search endpoint
    const response = await fetch(
      `https://api.stayapi.com/v1/booking/hotel/search?location=${encodeURIComponent(location)}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}`,
      {
        headers: {
          'x-api-key': STAYAPI_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.error('StayAPI rate limit reached');
        return [];
      }
      const errorText = await response.text();
      console.error(`StayAPI error: ${response.status} - ${errorText.substring(0, 200)}`);
      return [];
    }

    const data = await response.json() as any;
    
    // Handle different response formats
    const hotels = data.hotels || data.data || data.results || (Array.isArray(data) ? data : []);
    
    if (!Array.isArray(hotels) || hotels.length === 0) {
      console.warn(`⚠️ No hotels found for ${location}`);
      return [];
    }
    
    console.log(`✅ Found ${hotels.length} hotels`);
    
    return hotels.slice(0, 20).map((hotel: any, index: number) => ({
      id: hotel.id?.toString() || hotel.hotel_id?.toString() || `stayapi-${index}`,
      name: hotel.name || hotel.hotel_name || 'Unknown Hotel',
      location: hotel.location || hotel.city || location,
      rating: hotel.rating ? parseFloat(hotel.rating) : hotel.review_score ? parseFloat(hotel.review_score) : undefined,
      reviewCount: hotel.review_count || hotel.review_nr ? parseInt(hotel.review_nr) : undefined,
      pricePerNight: hotel.price ? parseFloat(hotel.price) : hotel.pricePerNight ? parseFloat(hotel.pricePerNight) : undefined,
      currency: hotel.currency || 'USD',
      imageUrl: hotel.image || hotel.main_photo_url || hotel.photo1 || undefined,
      distance: hotel.distance ? parseFloat(hotel.distance) : undefined,
      distanceUnit: hotel.distanceUnit || 'km',
      amenities: hotel.amenities ? (Array.isArray(hotel.amenities) ? hotel.amenities : []) : [],
      address: hotel.address || hotel.location || '',
      district: hotel.district || undefined,
      bookingSource: 'stayapi' as const,
      raw: hotel,
    }));
  } catch (error) {
    console.error('Error searching StayAPI hotels:', error);
    return [];
  }
}

// Booking.com API - Search locations to get destination ID (kept for backward compatibility)
async function searchBookingLocations(locationName: string): Promise<string | null> {
  if (!RAPID_API_KEY) {
    console.warn('RapidAPI key not configured for Booking.com');
    return null;
  }

  try {
    const response = await fetch(
      `https://booking-com.p.rapidapi.com/v1/hotels/locations?name=${encodeURIComponent(locationName)}&locale=en-gb`,
      {
        headers: {
          'X-RapidAPI-Key': RAPID_API_KEY,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      console.error(`Booking.com locations API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as any;
    // API returns array of locations, get the first one's dest_id
    if (Array.isArray(data) && data.length > 0 && data[0]?.dest_id) {
      return data[0].dest_id.toString();
    }
    return null;
  } catch (error) {
    console.error('Error searching Booking.com locations:', error);
    return null;
  }
}

// Booking.com API - Search hotels by destination ID
async function searchBookingHotels(destId: string, checkIn: string, checkOut: string, adults: number): Promise<any[]> {
  if (!RAPID_API_KEY) {
    console.warn('RapidAPI key not configured for Booking.com');
    return [];
  }

  try {
    const searchParams = new URLSearchParams({
      dest_id: destId,
      checkin_date: checkIn,
      checkout_date: checkOut,
      adults_number: adults.toString(),
      room_number: '1',
      locale: 'en-gb',
      units: 'metric',
      order_by: 'popularity',
    });

    const response = await fetch(
      `https://booking-com.p.rapidapi.com/v1/hotels/search?${searchParams.toString()}`,
      {
        headers: {
          'X-RapidAPI-Key': RAPID_API_KEY,
          'X-RapidAPI-Host': 'booking-com.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.error('Booking.com API rate limit reached');
        return [];
      }
      console.error(`Booking.com hotels API error: ${response.status}`);
      return [];
    }

    const data = await response.json() as any;
    
    // API returns { result: [...] }
    if (data && data.result && Array.isArray(data.result)) {
      return data.result.map((hotel: any, index: number) => ({
        id: hotel.hotel_id?.toString() || `booking-${index}`,
        name: hotel.hotel_name || 'Unknown Hotel',
        location: hotel.city_trans || hotel.city || '',
        rating: hotel.review_score ? parseFloat(hotel.review_score) : undefined,
        reviewCount: hotel.review_nr ? parseInt(hotel.review_nr) : undefined,
        pricePerNight: hotel.price_breakdown?.gross_price ? parseFloat(hotel.price_breakdown.gross_price) : undefined,
        currency: hotel.price_breakdown?.currency || 'USD',
        imageUrl: hotel.main_photo_url || hotel.photo1 || undefined,
        distance: hotel.distance ? parseFloat(hotel.distance) : undefined,
        distanceUnit: hotel.distance_unit || 'km',
        amenities: hotel.hotel_facilities ? (Array.isArray(hotel.hotel_facilities) ? hotel.hotel_facilities : []) : [],
        address: hotel.address_trans || hotel.address || '',
        district: hotel.district || undefined,
        bookingSource: 'booking' as const,
        raw: hotel,
      }));
    }
    return [];
  } catch (error) {
    console.error('Error searching Booking.com hotels:', error);
    return [];
  }
}

// Hotels search endpoint - Booking.com API integration
app.get('/api/hotels/search', async (req, res) => {
  try {
    const { location, checkIn, checkOut, travellers } = req.query;
    
    if (!location || !checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: location, checkIn, checkOut'
      });
    }

    const locationStr = Array.isArray(location) ? location[0] : location;
    const checkInStr = Array.isArray(checkIn) ? checkIn[0] : checkIn;
    const checkOutStr = Array.isArray(checkOut) ? checkOut[0] : checkOut;
    const travellersNum = travellers ? (Array.isArray(travellers) ? parseInt(travellers[0] as string) : parseInt(travellers as string)) : 1;

    const cacheKey = getCacheKey('hotel', { 
      location: locationStr as string, 
      checkIn: checkInStr as string, 
      checkOut: checkOutStr as string, 
      travellers: travellersNum 
    });
    const cached = getCached<any[]>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Use StayAPI
    const hotels = await searchHotelsStayAPI(locationStr as string, checkInStr as string, checkOutStr as string, travellersNum);
    
    setCached(cacheKey, hotels, 15);
    
    res.json({
      success: true,
      data: hotels
    });
  } catch (error) {
    console.error('Hotels Search Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search hotels',
      message: 'Please try again later'
    });
  }
});

// Save booking selection endpoints
app.post('/api/bookings/select-flight', async (req, res) => {
  try {
    const { groupId, selectedOption } = req.body;
    
    if (!groupId || !selectedOption) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: groupId, selectedOption'
      });
    }

    // Save to database using bookingRepository
    // For now, return success
    res.json({
      success: true,
      message: 'Flight selection saved',
      data: { groupId, selectedOption }
    });
  } catch (error) {
    console.error('Save Flight Selection Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save flight selection',
      message: 'Please try again later'
    });
  }
});

app.post('/api/bookings/select-train', async (req, res) => {
  try {
    const { groupId, selectedOption } = req.body;
    
    if (!groupId || !selectedOption) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: groupId, selectedOption'
      });
    }

    res.json({
      success: true,
      message: 'Train selection saved',
      data: { groupId, selectedOption }
    });
  } catch (error) {
    console.error('Save Train Selection Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save train selection',
      message: 'Please try again later'
    });
  }
});

app.post('/api/bookings/select-hotel', async (req, res) => {
  try {
    const { groupId, selectedOption } = req.body;
    
    if (!groupId || !selectedOption) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: groupId, selectedOption'
      });
    }

    res.json({
      success: true,
      message: 'Hotel selection saved',
      data: { groupId, selectedOption }
    });
  } catch (error) {
    console.error('Save Hotel Selection Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save hotel selection',
      message: 'Please try again later'
    });
  }
});

// SMS Alert Endpoint (using TextBee)
app.post('/api/send-sms', async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: to, message'
      });
    }

    if (!textbeeConfigured) {
      return res.status(503).json({
        success: false,
        error: 'SMS service not configured. Please add TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID to .env'
      });
    }

    // Normalize phone number (remove + if present, TextBee handles country codes)
    let phoneNumber = to.replace(/[^\d+]/g, '');
    if (!phoneNumber.startsWith('+')) {
      // Add +91 for Indian numbers if missing
      if (phoneNumber.startsWith('91')) {
        phoneNumber = '+' + phoneNumber;
      } else {
        phoneNumber = '+91' + phoneNumber;
      }
    }

    console.log(`📱 Sending SMS via TextBee to ${phoneNumber}...`);

    // Send SMS via TextBee API
    const response = await axios.post(
      `${TEXTBEE_BASE_URL}/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`,
      {
        recipients: [phoneNumber],
        message: message,
      },
      {
        headers: {
          'x-api-key': TEXTBEE_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ SMS sent successfully to ${phoneNumber} via TextBee`);

    res.json({
      success: true,
      message: 'SMS sent successfully',
      data: response.data
    });
  } catch (error: any) {
    console.error('SMS Send Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to send SMS',
      message: error.response?.data?.message || error.message || 'Please check your TextBee configuration and try again'
    });
  }
});

// WhatsApp Alert Endpoint (Disabled - SMS only)
app.post('/api/send-whatsapp', async (_req, res) => {
  res.status(503).json({
    success: false,
    error: 'WhatsApp service is disabled. Using SMS only.'
  });
});

// ============================================
// SOS SESSION & ACKNOWLEDGEMENT TRACKING
// ============================================

// Create a new SOS session
app.post('/api/sos/session', async (req, res) => {
  try {
    const { userId, userName, groupId, location, emergencyContacts } = req.body;

    if (!userId || !userName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: userId, userName'
      });
    }

    // For now, store in memory (in production, use Supabase)
    const sessionId = `sos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const session = {
      id: sessionId,
      userId,
      userName,
      groupId,
      status: 'active',
      startedAt: new Date().toISOString(),
      lastLocation: location,
      lastLocationUpdate: new Date().toISOString(),
      locationUpdateCount: 0,
      emergencyContacts: emergencyContacts || [],
      acknowledgements: []
    };

    // Store session in memory (for prototype)
    sosSessions[sessionId] = session;

    // Also store by phone number for reverse lookup
    for (const contact of emergencyContacts || []) {
      const normalizedPhone = contact.phone.replace(/[^\d]/g, '');
      sosSessionsByPhone[normalizedPhone] = sessionId;
    }

    console.log(`🆘 SOS Session created: ${sessionId} for ${userName}`);

    res.json({
      success: true,
      sessionId,
      session
    });
  } catch (error: any) {
    console.error('Error creating SOS session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create SOS session'
    });
  }
});

// Get SOS session status
app.get('/api/sos/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = sosSessions[sessionId];
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error: any) {
    console.error('Error fetching SOS session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SOS session'
    });
  }
});

// Cancel/End SOS session
app.post('/api/sos/session/:sessionId/cancel', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = sosSessions[sessionId];
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    session.status = 'cancelled';
    session.endedAt = new Date().toISOString();

    console.log(`🛑 SOS Session cancelled: ${sessionId}`);

    res.json({
      success: true,
      session
    });
  } catch (error: any) {
    console.error('Error cancelling SOS session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel SOS session'
    });
  }
});

// TextBee Webhook - Receive incoming SMS replies
// TextBee can send data in different formats, handle all possibilities
app.post('/api/textbee/webhook', async (req, res) => {
  try {
    console.log('📨 TextBee webhook received:');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));

    // TextBee might send data in different formats
    // Try multiple field names
    const from = req.body.from || req.body.sender || req.body.phoneNumber || req.body.phone || req.body.senderNumber;
    const message = req.body.message || req.body.text || req.body.body || req.body.content || req.body.sms;
    const timestamp = req.body.timestamp || req.body.receivedAt || req.body.time || new Date().toISOString();

    console.log(`📱 Parsed: from=${from}, message=${message}`);

    if (!from || !message) {
      console.log('⚠️ Missing from or message in webhook');
      return res.status(200).json({
        success: true,
        message: 'Webhook received but missing from/message fields'
      });
    }

    // Normalize phone number for lookup (remove all non-digits)
    const normalizedPhone = from.replace(/[^\d]/g, '');
    // Also try without country code
    const phoneWithoutCountryCode = normalizedPhone.replace(/^91/, '');
    
    console.log(`🔍 Looking for phone: ${normalizedPhone} or ${phoneWithoutCountryCode}`);
    console.log(`📋 Active phone mappings:`, JSON.stringify(sosSessionsByPhone, null, 2));
    
    // Find the SOS session this contact belongs to
    let sessionId = sosSessionsByPhone[normalizedPhone] || sosSessionsByPhone[phoneWithoutCountryCode];
    
    // Also try to find by iterating
    if (!sessionId) {
      for (const [phone, sid] of Object.entries(sosSessionsByPhone)) {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        if (cleanPhone.endsWith(phoneWithoutCountryCode) || phoneWithoutCountryCode.endsWith(cleanPhone)) {
          sessionId = sid;
          break;
        }
      }
    }
    
    if (!sessionId) {
      console.log(`⚠️ No active SOS session found for phone: ${normalizedPhone}`);
      return res.json({
        success: true,
        message: 'No active session for this contact'
      });
    }

    const session = sosSessions[sessionId];
    
    if (!session || session.status !== 'active') {
      console.log(`⚠️ SOS session not active: ${sessionId}`);
      return res.json({
        success: true,
        message: 'Session not active'
      });
    }

    // Parse the response message
    const upperMessage = message.toUpperCase().trim();
    let responseType = 'other';
    
    if (upperMessage.includes('SAFE') || upperMessage.includes('OK') || upperMessage === 'YES') {
      responseType = 'safe';
    } else if (upperMessage.includes('ON MY WAY') || upperMessage.includes('COMING') || upperMessage.includes('OMW')) {
      responseType = 'on_my_way';
    } else if (upperMessage.includes('RECEIVED') || upperMessage.includes('GOT IT') || upperMessage.includes('NOTED')) {
      responseType = 'received';
    }

    // Find contact name
    const contact = session.emergencyContacts.find((c: any) => {
      const contactPhone = c.phone.replace(/[^\d]/g, '');
      return contactPhone.includes(phoneWithoutCountryCode) || phoneWithoutCountryCode.includes(contactPhone);
    });
    const contactName = contact?.name || 'Unknown Contact';

    // Add acknowledgement
    const acknowledgement = {
      id: `ack-${Date.now()}`,
      contactName,
      contactPhone: from,
      responseType,
      responseMessage: message,
      acknowledgedAt: timestamp
    };

    session.acknowledgements.push(acknowledgement);

    console.log(`✅ Acknowledgement received from ${contactName}: ${responseType} - "${message}"`);

    // Emit real-time update via Socket.io
    io.emit(`sos-acknowledgement-${sessionId}`, acknowledgement);

    res.json({
      success: true,
      acknowledgement
    });
  } catch (error: any) {
    console.error('Error processing TextBee webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

// Test endpoint to manually add acknowledgement (for testing without webhook)
app.post('/api/sos/test-acknowledgement', async (req, res) => {
  try {
    const { sessionId, contactName, contactPhone, responseType, responseMessage } = req.body;

    console.log(`🧪 Test acknowledgement for session: ${sessionId}`);

    const session = sosSessions[sessionId];
    
    if (!session) {
      // Find the latest active session
      const activeSessionId = Object.keys(sosSessions).find(id => sosSessions[id].status === 'active');
      if (!activeSessionId) {
        return res.status(404).json({
          success: false,
          error: 'No active SOS session found'
        });
      }
      
      const activeSession = sosSessions[activeSessionId];
      const acknowledgement = {
        id: `ack-${Date.now()}`,
        contactName: contactName || activeSession.emergencyContacts[0]?.name || 'Test Contact',
        contactPhone: contactPhone || activeSession.emergencyContacts[0]?.phone || '+910000000000',
        responseType: responseType || 'safe',
        responseMessage: responseMessage || 'I am safe',
        acknowledgedAt: new Date().toISOString()
      };

      activeSession.acknowledgements.push(acknowledgement);
      io.emit(`sos-acknowledgement-${activeSessionId}`, acknowledgement);

      console.log(`✅ Test acknowledgement added to session ${activeSessionId}`);

      return res.json({
        success: true,
        sessionId: activeSessionId,
        acknowledgement
      });
    }

    const acknowledgement = {
      id: `ack-${Date.now()}`,
      contactName: contactName || session.emergencyContacts[0]?.name || 'Test Contact',
      contactPhone: contactPhone || session.emergencyContacts[0]?.phone || '+910000000000',
      responseType: responseType || 'safe',
      responseMessage: responseMessage || 'I am safe',
      acknowledgedAt: new Date().toISOString()
    };

    session.acknowledgements.push(acknowledgement);
    io.emit(`sos-acknowledgement-${sessionId}`, acknowledgement);

    console.log(`✅ Test acknowledgement added`);

    res.json({
      success: true,
      acknowledgement
    });
  } catch (error: any) {
    console.error('Error adding test acknowledgement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add test acknowledgement'
    });
  }
});

// Debug endpoint to see all active sessions
app.get('/api/sos/debug', async (_req, res) => {
  res.json({
    success: true,
    sessions: sosSessions,
    phoneMapping: sosSessionsByPhone
  });
});

// Get all acknowledgements for a session
app.get('/api/sos/session/:sessionId/acknowledgements', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = sosSessions[sessionId];
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      acknowledgements: session.acknowledgements || []
    });
  } catch (error: any) {
    console.error('Error fetching acknowledgements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch acknowledgements'
    });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Join a channel/group
  socket.on('join-channel', (data: { channelId: string; userId: string; userName: string }) => {
    socket.join(data.channelId);
    console.log(`👤 ${data.userName} (${data.userId}) joined channel: ${data.channelId}`);
    
    // Notify others in the channel
    socket.to(data.channelId).emit('user-joined', {
      userId: data.userId,
      userName: data.userName,
      timestamp: new Date().toISOString(),
    });
  });

  // Leave a channel
  socket.on('leave-channel', (data: { channelId: string; userId: string }) => {
    socket.leave(data.channelId);
    console.log(`👋 User ${data.userId} left channel: ${data.channelId}`);
  });

  // Send voice message
  socket.on('voice-message', (data: {
    channelId: string;
    userId: string;
    userName: string;
    audioUrl: string;
    duration: number;
  }) => {
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from: data.userName,
      fromId: data.userId,
      to: 'Everyone',
      audioUrl: data.audioUrl,
      duration: data.duration,
      timestamp: new Date(),
      channelId: data.channelId,
    };

    // Broadcast to all users in the channel (except sender)
    socket.to(data.channelId).emit('voice-message-received', message);
    
    // Also send back to sender for confirmation
    socket.emit('voice-message-sent', message);
    
    console.log(`📢 Voice message sent in channel ${data.channelId} by ${data.userName}`);
  });

  // Handle typing indicator (optional)
  socket.on('typing', (data: { channelId: string; userId: string; userName: string }) => {
    socket.to(data.channelId).emit('user-typing', {
      userId: data.userId,
      userName: data.userName,
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 WanderWise API Server running on port ${PORT}`);
  console.log(`🔌 Socket.io server ready for real-time communication`);
  console.log(`🤖 OpenAI integration: ${process.env.OPENAI_API_KEY ? 'Connected' : 'Not configured'}`);
});

export default app;
export { io };
