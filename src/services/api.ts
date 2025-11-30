// Re-export shared API service and types
export { apiService } from '../../../shared/services/api';
export type { 
  ApiResponse, 
  ChatResponse, 
  TripPlanResponse, 
  BudgetAnalysisResponse, 
  BookingRecommendationsResponse,
  EmergencyContactsData,
  AiTripPlanData,
  AiPlanTotals,
  AiPlanOverview,
  AiPlanDay,
  AiPlanSlotItem
} from '../../../shared/types';