import { getAuthenticatedSupabaseClient } from '../config/supabase';
import { AiTripPlanData } from './api';

// =====================================================
// TYPES
// =====================================================

export interface TravelAdvisor {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  bio?: string;
  city: string;
  state?: string;
  country: string;
  specialties: string[];
  languages: string[];
  isVerified: boolean;
  rating: number;
  totalReviews: number;
  totalPlansCreated: number;
  totalPlansEnhanced: number;
  responseTimeHours: number;
  pricePerPlan: number;
  pricePerEnhancement: number;
  isAvailable: boolean;
  sampleEnhancements?: { type: string; text: string }[];
  createdAt: string;
}

export interface AdvisorPlanRequest {
  id: string;
  userId: string;
  advisorId: string;
  requestType: 'new_plan' | 'enhance_plan';
  tripDetails?: {
    from: string;
    to: string;
    startDate: string;
    endDate: string;
    budget: number;
    travelers: number;
    interests: string[];
    tripStyle?: string;
    specialRequests?: string;
  };
  originalPlanId?: string;
  originalPlanData?: AiTripPlanData;
  specialRequests?: string;
  preferredExperiences?: string[];
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
  quotedPrice?: number;
  paid: boolean;
  chatMessages?: { sender: string; message: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

export interface AdvisorPlan {
  id: string;
  requestId: string;
  advisorId: string;
  userId: string;
  planType: 'advisor_created' | 'advisor_enhanced';
  planData: AiTripPlanData;
  originalPlanData?: AiTripPlanData;
  enhancements?: {
    additions: string[];
    modifications: string[];
    removals: string[];
    notes: string[];
  };
  advisorNotes?: string;
  localInsights?: string[];
  hiddenGems?: string[];
  culturalTips?: string[];
  status: 'draft' | 'submitted' | 'accepted' | 'revision_requested';
  createdAt: string;
  submittedAt?: string;
  acceptedAt?: string;
}

export interface AdvisorReview {
  id: string;
  advisorId: string;
  userId: string;
  requestId: string;
  rating: number;
  reviewText?: string;
  knowledgeRating?: number;
  responsivenessRating?: number;
  valueRating?: number;
  createdAt: string;
}

// =====================================================
// ADVISOR FUNCTIONS
// =====================================================

/**
 * Get all verified advisors
 */
export async function getVerifiedAdvisors(): Promise<TravelAdvisor[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('travel_advisors')
    .select('*')
    .eq('is_verified', true)
    .eq('is_available', true)
    .order('rating', { ascending: false });

  if (error) {
    console.error('Error fetching advisors:', error);
    return [];
  }

  return (data || []).map(mapAdvisorFromDb);
}

/**
 * Get advisors by destination city
 */
export async function getAdvisorsByCity(city: string): Promise<TravelAdvisor[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('travel_advisors')
    .select('*')
    .eq('is_verified', true)
    .eq('is_available', true)
    .ilike('city', `%${city}%`)
    .order('rating', { ascending: false });

  if (error) {
    console.error('Error fetching advisors by city:', error);
    return [];
  }

  return (data || []).map(mapAdvisorFromDb);
}

/**
 * Get a single advisor by ID
 */
export async function getAdvisorById(advisorId: string): Promise<TravelAdvisor | null> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('travel_advisors')
    .select('*')
    .eq('id', advisorId)
    .single();

  if (error) {
    console.error('Error fetching advisor:', error);
    return null;
  }

  return mapAdvisorFromDb(data);
}

/**
 * Search advisors by city, specialty, or language
 */
export async function searchAdvisors(params: {
  city?: string;
  specialty?: string;
  language?: string;
  minRating?: number;
}): Promise<TravelAdvisor[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  let query = supabase
    .from('travel_advisors')
    .select('*')
    .eq('is_verified', true)
    .eq('is_available', true);

  if (params.city) {
    query = query.ilike('city', `%${params.city}%`);
  }
  if (params.specialty) {
    query = query.contains('specialties', [params.specialty]);
  }
  if (params.language) {
    query = query.contains('languages', [params.language]);
  }
  if (params.minRating) {
    query = query.gte('rating', params.minRating);
  }

  const { data, error } = await query.order('rating', { ascending: false });

  if (error) {
    console.error('Error searching advisors:', error);
    return [];
  }

  return (data || []).map(mapAdvisorFromDb);
}

// =====================================================
// PLAN REQUEST FUNCTIONS
// =====================================================

/**
 * Create a new plan request (for both new plans and enhancements)
 */
export async function createPlanRequest(input: {
  userId: string;
  advisorId: string;
  requestType: 'new_plan' | 'enhance_plan';
  tripDetails?: AdvisorPlanRequest['tripDetails'];
  originalPlanId?: string;
  originalPlanData?: AiTripPlanData;
  specialRequests?: string;
  preferredExperiences?: string[];
}): Promise<string | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('advisor_plan_requests')
    .insert({
      user_id: input.userId,
      advisor_id: input.advisorId,
      request_type: input.requestType,
      trip_details: input.tripDetails,
      original_plan_id: input.originalPlanId,
      original_plan_data: input.originalPlanData,
      special_requests: input.specialRequests,
      preferred_experiences: input.preferredExperiences,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating plan request:', error);
    return null;
  }

  return data.id;
}

/**
 * Get user's plan requests
 */
export async function getUserPlanRequests(userId: string): Promise<AdvisorPlanRequest[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('advisor_plan_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user requests:', error);
    return [];
  }

  return (data || []).map(mapRequestFromDb);
}

/**
 * Get a single request by ID
 */
export async function getPlanRequestById(requestId: string): Promise<AdvisorPlanRequest | null> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('advisor_plan_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error) {
    console.error('Error fetching request:', error);
    return null;
  }

  return mapRequestFromDb(data);
}

/**
 * Update request status
 */
export async function updateRequestStatus(
  requestId: string, 
  status: AdvisorPlanRequest['status'],
  additionalData?: { quotedPrice?: number; acceptedAt?: string; completedAt?: string }
): Promise<boolean> {
  const supabase = await getAuthenticatedSupabaseClient();

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (additionalData?.quotedPrice) updateData.quoted_price = additionalData.quotedPrice;
  if (additionalData?.acceptedAt) updateData.accepted_at = additionalData.acceptedAt;
  if (additionalData?.completedAt) updateData.completed_at = additionalData.completedAt;

  const { error } = await supabase
    .from('advisor_plan_requests')
    .update(updateData)
    .eq('id', requestId);

  if (error) {
    console.error('Error updating request status:', error);
    return false;
  }

  return true;
}

/**
 * Add chat message to request
 */
export async function addChatMessage(
  requestId: string,
  sender: string,
  message: string
): Promise<boolean> {
  const supabase = await getAuthenticatedSupabaseClient();

  // First, get current messages
  const { data: current } = await supabase
    .from('advisor_plan_requests')
    .select('chat_messages')
    .eq('id', requestId)
    .single();

  const messages = (current?.chat_messages as any[]) || [];
  messages.push({
    sender,
    message,
    timestamp: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('advisor_plan_requests')
    .update({
      chat_messages: messages,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) {
    console.error('Error adding chat message:', error);
    return false;
  }

  return true;
}

// =====================================================
// ADVISOR PLAN FUNCTIONS
// =====================================================

/**
 * Create/submit advisor plan
 */
export async function createAdvisorPlan(input: {
  requestId: string;
  advisorId: string;
  userId: string;
  planType: 'advisor_created' | 'advisor_enhanced';
  planData: AiTripPlanData;
  originalPlanData?: AiTripPlanData;
  enhancements?: AdvisorPlan['enhancements'];
  advisorNotes?: string;
  localInsights?: string[];
  hiddenGems?: string[];
  culturalTips?: string[];
}): Promise<string | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('advisor_plans')
    .insert({
      request_id: input.requestId,
      advisor_id: input.advisorId,
      user_id: input.userId,
      plan_type: input.planType,
      plan_data: input.planData,
      original_plan_data: input.originalPlanData,
      enhancements: input.enhancements,
      advisor_notes: input.advisorNotes,
      local_insights: input.localInsights,
      hidden_gems: input.hiddenGems,
      cultural_tips: input.culturalTips,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating advisor plan:', error);
    return null;
  }

  // Update request status to completed
  await updateRequestStatus(input.requestId, 'completed', {
    completedAt: new Date().toISOString(),
  });

  return data.id;
}

/**
 * Get advisor plan by request ID
 */
export async function getAdvisorPlanByRequest(requestId: string): Promise<AdvisorPlan | null> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('advisor_plans')
    .select('*')
    .eq('request_id', requestId)
    .single();

  if (error) {
    console.error('Error fetching advisor plan:', error);
    return null;
  }

  return mapAdvisorPlanFromDb(data);
}

/**
 * Get user's advisor plans
 */
export async function getUserAdvisorPlans(userId: string): Promise<AdvisorPlan[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('advisor_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user advisor plans:', error);
    return [];
  }

  return (data || []).map(mapAdvisorPlanFromDb);
}

/**
 * Accept advisor plan (user accepts the plan)
 */
export async function acceptAdvisorPlan(planId: string): Promise<boolean> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { error } = await supabase
    .from('advisor_plans')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', planId);

  if (error) {
    console.error('Error accepting advisor plan:', error);
    return false;
  }

  return true;
}

// =====================================================
// REVIEW FUNCTIONS
// =====================================================

/**
 * Create advisor review
 */
export async function createAdvisorReview(input: {
  advisorId: string;
  userId: string;
  requestId: string;
  rating: number;
  reviewText?: string;
  knowledgeRating?: number;
  responsivenessRating?: number;
  valueRating?: number;
}): Promise<boolean> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { error } = await supabase
    .from('advisor_reviews')
    .insert({
      advisor_id: input.advisorId,
      user_id: input.userId,
      request_id: input.requestId,
      rating: input.rating,
      review_text: input.reviewText,
      knowledge_rating: input.knowledgeRating,
      responsiveness_rating: input.responsivenessRating,
      value_rating: input.valueRating,
    });

  if (error) {
    console.error('Error creating review:', error);
    return false;
  }

  // Update advisor's rating
  const { data: reviews } = await supabase
    .from('advisor_reviews')
    .select('rating')
    .eq('advisor_id', input.advisorId);

  if (reviews && reviews.length > 0) {
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await supabase
      .from('travel_advisors')
      .update({
        rating: Math.round(avgRating * 100) / 100,
        total_reviews: reviews.length,
      })
      .eq('id', input.advisorId);
  }

  return true;
}

/**
 * Get advisor reviews
 */
export async function getAdvisorReviews(advisorId: string): Promise<AdvisorReview[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('advisor_reviews')
    .select('*')
    .eq('advisor_id', advisorId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching reviews:', error);
    return [];
  }

  return (data || []).map(mapReviewFromDb);
}

// =====================================================
// HELPER FUNCTIONS (Mapping DB to Types)
// =====================================================

function mapAdvisorFromDb(data: any): TravelAdvisor {
  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    photoUrl: data.photo_url,
    bio: data.bio,
    city: data.city,
    state: data.state,
    country: data.country,
    specialties: data.specialties || [],
    languages: data.languages || [],
    isVerified: data.is_verified,
    rating: parseFloat(data.rating) || 0,
    totalReviews: data.total_reviews || 0,
    totalPlansCreated: data.total_plans_created || 0,
    totalPlansEnhanced: data.total_plans_enhanced || 0,
    responseTimeHours: data.response_time_hours || 24,
    pricePerPlan: data.price_per_plan || 500,
    pricePerEnhancement: data.price_per_enhancement || 300,
    isAvailable: data.is_available,
    sampleEnhancements: data.sample_enhancements || [],
    createdAt: data.created_at,
  };
}

function mapRequestFromDb(data: any): AdvisorPlanRequest {
  return {
    id: data.id,
    userId: data.user_id,
    advisorId: data.advisor_id,
    requestType: data.request_type,
    tripDetails: data.trip_details,
    originalPlanId: data.original_plan_id,
    originalPlanData: data.original_plan_data,
    specialRequests: data.special_requests,
    preferredExperiences: data.preferred_experiences || [],
    status: data.status,
    quotedPrice: data.quoted_price,
    paid: data.paid,
    chatMessages: data.chat_messages || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    acceptedAt: data.accepted_at,
    completedAt: data.completed_at,
  };
}

function mapAdvisorPlanFromDb(data: any): AdvisorPlan {
  return {
    id: data.id,
    requestId: data.request_id,
    advisorId: data.advisor_id,
    userId: data.user_id,
    planType: data.plan_type,
    planData: data.plan_data,
    originalPlanData: data.original_plan_data,
    enhancements: data.enhancements,
    advisorNotes: data.advisor_notes,
    localInsights: data.local_insights || [],
    hiddenGems: data.hidden_gems || [],
    culturalTips: data.cultural_tips || [],
    status: data.status,
    createdAt: data.created_at,
    submittedAt: data.submitted_at,
    acceptedAt: data.accepted_at,
  };
}

function mapReviewFromDb(data: any): AdvisorReview {
  return {
    id: data.id,
    advisorId: data.advisor_id,
    userId: data.user_id,
    requestId: data.request_id,
    rating: data.rating,
    reviewText: data.review_text,
    knowledgeRating: data.knowledge_rating,
    responsivenessRating: data.responsiveness_rating,
    valueRating: data.value_rating,
    createdAt: data.created_at,
  };
}

// =====================================================
// MOCK DATA FOR PROTOTYPE (When DB not set up)
// =====================================================

export const MOCK_ADVISORS: TravelAdvisor[] = [
  {
    id: 'mock-1',
    userId: 'demo-advisor-1',
    name: 'Rahul Sharma',
    email: 'rahul.advisor@demo.com',
    phone: '+91 98765 43210',
    photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
    bio: 'Born and raised in Chennai. I know every hidden street food stall, secret beach, and local hangout. 5+ years helping travelers discover the real Chennai beyond tourist spots.',
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    specialties: ['food', 'culture', 'history', 'local_experiences'],
    languages: ['English', 'Tamil', 'Hindi'],
    isVerified: true,
    rating: 4.8,
    totalReviews: 47,
    totalPlansCreated: 89,
    totalPlansEnhanced: 156,
    responseTimeHours: 12,
    pricePerPlan: 500,
    pricePerEnhancement: 300,
    isAvailable: true,
    sampleEnhancements: [
      { type: 'hidden_gem', text: 'Added Kalathi Beach - a pristine, untouched beach 30km from the city, perfect for sunset' },
      { type: 'local_food', text: "Replaced generic restaurant with Mylapore Dosa Corner - my family's favorite for 20 years" },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-2',
    userId: 'demo-advisor-2',
    name: 'Priya Menon',
    email: 'priya.advisor@demo.com',
    phone: '+91 87654 32109',
    photoUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
    bio: 'Goa native with deep roots in the local community. I specialize in off-the-beaten-path experiences, authentic Goan cuisine, and cultural immersion beyond the beaches.',
    city: 'Goa',
    state: 'Goa',
    country: 'India',
    specialties: ['beaches', 'nightlife', 'food', 'adventure', 'culture'],
    languages: ['English', 'Konkani', 'Hindi', 'Portuguese'],
    isVerified: true,
    rating: 4.9,
    totalReviews: 63,
    totalPlansCreated: 112,
    totalPlansEnhanced: 89,
    responseTimeHours: 8,
    pricePerPlan: 600,
    pricePerEnhancement: 350,
    isAvailable: true,
    sampleEnhancements: [
      { type: 'cultural', text: 'Added visit to 400-year-old ancestral home converted to heritage stay' },
      { type: 'local_food', text: "Included authentic fish thali at my aunt's house restaurant" },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-3',
    userId: 'demo-advisor-3',
    name: 'Amit Patel',
    email: 'amit.advisor@demo.com',
    phone: '+91 76543 21098',
    photoUrl: 'https://randomuser.me/api/portraits/men/67.jpg',
    bio: 'Jaipur local and certified tour guide. Expert in Rajasthani history, architecture, and royal heritage. I make history come alive with stories passed down through generations.',
    city: 'Jaipur',
    state: 'Rajasthan',
    country: 'India',
    specialties: ['history', 'culture', 'architecture', 'photography', 'shopping'],
    languages: ['English', 'Hindi', 'Rajasthani'],
    isVerified: true,
    rating: 4.7,
    totalReviews: 38,
    totalPlansCreated: 67,
    totalPlansEnhanced: 45,
    responseTimeHours: 24,
    pricePerPlan: 450,
    pricePerEnhancement: 250,
    isAvailable: true,
    sampleEnhancements: [
      { type: 'insider_tip', text: 'Best time to visit Amber Fort is 6:30 AM - avoid crowds and get golden hour photos' },
      { type: 'hidden_gem', text: 'Added Panna Meena Ka Kund - stunning stepwell most tourists miss' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-4',
    userId: 'demo-advisor-4',
    name: 'Sneha Reddy',
    email: 'sneha.advisor@demo.com',
    phone: '+91 65432 10987',
    photoUrl: 'https://randomuser.me/api/portraits/women/28.jpg',
    bio: 'Hyderabadi foodie and culture enthusiast. From secret biryani spots to hidden Nizam-era monuments, I help travelers experience the authentic soul of Hyderabad.',
    city: 'Hyderabad',
    state: 'Telangana',
    country: 'India',
    specialties: ['food', 'history', 'shopping', 'nightlife'],
    languages: ['English', 'Telugu', 'Hindi', 'Urdu'],
    isVerified: true,
    rating: 4.6,
    totalReviews: 29,
    totalPlansCreated: 45,
    totalPlansEnhanced: 67,
    responseTimeHours: 18,
    pricePerPlan: 400,
    pricePerEnhancement: 250,
    isAvailable: true,
    sampleEnhancements: [
      { type: 'local_food', text: 'Replaced Paradise Biryani with Shadab - where locals actually eat' },
      { type: 'hidden_gem', text: 'Added Paigah Tombs - breathtaking architecture, zero crowds' },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'mock-5',
    userId: 'demo-advisor-5',
    name: 'Vikram Singh',
    email: 'vikram.advisor@demo.com',
    phone: '+91 54321 09876',
    photoUrl: 'https://randomuser.me/api/portraits/men/45.jpg',
    bio: 'Adventure enthusiast from Manali. Expert in trekking, camping, and off-road experiences. I know the Himalayas like the back of my hand - every trail, every view, every hidden valley.',
    city: 'Manali',
    state: 'Himachal Pradesh',
    country: 'India',
    specialties: ['adventure', 'trekking', 'nature', 'photography', 'camping'],
    languages: ['English', 'Hindi', 'Pahadi'],
    isVerified: true,
    rating: 4.9,
    totalReviews: 52,
    totalPlansCreated: 78,
    totalPlansEnhanced: 34,
    responseTimeHours: 6,
    pricePerPlan: 700,
    pricePerEnhancement: 400,
    isAvailable: true,
    sampleEnhancements: [
      { type: 'adventure', text: 'Added secret waterfall trek - 2 hour hike, stunning views, no tourists' },
      { type: 'insider_tip', text: 'Best camping spot with Milky Way views - my personal favorite' },
    ],
    createdAt: new Date().toISOString(),
  },
];

/**
 * Get mock advisors for prototype (use when DB not available)
 */
export function getMockAdvisors(): TravelAdvisor[] {
  return MOCK_ADVISORS;
}

/**
 * Get mock advisors by city
 */
export function getMockAdvisorsByCity(city: string): TravelAdvisor[] {
  return MOCK_ADVISORS.filter(a => 
    a.city.toLowerCase().includes(city.toLowerCase())
  );
}

/**
 * Get mock advisor by ID
 */
export function getMockAdvisorById(id: string): TravelAdvisor | undefined {
  return MOCK_ADVISORS.find(a => a.id === id);
}
