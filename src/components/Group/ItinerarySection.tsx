import React, { useState, useEffect } from 'react';
import { Plus, FolderOpen, Calendar as CalendarIcon } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  GroupItineraryActivity,
  createActivity,
  updateActivity,
  deleteActivity,
  subscribeGroupItinerary,
  importPlanToGroupItinerary,
  CreateActivityData,
  UpdateActivityData,
} from '../../services/itineraryRepository';
import { SavedPlanRecord } from '../../services/planRepository';
import ActivityCard from './ActivityCard';
import AddActivityModal from './AddActivityModal';
import ImportFromPlansModal from './ImportFromPlansModal';

interface ItinerarySectionProps {
  groupId: string;
  leaderId: string;
}

const ItinerarySection: React.FC<ItinerarySectionProps> = ({
  groupId,
  leaderId,
}) => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<GroupItineraryActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<GroupItineraryActivity | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const isLeader = user?.uid === leaderId;

  // Subscribe to real-time updates
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeGroupItinerary(groupId, (updatedActivities) => {
      setActivities(updatedActivities);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [groupId]);

  const showToastMessage = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateActivity = async (data: CreateActivityData) => {
    if (!user) return;

    try {
      await createActivity(groupId, user.uid, user.displayName || 'User', data);
      showToastMessage('Activity added successfully!');
    } catch (error) {
      console.error('Error creating activity:', error);
      showToastMessage('Failed to add activity. Please try again.', 'error');
      throw error;
    }
  };

  const handleUpdateActivity = async (data: UpdateActivityData) => {
    if (!user || !editingActivity) return;

    try {
      await updateActivity(editingActivity.id, user.uid, data);
      showToastMessage('Activity updated successfully!');
      setEditingActivity(null);
    } catch (error) {
      console.error('Error updating activity:', error);
      showToastMessage('Failed to update activity. Please try again.', 'error');
      throw error;
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      await deleteActivity(activityId);
      showToastMessage('Activity deleted successfully!');
    } catch (error) {
      console.error('Error deleting activity:', error);
      showToastMessage('Failed to delete activity. Please try again.', 'error');
    }
  };

  const handleImportPlan = async (plan: SavedPlanRecord) => {
    if (!user) return;

    try {
      // Get group start date for date calculation
      const { getGroup } = await import('../../services/groupRepository');
      const group = await getGroup(groupId);
      
      const count = await importPlanToGroupItinerary(
        groupId,
        user.uid,
        user.displayName || 'User',
        plan.plan,
        plan.id,
        group?.startDate
      );
      showToastMessage(`Plan imported to group itinerary! ${count} activities added.`);
    } catch (error) {
      console.error('Error importing plan:', error);
      showToastMessage('Failed to import plan. Please try again.', 'error');
      throw error;
    }
  };

  // Group activities by date
  const activitiesByDate = activities.reduce((acc, activity) => {
    const date = activity.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(activity);
    return acc;
  }, {} as Record<string, GroupItineraryActivity[]>);

  const sortedDates = Object.keys(activitiesByDate).sort();

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-primary">Group Itinerary</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="premium-button-secondary flex items-center gap-2 text-sm"
          >
            <FolderOpen className="h-4 w-4" />
            Import Trip Itineraries
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="premium-button-primary flex items-center gap-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            Add Activity
          </button>
        </div>
      </div>

      {/* Activities List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
      ) : activities.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <CalendarIcon className="h-16 w-16 text-muted mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-primary mb-2">No activities yet</h3>
          <p className="text-muted text-sm mb-4">
            Start building your group itinerary by adding activities or importing from your plans
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="premium-button-secondary text-sm"
            >
              Import Trip Itineraries
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="premium-button-primary text-sm"
            >
              Add First Activity
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/10">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold text-primary">
                  {new Date(date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </h3>
                <span className="text-sm text-muted">
                  ({activitiesByDate[date].length} {activitiesByDate[date].length === 1 ? 'activity' : 'activities'})
                </span>
              </div>
              <div className="space-y-3">
                {activitiesByDate[date].map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    currentUserId={user?.uid || ''}
                    isLeader={isLeader}
                    onEdit={() => setEditingActivity(activity)}
                    onDelete={() => handleDeleteActivity(activity.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Activity Modal */}
      <AddActivityModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateActivity}
      />

      {/* Edit Activity Modal */}
      {editingActivity && (
        <AddActivityModal
          isOpen={!!editingActivity}
          onClose={() => setEditingActivity(null)}
          onSubmit={handleUpdateActivity}
          initialData={{
            title: editingActivity.title,
            description: editingActivity.description || undefined,
            date: editingActivity.date,
            startTime: editingActivity.startTime || undefined,
            endTime: editingActivity.endTime || undefined,
            location: editingActivity.location || undefined,
          }}
          isEditing={true}
        />
      )}

      {/* Import Plans Modal */}
      <ImportFromPlansModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImportPlan}
      />

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 glass-card p-4 min-w-[300px] ${
          toast.type === 'success' ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
        }`}>
          <p className="text-primary text-sm">{toast.message}</p>
        </div>
      )}
    </div>
  );
};

export default ItinerarySection;

