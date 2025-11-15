import React, { useState, useEffect } from 'react';
import { CalendarIcon, Plus, FolderOpen, Edit3 } from 'lucide-react';
import { 
  GroupItineraryActivity, 
  CreateActivityData, 
  UpdateActivityData,
  createActivity,
  updateActivity,
  deleteActivity,
  importPlanToGroupItinerary,
  replaceGroupItineraryWithPlan,
  subscribeGroupItinerary
} from '../../services/itineraryRepository';
import { SavedPlanRecord } from '../../services/planRepository';
import { ApprovalStatus, subscribeToApprovalStatus } from '../../services/planApprovalRepository';
import { useAuth } from '../../hooks/useAuth';
import ActivityCard from './ActivityCard';
import AddActivityModal from './AddActivityModal';
import ImportFromPlansModal from './ImportFromPlansModal';
import EditPlanModal from './EditPlanModal';
import PlanApprovalSection from './PlanApprovalSection';

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
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [editingActivity, setEditingActivity] = useState<GroupItineraryActivity | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);

  const isLeader = user?.uid === leaderId;
  const isPlanFixed = approvalStatus?.isFixed || false;

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

  // Subscribe to approval status
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeToApprovalStatus(groupId, (status) => {
      setApprovalStatus(status);
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

    if (isPlanFixed && !isLeader) {
      showToastMessage('This plan is locked. Only the leader can make changes.', 'error');
      return;
    }

    try {
      await createActivity(groupId, user.uid, user.displayName || 'User', data);
      showToastMessage('Activity added successfully!');
    } catch (error) {
      console.error('Error creating activity:', error);
      showToastMessage('Failed to add activity. Please try again.', 'error');
      throw error;
    }
  };

  const handleActivitySubmit = async (data: CreateActivityData | UpdateActivityData) => {
    if ('id' in data && data.id !== undefined) {
      // This is an update - use handleUpdateActivity
      const updateData = data as UpdateActivityData;
      await handleUpdateActivity(updateData);
    } else {
      // This is a create - use handleCreateActivity
      const createData = data as CreateActivityData;
      await handleCreateActivity(createData);
    }
  };

  const handleUpdateActivity = async (data: UpdateActivityData) => {
    if (!user || !editingActivity) return;

    if (isPlanFixed && !isLeader) {
      showToastMessage('This plan is locked. Only the leader can make changes.', 'error');
      setEditingActivity(null);
      return;
    }

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
    if (isPlanFixed && !isLeader) {
      showToastMessage('This plan is locked. Only the leader can make changes.', 'error');
      return;
    }

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

      let count = 0;
      if (replaceMode) {
        count = await replaceGroupItineraryWithPlan(
          groupId,
          user.uid,
          user.displayName || 'User',
          plan.plan,
          plan.id,
          group?.startDate
        );
        showToastMessage(`Itinerary replaced with "${plan.name}". ${count} activities added.`);
      } else {
        count = await importPlanToGroupItinerary(
          groupId,
          user.uid,
          user.displayName || 'User',
          plan.plan,
          plan.id,
          group?.startDate
        );
        showToastMessage(`Plan imported to group itinerary! ${count} activities added.`);
      }
      setReplaceMode(false);
    } catch (error) {
      console.error('Error importing plan:', error);
      showToastMessage('Failed to import plan. Please try again.', 'error');
      throw error;
    }
  };

  const handleUpdateActivities = async (updatedActivities: GroupItineraryActivity[]) => {
    // This function will update all activities at once
    // For now, we'll update each activity individually
    // In a real implementation, you might want a bulk update API
    try {
      for (const activity of updatedActivities) {
        await updateActivity(activity.id, user?.uid || '', {
          title: activity.title,
          description: activity.description || undefined,
          date: activity.date,
          startTime: activity.startTime || undefined,
          endTime: activity.endTime || undefined,
          location: activity.location || undefined,
        });
      }
      
      showToastMessage('Plan updated successfully!');
    } catch (error) {
      console.error('Error updating activities:', error);
      showToastMessage('Failed to update plan. Please try again.', 'error');
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
      {/* Plan Approval Section */}
      <PlanApprovalSection groupId={groupId} leaderId={leaderId} />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-primary">Group Itinerary</h2>
        <div className="flex items-center gap-3">
          {!isPlanFixed || isLeader ? (
            <>
              <button
                onClick={() => setShowImportModal(true)}
                className="premium-button-secondary flex items-center gap-2 text-sm"
                disabled={isPlanFixed && !isLeader}
              >
                <FolderOpen className="h-4 w-4" />
                Import Trip Itineraries
              </button>
              <button
                onClick={() => {
                  setReplaceMode(true);
                  setShowImportModal(true);
                }}
                className="premium-button-secondary flex items-center gap-2 text-sm border-orange-500/50 hover:border-orange-500/80 hover:bg-orange-500/10"
                title="Replace entire itinerary with a saved plan"
                disabled={isPlanFixed && !isLeader}
              >
                <FolderOpen className="h-4 w-4" />
                Replace Itinerary
              </button>
              {activities.length > 0 && (
                <button
                  onClick={() => setShowEditPlanModal(true)}
                  className="premium-button-secondary flex items-center gap-2 text-sm border-blue-500/50 hover:border-blue-500/80 hover:bg-blue-500/10"
                  title="Edit parts of the plan with AI assistance"
                  disabled={isPlanFixed && !isLeader}
                >
                  <Edit3 className="h-4 w-4" />
                  Edit Plan
                </button>
              )}
              <button
                onClick={() => setShowAddModal(true)}
                className="premium-button-primary flex items-center gap-2 text-sm"
                disabled={isPlanFixed && !isLeader}
              >
                <Plus className="h-4 w-4" />
                Add Activity
              </button>
            </>
          ) : (
            <div className="text-sm text-secondary">
              Plan is locked. Only the leader can make changes.
            </div>
          )}
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
                    onEdit={() => {
                      if (isPlanFixed && !isLeader) {
                        showToastMessage('This plan is locked. Only the leader can make changes.', 'error');
                        return;
                      }
                      setEditingActivity(activity);
                    }}
                    onDelete={() => handleDeleteActivity(activity.id)}
                    canEdit={!isPlanFixed || isLeader}
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
        onSubmit={handleActivitySubmit}
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

      {/* Edit Plan Modal */}
      <EditPlanModal
        isOpen={showEditPlanModal}
        onClose={() => setShowEditPlanModal(false)}
        activities={activities}
        onUpdateActivities={handleUpdateActivities}
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

