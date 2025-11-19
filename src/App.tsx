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

  // Handle URL parameters for join links and group pages
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const groupId = params.get('groupId');
    
    // Check for /group/{groupId} path pattern
    const pathMatch = window.location.pathname.match(/\/group\/([^/]+)/);
    const pathGroupId = pathMatch ? pathMatch[1] : null;
    
    if (page === 'group' || groupId || pathGroupId) {
      setCurrentPage('group');
    }
  }, []);

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

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let touching = false;
    const threshold = 50;
    const edge = 24;
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      touching = true;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!touching || window.innerWidth >= 1024) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (!sidebarOpen && startX <= edge && dx > threshold) {
          setSidebarOpen(true);
        } else if (sidebarOpen && dx < -threshold) {
          setSidebarOpen(false);
        }
      }
      touching = false;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart as any);
      window.removeEventListener('touchend', onTouchEnd as any);
    };
  }, [sidebarOpen]);

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