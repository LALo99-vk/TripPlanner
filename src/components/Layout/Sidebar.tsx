import React from 'react';
import { 
  Home, 
  MapPin, 
  Ticket, 
  MessageCircle, 
  PiggyBank, 
  Users, 
  Radio,
  AlertTriangle,
  X,
  Compass,
  LogOut
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const navigationItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'plan', label: 'Plan My Trip', icon: MapPin },
  { id: 'booking', label: 'Book Tickets', icon: Ticket },
  { id: 'chat', label: 'AI Assistant', icon: MessageCircle },
  { id: 'budget', label: 'Budget Planner', icon: PiggyBank },
  { id: 'group', label: 'Group Travel', icon: Users },
  { id: 'walkie', label: 'Walkie-Talkie', icon: Radio },
  { id: 'discover', label: 'Discover', icon: Compass },
  { id: 'emergency', label: 'Emergency', icon: AlertTriangle }
];

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, isOpen, onClose }) => {
  const { user, signInWithGoogle, logout } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-black/40 backdrop-blur-md border-r border-white/10 transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/10 lg:hidden">
          <span className="text-lg font-semibold">Menu</span>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-6 lg:mt-8">
          <div className="px-4 space-y-2">
            {/* Authentication Section */}
            {!user ? (
              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center px-4 py-3 text-sm font-medium rounded-lg premium-button-primary mb-4"
              >
                <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
                  <path fill="#0a0a0a" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#0a0a0a" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#0a0a0a" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#0a0a0a" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>
            ) : (
              <div className="mb-4 p-3 premium-card rounded-lg">
                <div className="flex items-center space-x-3 mb-2">
                  <img 
                    src={user.photoURL || '/default-avatar.png'} 
                    alt={user.displayName || 'User'} 
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user.displayName || 'User'}
                    </p>
                    <p className="text-xs text-white/60 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center px-3 py-2 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </button>
              </div>
            )}

            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onPageChange(item.id);
                    onClose(); // Close mobile menu after selection
                  }}
                  className={`
                    w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200
                    ${isActive
                      ? 'bg-white text-black'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <div className="premium-card p-4 rounded-lg">
            <p className="text-sm font-medium text-white">WanderWise</p>
            <p className="text-xs text-white/60 mt-1">
              Social Travel Platform
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;