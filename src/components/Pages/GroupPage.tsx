import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AuthPage from '../Auth/AuthPage';
import { Plus, Users, MapPin, Calendar, X, Copy, Check, UserPlus, Crown } from 'lucide-react';
import {
  createGroup,
  getGroup,
  getUserGroups,
  subscribeUserGroups,
  subscribeToGroup,
  addMemberToGroup,
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
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copiedInviteLink, setCopiedInviteLink] = useState<string | null>(null);

  const [newGroup, setNewGroup] = useState<CreateGroupData>({
    groupName: '',
    destination: '',
    startDate: '',
    endDate: '',
    description: '',
  });

  // Handle join link from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get('groupId');
    
    if (groupId && user) {
      handleJoinGroup(groupId);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [user]);

  // Load user groups
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeUserGroups(user.uid, (updatedGroups) => {
      setGroups(updatedGroups);
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Subscribe to selected group for real-time member updates
  useEffect(() => {
    if (!selectedGroup) return;

    const unsubscribe = subscribeToGroup(selectedGroup.id, (updatedGroup) => {
      if (updatedGroup) {
        setSelectedGroup(updatedGroup);
        // Show notification when new member joins
        if (updatedGroup.members.length > (selectedGroup.members.length || 0)) {
          const newMember = updatedGroup.members[updatedGroup.members.length - 1];
          showToast(`${newMember.name} has joined the ${updatedGroup.groupName} group!`, 'success');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedGroup?.id]);

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
      
      // Select the newly created group
      setSelectedGroup(group);
    } catch (error: any) {
      console.error('Error creating group:', error);
      showToast('Failed to create group. Please try again.', 'error');
    } finally {
      setCreateLoading(false);
    }
  };

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
      
      // Load and select the group
      const group = await getGroup(groupId);
      if (group) {
        setSelectedGroup(group);
      }
    } catch (error: any) {
      console.error('Error joining group:', error);
      showToast('Failed to join group. You may already be a member.', 'error');
    }
  };

  const generateInviteLink = (groupId: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}?page=group&groupId=${groupId}`;
  };

  const copyInviteLink = (groupId: string) => {
    const link = generateInviteLink(groupId);
    navigator.clipboard.writeText(link);
    setCopiedInviteLink(groupId);
    showToast('Invite link copied to clipboard!', 'success');
    setTimeout(() => setCopiedInviteLink(null), 2000);
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Group List */}
          <div className="lg:col-span-1">
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
                <div className="space-y-3">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      onClick={() => setSelectedGroup(group)}
                      className={`glass-card p-4 cursor-pointer transition-all ${
                        selectedGroup?.id === group.id
                          ? 'border-2 border-orange-500'
                          : 'hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-primary text-sm">{group.groupName}</h3>
                        {group.leaderId === user.uid && (
                          <Crown className="h-4 w-4 text-yellow-500" />
                        )}
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

          {/* Right: Group Details */}
          <div className="lg:col-span-2">
            {selectedGroup ? (
              <div className="glass-card p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-2xl font-bold text-primary">{selectedGroup.groupName}</h2>
                      {selectedGroup.leaderId === user.uid && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded flex items-center gap-1">
                          <Crown className="h-3 w-3" />
                          Leader
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-secondary text-sm gap-4">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{selectedGroup.destination}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(selectedGroup.startDate).toLocaleDateString()} -{' '}
                          {new Date(selectedGroup.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  {selectedGroup.leaderId === user.uid && (
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="premium-button-secondary flex items-center gap-2 text-sm"
                    >
                      <UserPlus className="h-4 w-4" />
                      Invite Member
                    </button>
                  )}
                </div>

                {selectedGroup.description && (
                  <div className="mb-6">
                    <p className="text-secondary text-sm">{selectedGroup.description}</p>
                  </div>
                )}

                {/* Members Section */}
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-4">Members</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedGroup.members.map((member) => (
                      <div
                        key={member.uid}
                        className="glass-card p-3 flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-semibold">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-primary font-medium text-sm">{member.name}</span>
                            {member.uid === selectedGroup.leaderId && (
                              <Crown className="h-3 w-3 text-yellow-500" />
                            )}
                          </div>
                          {member.email && (
                            <p className="text-muted text-xs">{member.email}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-card p-12 text-center">
                <MapPin className="h-16 w-16 text-muted mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-primary mb-2">Select a Group</h3>
                <p className="text-muted text-sm">
                  Choose a group from the list to view details and manage members
                </p>
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

      {/* Invite Member Modal */}
      {showInviteModal && selectedGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-card p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-primary">Invite Members</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-muted hover:text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-secondary text-sm">
                Share this link with your friends to invite them to join the group:
              </p>

              <div className="glass-card p-4 flex items-center gap-3">
                <input
                  type="text"
                  value={generateInviteLink(selectedGroup.id)}
                  readOnly
                  className="flex-1 glass-input px-3 py-2 rounded text-sm"
                />
                <button
                  onClick={() => copyInviteLink(selectedGroup.id)}
                  className="premium-button-secondary flex items-center gap-2 text-sm"
                >
                  {copiedInviteLink === selectedGroup.id ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-full premium-button-primary"
                >
                  Done
                </button>
              </div>
            </div>
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
