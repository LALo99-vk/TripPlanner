import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AuthPage from '../Auth/AuthPage';
import { Plus, Users, MapPin, Calendar, X, Crown, Trash2 } from 'lucide-react';
import GroupDetailPage from './GroupDetailPage';
import {
  createGroup,
  getGroup,
  getUserGroups,
  subscribeUserGroups,
  addMemberToGroup,
  deleteGroup,
  type Group,
  type CreateGroupData,
} from '../../services/groupRepository';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

const GroupPage: React.FC = () => {
  const { user, loading } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [newGroup, setNewGroup] = useState<CreateGroupData>({
    groupName: '',
    destination: '',
    startDate: '',
    endDate: '',
    description: '',
  });

  const handleJoinGroup = async (groupId: string) => {
    if (!user) {
      showToast('Please log in to join a group', 'error');
      return;
    }

    try {
      await addMemberToGroup(
        groupId,
        user.uid,
        user.displayName || 'User',
        user.email
      );
      showToast('Successfully joined the group!', 'success');
      
      // Load and navigate to the group
      const group = await getGroup(groupId);
      if (group) {
        setSelectedGroupId(groupId);
        window.history.pushState({}, '', `/group/${groupId}`);
      }
    } catch (error: any) {
      console.error('Error joining group:', error);
      showToast('Failed to join group. You may already be a member.', 'error');
    }
  };

  // Handle group ID from URL (both query param and path)
  useEffect(() => {
    if (!user || groups.length === 0) return;

    // Check URL path for /group/{groupId} pattern (but not just /group)
    const pathMatch = window.location.pathname.match(/\/group\/([^/]+)/);
    const pathGroupId = pathMatch ? pathMatch[1] : null;
    
    // Check query param for groupId
    const params = new URLSearchParams(window.location.search);
    const queryGroupId = params.get('groupId');
    
    const groupId = pathGroupId || queryGroupId;
    
    if (groupId) {
      // Check if user is already a member
      const isMember = groups.some(g => g.id === groupId);
      
      if (isMember) {
        // User is already a member, navigate to detail page
        setSelectedGroupId(groupId);
        // Update URL to show group detail page
        window.history.pushState({}, '', `/group/${groupId}`);
      } else {
        // User is not a member, try to join
        handleJoinGroup(groupId);
      }
      
      // Clean up URL to remove query params but keep path
      if (queryGroupId) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else {
      // No groupId in URL, make sure we're showing the groups list
      setSelectedGroupId(null);
    }
  }, [user, groups]);

  // Load user groups
  useEffect(() => {
    if (!user) return;

    // Initial load
    getUserGroups(user.uid).then((userGroups) => {
      setGroups(userGroups);
    });

    // Subscribe to real-time updates
    const unsubscribe = subscribeUserGroups(user.uid, (updatedGroups) => {
      setGroups(updatedGroups);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);


  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setCreateLoading(true);
    try {
      const group = await createGroup(
        user.uid,
        user.displayName || 'User',
        user.email,
        newGroup
      );

      showToast('Group trip created successfully!', 'success');
      setShowCreateModal(false);
      setNewGroup({
        groupName: '',
        destination: '',
        startDate: '',
        endDate: '',
        description: '',
      });
      
      // Manually refresh groups list to ensure new group appears
      const updatedGroups = await getUserGroups(user.uid);
      setGroups(updatedGroups);
      
      // Navigate to the newly created group
      setSelectedGroupId(group.id);
      window.history.pushState({}, '', `/group/${group.id}`);
    } catch (error: any) {
      console.error('Error creating group:', error);
      showToast('Failed to create group. Please try again.', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleBackToGroups = () => {
    setSelectedGroupId(null);
    window.history.pushState({}, '', '/group');
  };

  const handleDeleteGroup = async (groupId: string, groupName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    if (!user) return;
    
    if (!confirm(`Are you sure you want to delete "${groupName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteGroup(groupId, user.uid);
      showToast('Group deleted successfully', 'success');
      
      // Refresh groups list
      const updatedGroups = await getUserGroups(user.uid);
      setGroups(updatedGroups);
    } catch (error: any) {
      console.error('Error deleting group:', error);
      showToast(error.message || 'Failed to delete group. Only the leader can delete.', 'error');
    }
  };

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

  // Show group detail page if a group is selected
  if (selectedGroupId) {
    return (
      <GroupDetailPage
        groupId={selectedGroupId}
        onBack={handleBackToGroups}
      />
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header with Create Button */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-primary mb-2">Group Travel</h1>
            <p className="text-secondary text-sm">Plan and collaborate on amazing journeys with friends</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="premium-button-primary flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create New Group Trip
          </button>
        </div>

        {/* Group List */}
        <div className="max-w-4xl mx-auto">
          <div className="glass-card p-4">
            <h2 className="text-xl font-semibold text-primary mb-4">Your Groups</h2>
            
            {groups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted mx-auto mb-3" />
                <p className="text-muted text-sm mb-4">No groups yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="premium-button-secondary text-sm"
                >
                  Create Your First Group
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      window.history.pushState({}, '', `/group/${group.id}`);
                    }}
                    className="glass-card p-4 cursor-pointer transition-all hover:bg-white/10 relative"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-primary text-sm flex-1">{group.groupName}</h3>
                      <div className="flex items-center gap-2">
                        {group.leaderId === user.uid && (
                          <Crown className="h-4 w-4 text-yellow-500" />
                        )}
                        {group.leaderId === user.uid && (
                          <button
                            onClick={(e) => handleDeleteGroup(group.id, group.groupName, e)}
                            className="text-muted hover:text-red-400 transition-colors p-1"
                            title="Delete group"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center text-muted text-xs mb-1">
                      <MapPin className="h-3 w-3 mr-1" />
                      <span>{group.destination}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center text-muted text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        <span>{group.members.length} members</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        group.status === 'planning'
                          ? 'bg-blue-500/20 text-blue-300'
                          : group.status === 'active'
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-gray-500/20 text-gray-300'
                      }`}>
                        {group.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-primary">Create New Group Trip</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Trip Name *
                </label>
                <input
                  type="text"
                  value={newGroup.groupName}
                  onChange={(e) =>
                    setNewGroup((prev) => ({ ...prev, groupName: e.target.value }))
                  }
                  className="glass-input w-full px-4 py-3 rounded-lg"
                  placeholder="e.g., Goa Beach Adventure"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Destination *
                </label>
                <input
                  type="text"
                  value={newGroup.destination}
                  onChange={(e) =>
                    setNewGroup((prev) => ({ ...prev, destination: e.target.value }))
                  }
                  className="glass-input w-full px-4 py-3 rounded-lg"
                  placeholder="e.g., Goa, India"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={newGroup.startDate}
                    onChange={(e) =>
                      setNewGroup((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="glass-input w-full px-4 py-3 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={newGroup.endDate}
                    onChange={(e) =>
                      setNewGroup((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="glass-input w-full px-4 py-3 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={newGroup.description}
                  onChange={(e) =>
                    setNewGroup((prev) => ({ ...prev, description: e.target.value }))
                  }
                  className="glass-input w-full px-4 py-3 rounded-lg"
                  placeholder="Tell your group about this trip..."
                  rows={3}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 premium-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 premium-button-primary disabled:opacity-50"
                >
                  {createLoading ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`glass-card p-4 flex items-center gap-3 min-w-[300px] ${
              toast.type === 'success' ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500'
            }`}
          >
            <div className="flex-1">
              <p className="text-primary text-sm">{toast.message}</p>
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-muted hover:text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GroupPage;
