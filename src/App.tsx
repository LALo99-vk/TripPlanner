import React, { useState } from 'react';
import Header from './components/Layout/Header';
import Sidebar from './components/Layout/Sidebar';
import { useEffect } from 'react';
import { auth } from './config/firebase';
import { getLatestUserPlan } from './services/planRepository';
import { planStore } from './services/planStore';
import HomePage from './components/Pages/HomePage';
import TripPlannerPage from './components/Pages/TripPlannerPage';
import YourPlanPage from './components/Pages/YourPlanPage';
import BookingPage from './components/Pages/BookingPage';
import ChatPage from './components/Pages/ChatPage';
import BudgetPage from './components/Pages/BudgetPage';
import GroupPage from './components/Pages/GroupPage';
import WalkieTalkiePage from './components/Pages/WalkieTalkiePage';
import EmergencyPage from './components/Pages/EmergencyPage';
import DiscoverPage from './components/Pages/DiscoverPage';
import ProfilePage from './components/Pages/ProfilePage';

type PageType = 'home' | 'plan' | 'yourplan' | 'booking' | 'chat' | 'budget' | 'group' | 'walkie' | 'emergency' | 'discover' | 'profile';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  React.useEffect(() => {
    const handler = (e: any) => {
      if (e?.detail?.page) setCurrentPage(e.detail.page);
    };
    window.addEventListener('navigate', handler as any);
    return () => window.removeEventListener('navigate', handler as any);
  }, []);

  // On auth ready, load latest plan for the user into planStore to provide context across pages
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        try {
          const latest = await getLatestUserPlan(u.uid);
          if (latest?.plan) {
            planStore.setPlan(latest.plan);
          }
        } catch (e) {
          console.error('Failed to load latest plan:', e);
        }
      }
    });
    return () => unsub();
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage onPageChange={setCurrentPage} />;
      case 'plan':
        return <TripPlannerPage />;
      case 'yourplan':
        return <YourPlanPage />;
      case 'booking':
        return <BookingPage />;
      case 'chat':
        return <ChatPage />;
      case 'budget':
        return <BudgetPage />;
      case 'group':
        return <GroupPage />;
      case 'walkie':
        return <WalkieTalkiePage />;
      case 'emergency':
        return <EmergencyPage />;
      case 'discover':
        return <DiscoverPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <HomePage onPageChange={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen app-container flex">
      <Sidebar
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col lg:ml-64 min-h-screen">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        
        <main className="flex-1">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;