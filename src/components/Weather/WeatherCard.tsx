import React from 'react';
import { WeatherData } from '../../services/weatherService';
import { Cloud, CloudRain, Sun, Snowflake, CloudLightning, CloudFog } from 'lucide-react';

interface WeatherCardProps {
  weatherData: WeatherData;
  suggestion: string;
}

const WeatherCard: React.FC<WeatherCardProps> = ({ weatherData, suggestion }) => {
  // Check if weatherData is valid
  if (!weatherData || !weatherData.condition) {
    return (
      <div className="glass-card p-4 mt-3 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-semibold text-primary">Weather data unavailable</div>
        </div>
        <div className="mt-3 p-3 glass-card bg-white/5">
          <div className="flex items-start">
            <div className="flex-shrink-0 mr-2">💬</div>
            <div className="text-sm text-secondary">
              We're having trouble fetching the weather data. Please check back later for updates.
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  const { temperature, condition, description, date } = weatherData;
  
  // Function to get the appropriate weather icon
  const getWeatherIcon = () => {
    const conditionLower = condition.toLowerCase();
    
    if (conditionLower.includes('clear') || conditionLower.includes('sun')) {
      return <Sun className="h-8 w-8 text-yellow-400" />;
    } else if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
      return <CloudRain className="h-8 w-8 text-blue-400" />;
    } else if (conditionLower.includes('cloud')) {
      return <Cloud className="h-8 w-8 text-gray-400" />;
    } else if (conditionLower.includes('snow')) {
      return <Snowflake className="h-8 w-8 text-blue-200" />;
    } else if (conditionLower.includes('thunder') || conditionLower.includes('lightning')) {
      return <CloudLightning className="h-8 w-8 text-purple-400" />;
    } else if (conditionLower.includes('fog') || conditionLower.includes('mist')) {
      return <CloudFog className="h-8 w-8 text-gray-300" />;
    } else {
      return <Cloud className="h-8 w-8 text-gray-400" />;
    }
  };
  
  // Format date
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  return (
    <div className="glass-card p-4 mt-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          {getWeatherIcon()}
          <div className="ml-3">
            <div className="text-lg font-semibold text-primary">{Math.round(temperature)}°C</div>
            <div className="text-sm text-secondary">{description}</div>
          </div>
        </div>
        <div className="text-sm text-secondary">{formattedDate}</div>
      </div>
      
      <div className="mt-3 p-3 glass-card bg-white/5">
        <div className="flex items-start">
          <div className="flex-shrink-0 mr-2">💬</div>
          <div className="text-sm text-secondary">{suggestion}</div>
        </div>
      </div>
    </div>
  );
};

export default WeatherCard;