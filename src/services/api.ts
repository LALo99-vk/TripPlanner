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

export interface TripPlanResponse {
  itinerary: string;
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
  }): Promise<TripPlanResponse> {
    return this.makeRequest<TripPlanResponse>('/ai/plan-trip', {
      method: 'POST',
      body: JSON.stringify(tripData),
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

  async checkHealth(): Promise<{ status: string; message: string }> {
    return this.makeRequest<{ status: string; message: string }>('/health');
  }
}

export const apiService = new ApiService();