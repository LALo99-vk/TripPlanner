import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AuthPage from '../Auth/AuthPage';
import TripDashboard from '../Group/TripDashboard';
import TripPlanningPage from '../Group/TripPlanningPage';
import ShareExperienceModal from '../Group/ShareExperienceModal';
import { planStore } from '../../services/planStore';
import { useEffect } from 'react';
import { listUserPlans } from '../../services/planRepository';
import { db } from '../../config/firebase';

const GroupPage: React.FC = () => {
  const { user, loading } = useAuth();
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedTripForShare, setSelectedTripForShare] = useState<{
    id: string;
    name: string;
    destination: string;
  } | null>(null);
  const [latestPlanName, setLatestPlanName] = useState<string | null>(null);
  const [pastPlansCount, setPastPlansCount] = useState<number>(0);

  useEffect(() => {
    const plan = planStore.getPlan();
    if (plan) {
      setLatestPlanName(`${plan.overview.to} (${plan.overview.durationDays}D)`);
    }
  }, []);

  useEffect(() => {
    const fetchCount = async () => {
      if (!user) return;
      try {
        const plans = await listUserPlans(user.uid);
        setPastPlansCount(plans.length);
      } catch (e) {
        // ignore count errors
      }
    };
    fetchCount();
  }, [user]);

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show authentication page if user is not logged in
  if (!user) {
    return <AuthPage />;
  }

  const handleShareExperience = (tripId: string) => {
    // In a real app, you'd fetch trip details here
    setSelectedTripForShare({
      id: tripId,
      name: 'Sample Trip', // This would come from trip data
      destination: 'Sample Destination' // This would come from trip data
    });
    setShareModalOpen(true);
  };

  // Show trip planning page if a trip is selected
  if (selectedTripId) {
    return (
      <TripPlanningPage 
        tripId={selectedTripId} 
        onBack={() => setSelectedTripId(null)} 
      />
    );
  }

  // Show trip dashboard for authenticated users
  return (
    <>
      {/* Context banner */}
      <div className="p-4">
        <div className="glass-card p-4 flex items-center justify-between">
          <div className="text-sm text-secondary">
            {latestPlanName ? (
              <span>Latest plan: <span className="text-primary font-semibold">{latestPlanName}</span></span>
            ) : (
              <span>No plan loaded yet</span>
            )}
          </div>
          <div className="text-sm text-secondary">
            Past trips: <span className="text-primary font-semibold">{pastPlansCount}</span>
          </div>
        </div>
      </div>
      <TripDashboard 
        onTripSelect={setSelectedTripId} 
        onShareExperience={handleShareExperience}
      />
      
      {selectedTripForShare && (
        <ShareExperienceModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSelectedTripForShare(null);
          }}
          tripId={selectedTripForShare.id}
          tripName={selectedTripForShare.name}
          destination={selectedTripForShare.destination}
        />
      )}
    </>
  );
};

export default GroupPage;