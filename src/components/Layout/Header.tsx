import React from 'react';
import { Menu, MapPin } from 'lucide-react';

interface HeaderProps {
  onMenuToggle: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  return (
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50 w-full">
      <div className="w-full max-w-none px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <button
              onClick={onMenuToggle}
              className="p-2 rounded-md text-white/60 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="flex-shrink-0 flex items-center ml-2 lg:ml-0">
              <MapPin className="h-8 w-8 text-white" />
              <div className="ml-2">
                <h1 className="text-2xl font-bold text-white">
                  WanderWise
                </h1>
                <p className="text-xs text-white/60 -mt-1">Travel Smart</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button className="premium-button-primary text-sm">
              Get Started
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;