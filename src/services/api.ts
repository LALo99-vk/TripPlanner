const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ChatResponse {
  response: string;
  timestamp: string;
}

// Structured AI Trip Plan types
export interface AiPlanOverview {
  from: string;
  to: string;
  durationDays: number;
  budgetINR: number;
  travelers: number;
  interests: string[];
  summary: string;
}

export interface AiPlanSlotItem {
  name: string;
  time: string; // Specific time like "09:00", "14:30", "18:00"
  description: string;
  location: string;
  duration: string;
  costINR: number;
  travelDistanceKm: number;
  transportMode?: string; // e.g., "local cab", "walking", "auto-rickshaw"
  transportCostINR?: number; // Cost for transport to this activity
  foodRecommendation?: string; // Nearby cafe/restaurant recommendations
  highlights?: string;
  tips?: string;
  bestTimeToVisit?: string;
  whatToExpect?: string;
  localInsight?: string; // Hidden gem tip or local secret
}

export interface AiPlanDayWeather {
  temperature: number;
  condition: string;
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
}

export interface AiPlanDay {
  day: number;
  header: string;
  date?: string;
  weather?: AiPlanDayWeather;
  slots: {
    morning: AiPlanSlotItem[];
    afternoon: AiPlanSlotItem[];
    evening: AiPlanSlotItem[];
  };
  aiTip: string;
  totalDayCostINR: number;
}

export interface AiPlanTotalsBreakdown {
  stay: number;
  food: number;
  transport: number;
  activities: number;
  misc: number;
}

export interface AiPlanTotals {
  totalCostINR: number;
  breakdown: AiPlanTotalsBreakdown;
}

export interface AiTripPlanData {
  overview: AiPlanOverview;
  days: AiPlanDay[];
  totals: AiPlanTotals;
  budgetWarning?: string | null;
}

export interface TripPlanResponse {
  success: boolean;
  data: AiTripPlanData;
  timestamp: string;
}

export interface BudgetAnalysisResponse {
  analysis: string;
  timestamp: string;
}

export interface BookingRecommendationsResponse {
  recommendations: string;
  timestamp: string;
}

export interface EmergencyContactsGeneral {
  police: { number: string; note: string };
  ambulance: { number: string; note: string };
  fire: { number: string; note: string };
  womenHelpline: { number: string; note: string };
  touristHelpline: { number: string; note: string };
}

export interface EmergencyLocalHospital { name: string; phone: string; address: string; open24x7: boolean }
export interface EmergencyLocalStation { name: string; phone: string; address: string }

export interface EmergencyContactsData {
  general: EmergencyContactsGeneral;
  local: { primaryCity: string; nearestHospitals: EmergencyLocalHospital[]; nearestPoliceStations: EmergencyLocalStation[] };
  tips: string[];
}

class ApiService {
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async sendChatMessage(message: string, context?: string): Promise<ChatResponse> {
    return this.makeRequest<ChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, context }),
    });
  }

  async generateTripPlan(tripData: {
    from: string;
    to: string;
    startDate: string;
    endDate: string;
    budget: number;
    travelers: number;
    interests: string[];
    customDestinations?: string[];
    customActivities?: string[];
    activitiesPerDay?: number;
    tripStyle?: string;
  }): Promise<TripPlanResponse> {
    return this.makeRequest<TripPlanResponse>('/ai/plan-trip', {
      method: 'POST',
      body: JSON.stringify(tripData),
    });
  }

  async optimizeBudget(params: {
    plan: AiTripPlanData;
    targetAdjustmentINR: number;
    preference: 'reduce_cost' | 'upgrade';
  }): Promise<{ success: boolean; data: { updatedPlan: AiTripPlanData; changes: any[]; newTotals: AiPlanTotals }; timestamp: string }> {
    return this.makeRequest('/ai/optimize-budget', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async smartAdjust(params: {
    plan: AiTripPlanData;
    action: { type: 'reduce_cost' | 'add_activities'; amountINR?: number; theme?: string };
  }): Promise<{ success: boolean; data: { updatedPlan: AiTripPlanData; note: string }; timestamp: string }> {
    return this.makeRequest('/ai/smart-adjust', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async analyzeBudget(budgetData: {
    expenses: any[];
    totalBudget: number;
    destination: string;
    duration: number;
  }): Promise<BudgetAnalysisResponse> {
    return this.makeRequest<BudgetAnalysisResponse>('/ai/budget-analysis', {
      method: 'POST',
      body: JSON.stringify(budgetData),
    });
  }

  async getBookingRecommendations(bookingData: {
    from: string;
    to: string;
    date: string;
    type: 'flight' | 'train' | 'hotel';
    preferences: string;
  }): Promise<BookingRecommendationsResponse> {
    return this.makeRequest<BookingRecommendationsResponse>('/ai/booking-recommendations', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  }

  async getEmergencyContacts(params: { destination: string; stateOrCountry?: string }): Promise<{ success: boolean; data: EmergencyContactsData; timestamp: string }> {
    return this.makeRequest('/ai/emergency-contacts', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async checkHealth(): Promise<{ status: string; message: string }> {
    return this.makeRequest<{ status: string; message: string }>('/health');
  }
}

export const apiService = new ApiService();