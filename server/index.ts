import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createServer } from 'http';
import { Server } from 'socket.io';

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

    // Try with city name, and if that fails, try with ", India" appended
    // Note: Geocoding API uses different base URL than weather API
    let searchQuery = city;
    let geoResponse = await fetch(
      `${OPENWEATHER_GEO_URL}/direct?q=${encodeURIComponent(searchQuery)}&limit=1&appid=${apiKeyToUse}`
    );
    
    if (!geoResponse.ok) {
      const errorText = await geoResponse.text();
      console.error(`Weather API error (${geoResponse.status}) for "${city}":`, errorText.substring(0, 200));
      
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
      
      // Try with ", India" appended
      searchQuery = `${city}, India`;
      console.log(`Retrying weather fetch with: "${searchQuery}"`);
      geoResponse = await fetch(
        `${OPENWEATHER_GEO_URL}/direct?q=${encodeURIComponent(searchQuery)}&limit=1&appid=${apiKeyToUse}`
      );
      
      if (!geoResponse.ok) {
        const retryErrorText = await geoResponse.text();
        console.error(`Weather API retry error (${geoResponse.status}) for "${searchQuery}":`, retryErrorText.substring(0, 200));
        
        // Don't throw - just return empty array so plan generation can continue
        console.warn(`Skipping weather data for "${city}". Plan generation will continue without weather information.`);
        return [];
      }
    }
    
    const geoData = await geoResponse.json() as GeoLocationResponse[];
    if (!geoData || geoData.length === 0) {
      console.log(`No coordinates found for city: ${city}`);
      return []; // Return empty array, plan generation will continue without weather
    }
    
    const { lat, lon } = geoData[0];
    console.log(`Found coordinates for ${city}: ${lat}, ${lon}`);
    
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
  const AVIATIONSTACK_API_KEY = (process.env.AVIATIONSTACK_API_KEY || process.env.AVIATION_EDGE_API_KEY || 'c7b7255541e28224644dc8592cb4ace5').trim();
  
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
  weatherData?: WeatherData;
  previousDaysSummary?: string;
  remainingBudget: number;
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
    weatherData,
    previousDaysSummary,
    remainingBudget
  } = params;

  // Build context about previous days
  let previousContext = '';
  if (previousDaysSummary) {
    previousContext = `\n\nPREVIOUS DAYS SUMMARY (for consistency and continuity):\n${previousDaysSummary}\n\nIMPORTANT: Make sure Day ${dayNumber} activities complement and don't repeat the previous days.`;
  }

  // Build weather context for this specific day
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

  const prompt = `You are WanderWise, an expert Indian travel planner. Generate a DETAILED plan for DAY ${dayNumber} of ${totalDays} days, strictly as valid JSON only.

TRIP OVERVIEW (Context for all days):
- From: ${from}
- To: ${to}
- Total Duration: ${totalDays} days
- Budget per day: ₹${Math.round(remainingBudget / (totalDays - dayNumber + 1))} (out of total ₹${budget})
- Travelers: ${travelers}
- Interests: ${Array.isArray(interests) ? interests.join(', ') : interests}
- Trip Style: ${tripStyle || 'balanced'}
${customDestinations && customDestinations.length > 0 ? `- Must-visit destinations (must appear in the itinerary at least once across the trip): ${customDestinations.join(', ')}\n` : ''}
${customActivities && customActivities.length > 0 ? `- Specific activities requested (must appear in the itinerary at least once across the trip): ${customActivities.join(', ')}\n` : ''}

DAY ${dayNumber} SPECIFIC DETAILS:
- Date: ${date}
- Activities needed: Exactly ${activitiesPerDay} activities
- Budget for this day: Approximately ₹${Math.round(remainingBudget / (totalDays - dayNumber + 1))}
${weatherContext}${previousContext}

CRITICAL REQUIREMENTS:
1. Generate EXACTLY ${activitiesPerDay} activities for Day ${dayNumber}
2. Each activity MUST have a precise time (format: "HH:MM" like "08:30", "14:15", "19:00")
3. Distribute activities logically:
   - Morning: 6:00 AM - 11:00 AM
   - Afternoon: 11:00 AM - 5:00 PM  
   - Evening: 5:00 PM - 10:00 PM
4. Include detailed transport information (walking distance, local cab, auto-rickshaw, etc.)
5. Add food/cafe recommendations at appropriate meal times
6. Include local hidden gems or lesser-known spots if applicable
7. Consider weather conditions when planning timing and activity types
8. Provide realistic costs in INR (no symbols)
9. Whenever possible, schedule any remaining must-visit destinations and specific requested activities that have not yet been covered on previous days, ensuring they appear in the overall trip.

OUTPUT JSON SCHEMA (follow exactly):
{
  "day": ${dayNumber},
  "header": "Creative day title (e.g., 'Cultural Heritage & Local Flavors')",
  "date": "${date}",
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
        "description": "Detailed description of what to do and see here",
        "location": "Specific address or area",
        "duration": "1-2 hours",
        "costINR": 500,
        "travelDistanceKm": 2.5,
        "transportMode": "local cab / walking / auto-rickshaw",
        "transportCostINR": 150,
        "foodRecommendation": "Nearby cafe/restaurant name (if applicable)",
        "highlights": "Key things to notice or experience",
        "tips": "Practical tips (best photo spots, what to bring, etc.)",
        "bestTimeToVisit": "Specific time window",
        "whatToExpect": "What visitors typically experience",
        "localInsight": "Hidden gem tip or local secret (if applicable)"
      }
    ],
    "afternoon": [...],
    "evening": [...]
  },
  "aiTip": "Day-specific tip considering weather and context",
  "totalDayCostINR": 3500,
  "breakdown": {
    "transport": 500,
    "food": 1200,
    "activities": 1500,
    "misc": 300
  }
}

IMPORTANT:
- Total activities across morning + afternoon + evening = exactly ${activitiesPerDay}
- Times should be realistic and account for travel between locations
- Include meal recommendations at breakfast, lunch, and dinner times
- Provide specific transport details (mode, cost, duration)
- Add local insights and hidden gems where possible
- Ensure totalDayCostINR matches sum of all activity costs + transport + food`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: `You are an expert Indian travel planner specializing in detailed day-by-day itineraries. Always return STRICT JSON per the provided schema. Focus on authentic local experiences, precise timings, practical transport advice, and hidden gems.` 
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
    const { from, to, startDate, endDate, budget, travelers, interests, customDestinations, customActivities, activitiesPerDay, tripStyle } = req.body;

    // Calculate duration
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    console.log(`📅 Generating ${durationDays}-day trip plan with ${activitiesPerDay} activities per day`);
    console.log(`📍 From: ${from} → To: ${to}`);

    // Fetch weather data for all days
    console.log('🌤️  Fetching weather data for:', to);
    const weatherForecast = await fetchWeatherForecast(to, startDate, endDate);
    console.log(`✅ Weather forecast received: ${weatherForecast.length} days`);

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
          weatherData: dayWeather || undefined,
          previousDaysSummary: previousDaysSummary || undefined,
          remainingBudget: remainingBudget
        });
        
        // Add weather data if not included by AI
        if (dayWeather && (!dayPlan.weather || !dayPlan.weather.temperature)) {
          dayPlan.weather = {
            temperature: dayWeather.temperature,
            condition: dayWeather.condition,
            description: dayWeather.description,
            icon: dayWeather.icon,
            humidity: dayWeather.humidity,
            windSpeed: dayWeather.windSpeed
          };
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
      budgetWarning
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
  const STAYAPI_KEY = 'sk_live_e1a6c24e52f82b630015743e0860f98de343ca2bc990b2cff213f645225827ef';
  
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
