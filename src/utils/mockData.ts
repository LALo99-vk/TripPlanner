import { FlightBooking, TrainBooking, HotelBooking, ChatMessage, Expense } from '../types';

export const MOCK_FLIGHTS: FlightBooking[] = [
  {
    id: '1',
    from: 'Mumbai',
    to: 'Goa',
    date: '2025-02-15',
    time: '08:30',
    airline: 'IndiGo',
    price: 4500,
    duration: '1h 15m',
    status: 'available'
  },
  {
    id: '2',
    from: 'Delhi',
    to: 'Manali',
    date: '2025-02-20',
    time: '06:45',
    airline: 'SpiceJet',
    price: 6800,
    duration: '2h 30m',
    status: 'available'
  },
  {
    id: '3',
    from: 'Bangalore',
    to: 'Chennai',
    date: '2025-02-18',
    time: '14:20',
    airline: 'Air India',
    price: 3200,
    duration: '1h 00m',
    status: 'available'
  }
];

export const MOCK_TRAINS: TrainBooking[] = [
  {
    id: '1',
    from: 'Mumbai',
    to: 'Goa',
    date: '2025-02-15',
    time: '22:00',
    trainName: 'Mandovi Express',
    trainNumber: '10103',
    class: '2A',
    price: 1200,
    duration: '11h 45m',
    status: 'available'
  },
  {
    id: '2',
    from: 'Delhi',
    to: 'Jaipur',
    date: '2025-02-20',
    time: '06:05',
    trainName: 'Shatabdi Express',
    trainNumber: '12015',
    class: 'CC',
    price: 850,
    duration: '4h 30m',
    status: 'available'
  },
  {
    id: '3',
    from: 'Chennai',
    to: 'Bangalore',
    date: '2025-02-18',
    time: '20:30',
    trainName: 'Lalbagh Express',
    trainNumber: '12607',
    class: '3A',
    price: 650,
    duration: '6h 00m',
    status: 'available'
  }
];

export const MOCK_HOTELS: HotelBooking[] = [
  {
    id: '1',
    name: 'Taj Resort & Spa Goa',
    location: 'Candolim, Goa',
    checkIn: '2025-02-15',
    checkOut: '2025-02-18',
    roomType: 'Deluxe Sea View',
    price: 8500,
    rating: 4.5,
    amenities: ['Pool', 'Spa', 'Beach Access', 'WiFi', 'Restaurant'],
    status: 'available'
  },
  {
    id: '2',
    name: 'OYO Premium Manali',
    location: 'Mall Road, Manali',
    checkIn: '2025-02-20',
    checkOut: '2025-02-23',
    roomType: 'Premium Room',
    price: 2800,
    rating: 4.0,
    amenities: ['WiFi', 'Heater', 'Mountain View', 'Restaurant'],
    status: 'available'
  },
  {
    id: '3',
    name: 'The Leela Palace Chennai',
    location: 'Adyar, Chennai',
    checkIn: '2025-02-18',
    checkOut: '2025-02-21',
    roomType: 'Grand Deluxe',
    price: 12000,
    rating: 4.8,
    amenities: ['Pool', 'Spa', 'Business Center', 'Multiple Restaurants', 'Valet'],
    status: 'available'
  }
];

export const SAMPLE_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    text: 'Hello! I\'m your AI travel assistant. How can I help you plan your perfect Indian getaway?',
    isUser: false,
    timestamp: new Date('2025-01-20T10:00:00'),
    intent: 'greeting'
  },
  {
    id: '2',
    text: 'I want to plan a beach trip from Mumbai under ₹15,000',
    isUser: true,
    timestamp: new Date('2025-01-20T10:01:00'),
    intent: 'trip_planning'
  },
  {
    id: '3',
    text: 'Perfect! I recommend Goa for a 3-day beach getaway. Here\'s a suggested itinerary:\n\n🏖️ Day 1: Arrival + Baga Beach sunset\n🏖️ Day 2: Water sports + North Goa exploration\n🏖️ Day 3: South Goa beaches + departure\n\nTotal estimated cost: ₹12,500 including accommodation, food, and activities. Would you like me to show detailed breakdown?',
    isUser: false,
    timestamp: new Date('2025-01-20T10:02:00'),
    intent: 'trip_suggestion'
  }
];

export const SAMPLE_EXPENSES: Expense[] = [
  {
    id: '1',
    category: 'Transport',
    amount: 4500,
    description: 'Flight tickets Mumbai to Goa',
    paidBy: 'user1',
    date: new Date('2025-01-15'),
    splitBetween: ['user1', 'user2']
  },
  {
    id: '2',
    category: 'Accommodation',
    amount: 6000,
    description: 'Beach resort for 2 nights',
    paidBy: 'user2',
    date: new Date('2025-01-16'),
    splitBetween: ['user1', 'user2']
  },
  {
    id: '3',
    category: 'Food',
    amount: 2800,
    description: 'Restaurants and beach shacks',
    paidBy: 'user1',
    date: new Date('2025-01-17'),
    splitBetween: ['user1', 'user2']
  }
];

export const AI_RESPONSES = {
  greeting: [
    "Namaste! I'm your AI travel companion. Ready to explore incredible India?",
    "Hello! I'm here to help you plan amazing trips across India. What's on your mind?",
    "Welcome to WanderWise! Let's create your perfect Indian adventure together."
  ],
  budget_help: [
    "I can help you optimize your travel budget! Share your destination and I'll suggest the best value options.",
    "Let me analyze your spending pattern and suggest ways to save money on your trip.",
    "Based on your preferences, here are some budget-friendly alternatives that don't compromise on experience."
  ],
  booking_help: [
    "I'll help you find the best deals! Let me search across flights, trains, and hotels for you.",
    "Would you like me to compare prices across different booking platforms?",
    "I can suggest the most economical travel routes and timing for your trip."
  ]
};