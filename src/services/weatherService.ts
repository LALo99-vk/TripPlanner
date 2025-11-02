import { useEffect, useState } from 'react';

// OpenWeatherMap API types
export interface WeatherData {
  city: string;
  date: Date;
  temperature: number;
  condition: string;
  icon: string;
  description: string;
}

export interface WeatherForecast {
  daily: WeatherData[];
  lastUpdated: Date;
}

// OpenWeatherMap API key - should be in .env file
const API_KEY = 'c1c06459eef9fe52fc6d1208b9c556ac'; // Hardcoded for now to ensure it works
const API_BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Function to fetch weather data for a city
export const fetchWeatherForecast = async (city: string): Promise<WeatherForecast> => {
  try {
    // Skip API call if city is empty
    if (!city || city.trim() === '') {
      console.log('No city provided, skipping weather fetch');
      return {
        daily: [],
        lastUpdated: new Date()
      };
    }
    
    console.log('Fetching weather for city:', city);
    
    // First get coordinates for the city
    const geoResponse = await fetch(
      `${API_BASE_URL}/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`
    );
    
    if (!geoResponse.ok) {
      throw new Error('Failed to fetch city coordinates');
    }
    
    const geoData = await geoResponse.json();
    console.log('Geo data:', geoData);
    
    if (!geoData || geoData.length === 0) {
      throw new Error('City not found');
    }
    
    const { lat, lon } = geoData[0];
    
    // Then get 5-day forecast using coordinates
    const forecastResponse = await fetch(
      `${API_BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
    );
    
    if (!forecastResponse.ok) {
      throw new Error('Failed to fetch weather forecast');
    }
    
    const forecastData = await forecastResponse.json();
    
    // Process the forecast data to get daily forecasts
    const dailyForecasts: WeatherData[] = [];
    const processedDates = new Set<string>();
    
    // Group forecasts by day (OpenWeatherMap returns data in 3-hour intervals)
    forecastData.list.forEach((forecast: any) => {
      const date = new Date(forecast.dt * 1000);
      const dateString = date.toDateString();
      
      // Only take the first forecast for each day
      if (!processedDates.has(dateString)) {
        processedDates.add(dateString);
        
        dailyForecasts.push({
          city,
          date,
          temperature: forecast.main.temp,
          condition: forecast.weather[0].main,
          icon: forecast.weather[0].icon,
          description: forecast.weather[0].description
        });
      }
    });
    
    return {
      daily: dailyForecasts,
      lastUpdated: new Date()
    };
  } catch (error) {
    console.error('Error fetching weather data:', error);
    throw error;
  }
};

// Custom hook for weather data with auto-refresh
export const useWeatherForecast = (city: string, refreshInterval = 10800000) => { // Default: 3 hours
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await fetchWeatherForecast(city);
        setForecast(data);
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    
    // Initial fetch
    fetchData();
    
    // Set up interval for auto-refresh
    const intervalId = setInterval(fetchData, refreshInterval);
    
    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [city, refreshInterval]);
  
  return { forecast, loading, error };
};