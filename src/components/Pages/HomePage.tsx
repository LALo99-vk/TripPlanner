import React from 'react';
import { 
  MapPin, 
  Ticket, 
  MessageCircle, 
  PiggyBank, 
  Users, 
  Radio,
  Sparkles,
  TrendingUp,
  Shield
} from 'lucide-react';

interface HomePageProps {
  onPageChange: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onPageChange }) => {
  const features = [
    {
      id: 'plan',
      title: 'Trip Planning',
      description: 'Create perfect itineraries based on your preferences',
      icon: MapPin,
      color: 'bg-blue-500',
      stats: '10K+ trips planned'
    },
    {
      id: 'booking',
      title: 'Smart Booking',
      description: 'Compare and book flights, trains & hotels at best prices',
      icon: Ticket,
      color: 'bg-green-500',
      stats: 'Save up to 40%'
    },
    {
      id: 'chat',
      title: 'Travel Assistant',
      description: 'Get instant travel advice and support 24/7',
      icon: MessageCircle,
      color: 'bg-purple-500',
      stats: '99% satisfaction'
    },
    {
      id: 'budget',
      title: 'Budget Planner',
      description: 'Track expenses and optimize your travel budget',
      icon: PiggyBank,
      color: 'bg-orange-500',
      stats: 'Average 25% savings'
    },
    {
      id: 'group',
      title: 'Group Travel',
      description: 'Plan and coordinate trips with friends & family',
      icon: Users,
      color: 'bg-red-500',
      stats: '5M+ travelers'
    },
    {
      id: 'walkie',
      title: 'Walkie-Talkie',
      description: 'Stay connected with your travel group anywhere',
      icon: Radio,
      color: 'bg-indigo-500',
      stats: 'Crystal clear audio'
    }
  ];

  const highlights = [
    { icon: Sparkles, text: 'AI-Powered Intelligence', subtext: 'Smart recommendations for every trip' },
    { icon: TrendingUp, text: 'Best Price Guarantee', subtext: 'We find the lowest prices available' },
    { icon: Shield, text: 'Secure & Trusted', subtext: '256-bit encryption for all transactions' }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* New Badge */}
          <div className="inline-flex items-center mb-8">
            <span className="accent-glow">New</span>
            <span className="ml-3 text-white/60 font-medium">Smarter way to travel</span>
          </div>
          
          <h1 className="hero-title mb-6">
            Want to <em className="text-orange-400">travel</em> faster
            <br />
            without <span className="text-red-400">extra tools?</span>
          </h1>
          
          <p className="hero-subtitle max-w-3xl mx-auto mb-12">
            Unify planning, booking, and experiences into one platform, saving
            time and helping your travel dreams scale effortlessly.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => onPageChange('plan')}
              className="premium-button-primary text-lg px-8 py-4"
            >
              Start Planning
            </button>
            <button
              onClick={() => onPageChange('chat')}
              className="premium-button-secondary text-lg px-8 py-4"
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-black/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">
              Everything You Need for Travel
            </h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              From planning to booking, WanderWise makes travel simple and enjoyable
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.id}
                  onClick={() => onPageChange(feature.id)}
                  className="premium-card rounded-2xl p-8 cursor-pointer hover:bg-white/10 transition-all duration-300 group"
                >
                  <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-white mb-4">
                    {feature.title}
                  </h3>
                  
                  <p className="text-white/60 mb-6 leading-relaxed">
                    {feature.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/40">
                      {feature.stats}
                    </span>
                    <span className="text-orange-400 font-semibold group-hover:translate-x-1 transition-transform">
                      Explore →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="py-16 bg-white/10 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {highlights.map((highlight, index) => {
              const Icon = highlight.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {highlight.text}
                  </h3>
                  <p className="text-gray-600">
                    {highlight.subtext}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-black/10 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto text-center premium-card rounded-3xl p-12">
          <h2 className="text-3xl font-bold text-white mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-white/60 mb-8">
            Join thousands of happy travelers who trust WanderWise for their Indian adventures
          </p>
          <button
            onClick={() => onPageChange('plan')}
            className="premium-button-primary text-lg px-8 py-4"
          >
            Start Planning Now
          </button>
        </div>
      </section>
    </div>
  );
};

export default HomePage;