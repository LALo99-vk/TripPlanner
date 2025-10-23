export const INDIAN_CITIES = [
  { name: 'Mumbai', state: 'Maharashtra' },
  { name: 'Delhi', state: 'Delhi' },
  { name: 'Bangalore', state: 'Karnataka' },
  { name: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Kolkata', state: 'West Bengal' },
  { name: 'Hyderabad', state: 'Telangana' },
  { name: 'Pune', state: 'Maharashtra' },
  { name: 'Ahmedabad', state: 'Gujarat' },
  { name: 'Jaipur', state: 'Rajasthan' },
  { name: 'Kochi', state: 'Kerala' },
  { name: 'Goa', state: 'Goa' },
  { name: 'Udaipur', state: 'Rajasthan' },
  { name: 'Varanasi', state: 'Uttar Pradesh' },
  { name: 'Rishikesh', state: 'Uttarakhand' },
  { name: 'Manali', state: 'Himachal Pradesh' },
  { name: 'Shimla', state: 'Himachal Pradesh' },
  { name: 'Darjeeling', state: 'West Bengal' },
  { name: 'Agra', state: 'Uttar Pradesh' },
  { name: 'Mysore', state: 'Karnataka' },
  { name: 'Ooty', state: 'Tamil Nadu' }
];

export const TRAVEL_INTERESTS = [
  { id: 'beaches', label: '🏖️ Beaches', color: 'bg-blue-500' },
  { id: 'hills', label: '🏔️ Hills', color: 'bg-green-500' },
  { id: 'culture', label: '🏛️ Culture', color: 'bg-purple-500' },
  { id: 'food', label: '🍛 Food', color: 'bg-orange-500' },
  { id: 'spiritual', label: '🕉️ Spiritual', color: 'bg-yellow-500' },
  { id: 'wildlife', label: '🦅 Wildlife', color: 'bg-emerald-500' }
] as const;


export const COLORS = {
  saffron: '#FF9933',
  white: '#FFFFFF',
  green: '#138808',
  blue: '#000080',
  gradientPrimary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  gradientIndia: 'linear-gradient(135deg, #FF9933 0%, #FFFFFF 50%, #138808 100%)'
};

export const EMERGENCY_NUMBERS = [
  { name: 'Police', number: '100', icon: '🚔' },
  { name: 'Fire', number: '101', icon: '🚒' },
  { name: 'Ambulance', number: '102', icon: '🚑' },
  { name: 'Tourist Helpline', number: '1363', icon: '🗺️' },
  { name: 'Women Helpline', number: '181', icon: '👩' },
  { name: 'Railway Enquiry', number: '139', icon: '🚂' }
];

export const SAMPLE_ITINERARY = {
  goa: {
    title: "Goa Beach Paradise - 4 Days",
    days: [
      {
        day: 1,
        date: "Day 1",
        activities: [
          {
            id: "1",
            name: "Arrival & Check-in",
            time: "12:00 PM",
            duration: "2 hours",
            cost: 3000,
            description: "Check into beachside hotel, freshen up",
            category: "beaches" as const
          },
          {
            id: "2", 
            name: "Baga Beach Sunset",
            time: "5:00 PM",
            duration: "3 hours",
            cost: 1000,
            description: "Enjoy sunset, beach activities, dinner at beach shack",
            category: "beaches" as const
          }
        ],
        accommodation: "Beach Resort Goa",
        estimatedCost: 4000
      }
    ]
  }
};