import React from 'react';
import Spline from '@splinetool/react-spline';

interface HomePageProps {
  onPageChange: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onPageChange }) => {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 3D Spline Background */}
      <div className="absolute inset-0 -z-10">
        <Spline scene="https://prod.spline.design/2xEIjg1JL1V3Ucgb/scene.splinecode" />
      </div>

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/40 -z-10" />

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center text-white">
          <div className="inline-flex items-center mb-8">
            <span className="accent-glow">New</span>
            <span className="ml-3 text-white/60 font-medium">
              Smarter way to travel
            </span>
          </div>

          <h1 className="hero-title mb-6 text-5xl sm:text-6xl font-bold leading-tight">
            Want to <em className="text-orange-400">travel</em> faster
            <br />
            without <span className="text-red-400">extra tools?</span>
          </h1>

          <p className="hero-subtitle max-w-3xl mx-auto mb-12 text-lg text-white/80">
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
    </div>
  );
};

export default HomePage;
