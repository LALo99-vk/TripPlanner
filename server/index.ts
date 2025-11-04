import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
// Try loading from server directory first, then root
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// OpenWeather API Configuration
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'c1c06459eef9fe52fc6d1208b9c556ac';
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const OPENWEATHER_GEO_URL = 'https://api.openweathermap.org/geo/1.0'; // Geocoding API uses different base URL

// Debug: Check if API key is loaded (only show first/last 4 chars for security)
if (process.env.OPENWEATHER_API_KEY) {
  const key = process.env.OPENWEATHER_API_KEY.trim();
  console.log(`✅ OpenWeather API key loaded: ${key.substring(0, 4)}...${key.substring(key.length - 4)} (length: ${key.length})`);
} else {
  console.warn('⚠️  OPENWEATHER_API_KEY not found in environment variables, using fallback key');
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
${customDestinations && customDestinations.length > 0 ? `- Must-visit destinations: ${customDestinations.join(', ')}\n` : ''}
${customActivities && customActivities.length > 0 ? `- Specific activities requested: ${customActivities.join(', ')}\n` : ''}

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

// AI Emergency Contacts endpoint
app.post('/api/ai/emergency-contacts', async (req, res) => {
  try {
    const { destination, stateOrCountry } = req.body;
    const place = destination || 'India';

    const prompt = `Provide emergency contact details for travelers in ${place}${stateOrCountry ? ', ' + stateOrCountry : ''}.

Return STRICT JSON only, no markdown, using this schema exactly:
{
  "general": {
    "police": { "number": string, "note": string },
    "ambulance": { "number": string, "note": string },
    "fire": { "number": string, "note": string },
    "womenHelpline": { "number": string, "note": string },
    "touristHelpline": { "number": string, "note": string }
  },
  "local": {
    "primaryCity": string,
    "nearestHospitals": [ { "name": string, "phone": string, "address": string, "open24x7": boolean } ],
    "nearestPoliceStations": [ { "name": string, "phone": string, "address": string } ]
  },
  "tips": [string]
}

Rules:
- Prefer authoritative national numbers for India where relevant
- Provide 2-4 local hospitals and 2-3 police stations within/near the city
- If exact local numbers are uncertain, provide best-known alternatives and add a note in tips to confirm locally
- Keep values realistic and safe.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a safety assistant for travelers in India. Always return strict JSON matching the user schema.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 900,
      temperature: 0.3,
    });

    const aiResponse = completion.choices[0]?.message?.content || '{}';
    let parsed: any = null;
    try { parsed = JSON.parse(aiResponse); } catch {
      let trimmed = aiResponse.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      const firstBrace = trimmed.indexOf('{');
      if (firstBrace > 0) trimmed = trimmed.substring(firstBrace);
      const lastBrace = trimmed.lastIndexOf('}');
      if (lastBrace >= 0 && lastBrace < trimmed.length - 1) trimmed = trimmed.substring(0, lastBrace + 1);
      trimmed = trimmed.replace(/,(\s*[}\]])/g, '$1');
      try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    }
    if (!parsed) return res.status(502).json({ success: false, error: 'Invalid AI response' });
    res.json({ success: true, data: parsed, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Emergency Contacts Error:', error);
    res.status(500).json({ success: false, error: 'Failed to get emergency contacts', message: 'Please try again later' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 WanderWise API Server running on port ${PORT}`);
  console.log(`🤖 OpenAI integration: ${process.env.OPENAI_API_KEY ? 'Connected' : 'Not configured'}`);
});

export default app;
