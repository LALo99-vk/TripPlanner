import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ArrowLeft, MapPin, Calendar, Users, Crown, UserPlus, Copy, Check, X, MessageCircle, Map } from 'lucide-react';
import { getGroup, subscribeToGroup, type Group } from '../../services/groupRepository';
import ItinerarySection from '../Group/ItinerarySection';
import ChatSection from '../Group/ChatSection';
import PollSection from '../Group/PollSection';
import MapSection from '../Group/MapSection'; // Google Maps
// import MapSection from '../Group/MapSectionMapbox'; // Mapbox (Free alternative)

type GroupTab = 'itinerary' | 'chat' | 'polls' | 'map' | 'members';

interface GroupDetailPageProps {
  groupId: string;
  onBack: () => void;
}

const GroupDetailPage: React.FC<GroupDetailPageProps> = ({ groupId, onBack }) => {
  const { user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GroupTab>('itinerary');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load group data
  useEffect(() => {
    const loadGroup = async () => {
      try {
        const groupData = await getGroup(groupId);
        if (groupData) {
          setGroup(groupData);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading group:', error);
        setLoading(false);
      }
    };

    loadGroup();
  }, [groupId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeToGroup(groupId, (updatedGroup) => {
      if (updatedGroup) {
        setGroup(updatedGroup);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [groupId]);

  const generateInviteLink = (groupId: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/group/${groupId}`;
  };

  const copyInviteLink = () => {
    if (!group) return;
    const link = generateInviteLink(group.id);
    navigator.clipboard.writeText(link);
    setCopiedInviteLink(true);
    showToast('Invite link copied to clipboard!', 'success');
    setTimeout(() => setCopiedInviteLink(false), 2000);
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading group...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="premium-button-secondary flex items-center gap-2 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Groups
          </button>
          <div className="glass-card p-12 text-center">
            <p className="text-primary">Group not found</p>
          </div>
        </div>
      </div>
    );
  }

  const isLeader = user?.uid === group.leaderId;
  const isMember = group.members.some(m => m.uid === user?.uid);

  if (!isMember) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={onBack}
            className="premium-button-secondary flex items-center gap-2 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Groups
          </button>
          <div className="glass-card p-12 text-center">
            <p className="text-primary">You are not a member of this group</p>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'itinerary' as const, label: 'Itinerary Editor', icon: Calendar },
    { id: 'chat' as const, label: 'Communication Hub', icon: MessageCircle },
    { id: 'polls' as const, label: 'Decision Center', icon: Users },
    { id: 'map' as const, label: 'Live Map', icon: Map },
    { id: 'members' as const, label: 'Members', icon: Users },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="premium-button-secondary flex items-center gap-2 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Groups
        </button>

        {/* Group Header */}
        <div className="glass-card p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h1 className="text-3xl font-bold text-primary">{group.groupName}</h1>
                {isLeader && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-1 rounded flex items-center gap-1">
                    <Crown className="h-3 w-3" />
                    Leader
                  </span>
                )}
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
              <div className="flex flex-wrap items-center text-secondary text-sm gap-4">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{group.destination}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {new Date(group.startDate).toLocaleDateString()} -{' '}
                    {new Date(group.endDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{group.members.length} members</span>
                </div>
              </div>
            </div>
            {isLeader && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="premium-button-secondary flex items-center gap-2 text-sm"
              >
                <UserPlus className="h-4 w-4" />
                Invite Member
              </button>
            )}
          </div>

          {group.description && (
            <p className="text-secondary text-sm mt-4">{group.description}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="glass-card overflow-hidden mb-6">
          <div className="flex border-b border-white/10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-primary border-b-2 border-orange-500 bg-white/5'
                      : 'text-secondary hover:text-primary hover:bg-white/5'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'itinerary' && (
              <ItinerarySection
                groupId={group.id}
                leaderId={group.leaderId}
              />
            )}

            {activeTab === 'chat' && (
              <ChatSection
                groupId={group.id}
                leaderId={group.leaderId}
              />
            )}

            {activeTab === 'polls' && (
              <PollSection
                groupId={group.id}
                leaderId={group.leaderId}
              />
            )}

            {activeTab === 'map' && (
              <MapSection
                groupId={group.id}
                leaderId={group.leaderId}
              />
            )}

            {activeTab === 'members' && (
              <div>
                <h3 className="text-xl font-semibold text-primary mb-4">Group Members</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.members.map((member) => (
                    <div
                      key={member.uid}
                      className="glass-card p-4 flex items-center gap-3"
                    >
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-semibold text-lg">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-medium">{member.name}</span>
                          {member.uid === group.leaderId && (
                            <Crown className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                        {member.email && (
                          <p className="text-muted text-xs mt-1">{member.email}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
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
                  value={generateInviteLink(group.id)}
                  readOnly
                  className="flex-1 glass-input px-3 py-2 rounded text-sm"
                />
                <button
                  onClick={copyInviteLink}
                  className="premium-button-secondary flex items-center gap-2 text-sm"
                >
                  {copiedInviteLink ? (
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

export default GroupDetailPage;

