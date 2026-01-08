import React, { useState } from 'react';
import Spline from '@splinetool/react-spline';

interface HomePageProps {
  onPageChange: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onPageChange }) => {
  const [splineLoaded, setSplineLoaded] = useState(false);
  const [splineError, setSplineError] = useState(false);

  const handleSplineLoad = () => {
    setSplineLoaded(true);
  };

  const handleSplineError = () => {
    setSplineError(true);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 3D Spline Background */}
      <div className="absolute inset-0 -z-10 spline-container">
        <Spline 
          scene="https://prod.spline.design/KzdhEaIv2crSYSDv/scene.splinecode"style={{ width: '100%', height: '100%' }}
          onLoad={handleSplineLoad}
          onError={handleSplineError}
        />
      </div>

      {/* Fallback background in case Spline fails */}
      {splineError && (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 -z-10" />
      )}

      {/* Gradient overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-black/30 to-black/60 -z-10" />

      {/* Loading indicator */}
      {!splineLoaded && !splineError && (
        <div className="absolute inset-0 flex items-center justify-center -z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/30"></div>
        </div>
      )}

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center px-4 lg:px-6">
        <div className="w-full max-w-4xl mx-auto text-center text-white">
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

          <div className="flex flex-col sm:flex-row gap-4 justify-center px-4 sm:px-0">
            <button
              onClick={() => onPageChange('plan')}
              className="premium-button-primary text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 touch-manipulation touch-target active-scale"
            >
              Start Planning
            </button>
            <button
              onClick={() => onPageChange('chat')}
              className="premium-button-secondary text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 touch-manipulation touch-target active-scale"
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
