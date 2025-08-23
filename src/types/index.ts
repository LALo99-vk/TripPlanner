export interface User {
  id: string;
  email: string;
  phone: string;
  profile: {
    name: string;
    preferences: TravelInterest[];
    emergencyContact: string;
  };
  trips: string[];
  groups: string[];
}

export type TravelInterest = 'beaches' | 'hills' | 'culture' | 'food' | 'spiritual' | 'wildlife';

export interface Trip {
  id: string;
  title: string;
  destination: {
    from: string;
    to: string;
    state: string;
  };
  dates: {
    start: Date;
    end: Date;
  };
  budget: {
    total: number;
    spent: number;
    categories: ExpenseCategory[];
  };
  itinerary: DayPlan[];
  participants: string[];
  bookings: BookingDetails;
  aiSuggestions: string[];
}

export interface DayPlan {
  day: number;
  date: string;
  activities: Activity[];
  accommodation?: string;
  estimatedCost: number;
}

export interface Activity {
  id: string;
  name: string;
  time: string;
  duration: string;
  cost: number;
  description: string;
  category: TravelInterest;
}

export interface ExpenseCategory {
  category: string;
  budgeted: number;
  spent: number;
  color: string;
}

export interface BookingDetails {
  flights: FlightBooking[];
  trains: TrainBooking[];
  hotels: HotelBooking[];
}

export interface FlightBooking {
  id: string;
  from: string;
  to: string;
  date: string;
  time: string;
  airline: string;
  price: number;
  duration: string;
  status: 'available' | 'booked' | 'cancelled';
}

export interface TrainBooking {
  id: string;
  from: string;
  to: string;
  date: string;
  time: string;
  trainName: string;
  trainNumber: string;
  class: string;
  price: number;
  duration: string;
  status: 'available' | 'booked' | 'cancelled';
}

export interface HotelBooking {
  id: string;
  name: string;
  location: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  price: number;
  rating: number;
  amenities: string[];
  status: 'available' | 'booked' | 'cancelled';
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  intent?: string;
}

export interface GroupTrip {
  id: string;
  name: string;
  destination: string;
  dates: { start: Date; end: Date };
  members: User[];
  sharedBudget: number;
  expenses: Expense[];
  chat: ChatMessage[];
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  paidBy: string;
  date: Date;
  splitBetween: string[];
}

export interface VoiceMessage {
  id: string;
  from: string;
  to: string;
  audioUrl: string;
  duration: number;
  timestamp: Date;
  isPlayed: boolean;
}