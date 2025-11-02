import { WeatherData } from './weatherService';
import { AiPlanDay } from './api';

// Generate weather-based recommendations
export const generateWeatherRecommendation = (
  weatherData: WeatherData,
  dayPlan: AiPlanDay
): string => {
  const { condition, temperature } = weatherData;
  const conditionLower = condition.toLowerCase();
  const city = weatherData.city;
  const dayActivities = [
    ...(dayPlan.slots.morning || []),
    ...(dayPlan.slots.afternoon || []),
    ...(dayPlan.slots.evening || [])
  ];
  
  // Get a random activity name from the day plan
  const getRandomActivity = () => {
    if (dayActivities.length > 0) {
      const randomIndex = Math.floor(Math.random() * dayActivities.length);
      return dayActivities[randomIndex].name;
    }
    return null;
  };
  
  // Rainy conditions
  if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
    const indoorSuggestions = [
      `It might rain in ${city} today — would you like to add a museum or indoor cultural experience to your itinerary?`,
      `Rain expected in ${city} — consider bringing an umbrella and planning for indoor activities like local cafés or shopping.`,
      `Rainy weather forecast for ${city} — perfect time to explore indoor attractions or enjoy local cuisine at a restaurant.`
    ];
    return indoorSuggestions[Math.floor(Math.random() * indoorSuggestions.length)];
  }
  
  // Sunny conditions
  if (conditionLower.includes('clear') || conditionLower.includes('sun')) {
    const activity = getRandomActivity();
    const sunnySuggestions = [
      `Clear skies expected in ${city} today — great for outdoor exploration${activity ? ` like ${activity}` : ''} or photography!`,
      `Sunny weather in ${city} — perfect conditions for sightseeing. Don't forget sunscreen!`,
      `Beautiful clear weather in ${city} — ideal for outdoor activities${activity ? ` such as ${activity}` : ''}. Enjoy the sunshine!`
    ];
    return sunnySuggestions[Math.floor(Math.random() * sunnySuggestions.length)];
  }
  
  // Cloudy conditions
  if (conditionLower.includes('cloud')) {
    const cloudySuggestions = [
      `Partly cloudy in ${city} — comfortable conditions for exploring the city without harsh sun.`,
      `Cloudy skies in ${city} today — good weather for walking tours and outdoor activities without overheating.`,
      `Expect some clouds in ${city} — perfect weather for sightseeing with natural light diffusion for great photos!`
    ];
    return cloudySuggestions[Math.floor(Math.random() * cloudySuggestions.length)];
  }
  
  // Snowy conditions
  if (conditionLower.includes('snow')) {
    const snowySuggestions = [
      `Snowfall expected in ${city} — dress warmly and consider indoor activities or enjoy the winter wonderland!`,
      `Snowy conditions in ${city} — perfect for winter photography, but check if outdoor attractions are accessible.`,
      `Snow in the forecast for ${city} — bring appropriate footwear and warm clothing for your adventures today.`
    ];
    return snowySuggestions[Math.floor(Math.random() * snowySuggestions.length)];
  }
  
  // Hot temperature (>30°C)
  if (temperature > 30) {
    const hotSuggestions = [
      `High temperature in ${city} (${Math.round(temperature)}°C) — stay hydrated and plan morning or evening activities to avoid midday heat.`,
      `It's going to be hot in ${city} today — consider water activities or indoor attractions during peak afternoon heat.`,
      `Hot weather expected in ${city} — remember to drink plenty of water and take breaks in shaded areas during your exploration.`
    ];
    return hotSuggestions[Math.floor(Math.random() * hotSuggestions.length)];
  }
  
  // Cold temperature (<10°C)
  if (temperature < 10) {
    const coldSuggestions = [
      `Chilly weather in ${city} (${Math.round(temperature)}°C) — dress in layers and consider warming up in local cafés between sightseeing.`,
      `Cold temperatures expected in ${city} — bring warm clothing and perhaps adjust your itinerary to include more indoor activities.`,
      `It's going to be cold in ${city} today — warm clothing is essential, and hot local beverages can enhance your experience!`
    ];
    return coldSuggestions[Math.floor(Math.random() * coldSuggestions.length)];
  }
  
  // Default/mild conditions
  const defaultSuggestions = [
    `Weather looks good in ${city} (${Math.round(temperature)}°C) — perfect for exploring all your planned activities!`,
    `Comfortable weather conditions in ${city} today — ideal for enjoying your itinerary as planned.`,
    `Pleasant temperatures in ${city} — great conditions for making the most of your travel plans!`
  ];
  return defaultSuggestions[Math.floor(Math.random() * defaultSuggestions.length)];
};