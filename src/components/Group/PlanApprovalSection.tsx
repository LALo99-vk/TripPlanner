import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Lock, Unlock, MessageSquare } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  voteOnPlan,
  unlockPlan,
  subscribeToApprovalStatus,
  type ApprovalStatus,
  type PlanApproval,
} from '../../services/planApprovalRepository';

interface PlanApprovalSectionProps {
  groupId: string;
  leaderId: string;
}

const PlanApprovalSection: React.FC<PlanApprovalSectionProps> = ({ groupId, leaderId }) => {
  const { user } = useAuth();
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedVote, setSelectedVote] = useState<'agree' | 'request_changes' | null>(null);
  const [comment, setComment] = useState('');

  const isLeader = user?.uid === leaderId;
  const userVote = approvalStatus?.approvals.find((a) => a.userId === user?.uid);

  useEffect(() => {
    if (!groupId) return;

    const unsubscribe = subscribeToApprovalStatus(groupId, (status) => {
      setApprovalStatus(status);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [groupId]);

  const handleVote = async (vote: 'agree' | 'request_changes') => {
    if (!user || voting) return;

    setSelectedVote(vote);
    if (vote === 'request_changes') {
      setShowCommentModal(true);
    } else {
      await submitVote(vote, '');
    }
  };

  const submitVote = async (vote: 'agree' | 'request_changes', commentText: string) => {
    if (!user || voting || !approvalStatus) return;

    setVoting(true);

    // Optimistic UI: Update approval status immediately
    const optimisticApproval: PlanApproval = {
      id: `temp-${Date.now()}`,
      groupId,
      userId: user.uid,
      userName: user.displayName || 'User',
      vote,
      comment: commentText || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Update approval status optimistically
    const existingApprovalIndex = approvalStatus.approvals.findIndex(
      (a) => a.userId === user.uid
    );

    let updatedApprovals: PlanApproval[];
    if (existingApprovalIndex >= 0) {
      updatedApprovals = [...approvalStatus.approvals];
      updatedApprovals[existingApprovalIndex] = optimisticApproval;
    } else {
      updatedApprovals = [...approvalStatus.approvals, optimisticApproval];
    }

    const newAgreedCount = updatedApprovals.filter((a) => a.vote === 'agree').length;
    const newDisagreedCount = updatedApprovals.filter((a) => a.vote === 'request_changes').length;
    const newPendingCount = approvalStatus.totalMembers - updatedApprovals.length;
    const newApprovalPercentage = approvalStatus.totalMembers > 0 
      ? newAgreedCount / approvalStatus.totalMembers 
      : 0;

    const optimisticStatus: ApprovalStatus = {
      ...approvalStatus,
      approvals: updatedApprovals,
      agreedCount: newAgreedCount,
      disagreedCount: newDisagreedCount,
      pendingCount: newPendingCount,
      approvalPercentage: newApprovalPercentage,
    };

    setApprovalStatus(optimisticStatus);
    setShowCommentModal(false);
    setComment('');
    setSelectedVote(null);

    try {
      await voteOnPlan(groupId, user.uid, user.displayName || 'User', vote, commentText || undefined);
      // The real-time subscription will update with the actual data
    } catch (error) {
      console.error('Error voting:', error);
      // Revert optimistic update on error
      setApprovalStatus(approvalStatus);
      alert('Failed to submit vote. Please try again.');
    } finally {
      setVoting(false);
    }
  };

  const handleUnlock = async () => {
    if (!user || !isLeader || unlocking) return;

    if (!confirm('Are you sure you want to unlock this plan? All approval votes will be cleared.')) {
      return;
    }

    setUnlocking(true);
    try {
      await unlockPlan(groupId, user.uid);
    } catch (error) {
      console.error('Error unlocking plan:', error);
      alert('Failed to unlock plan. Please try again.');
    } finally {
      setUnlocking(false);
    }
  };

  if (loading || !approvalStatus) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      </div>
    );
  }

  const approvalPercentage = Math.round(approvalStatus.approvalPercentage * 100);
  const isFixed = approvalStatus.isFixed;

  return (
    <div className="glass-card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-primary">Trip Plan Agreement</h3>
          {isFixed ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
              <Lock className="h-4 w-4" />
              Fixed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm font-semibold text-orange-400 bg-orange-400/10 px-3 py-1 rounded-full">
              <Unlock className="h-4 w-4" />
              Editable
            </span>
          )}
        </div>
        {isLeader && isFixed && (
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="premium-button-secondary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            <Unlock className="h-4 w-4" />
            {unlocking ? 'Unlocking...' : 'Unlock Plan'}
          </button>
        )}
      </div>

      {isFixed && (
        <div className="mb-4 p-4 bg-green-400/10 border border-green-400/30 rounded-lg">
          <p className="text-sm text-green-400">
            ✅ This trip plan has been approved by all members and is now locked. Only the leader can unlock it for further edits.
          </p>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-secondary">Approval Progress</span>
          <span className="text-sm font-semibold text-primary">{approvalPercentage}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-3">
          <div
            className="bg-green-400 h-3 rounded-full transition-all duration-300"
            style={{ width: `${approvalPercentage}%` }}
          ></div>
        </div>
        <div className="flex items-center justify-between text-xs text-secondary mt-1">
          <span>
            {approvalStatus.agreedCount} agreed, {approvalStatus.disagreedCount} requested changes,{' '}
            {approvalStatus.pendingCount} pending
          </span>
        </div>
      </div>

      {!isFixed && !userVote && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => handleVote('agree')}
            disabled={voting}
            className="flex-1 premium-button-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {voting && selectedVote === 'agree' ? 'Submitting...' : 'Agree'}
          </button>
          <button
            onClick={() => handleVote('request_changes')}
            disabled={voting}
            className="flex-1 premium-button-secondary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            {voting && selectedVote === 'request_changes' ? 'Submitting...' : 'Request Changes'}
          </button>
        </div>
      )}

      {userVote && (
        <div className="mb-4 p-3 bg-white/5 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {userVote.vote === 'agree' ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span className="text-sm font-medium text-primary">
                You {userVote.vote === 'agree' ? 'agreed' : 'requested changes'}
              </span>
            </div>
            {userVote.comment && (
              <button
                onClick={() => {
                  setComment(userVote.comment || '');
                  setShowCommentModal(true);
                }}
                className="text-xs text-secondary hover:text-primary flex items-center gap-1"
              >
                <MessageSquare className="h-3 w-3" />
                View comment
              </button>
            )}
          </div>
          {userVote.comment && (
            <p className="text-xs text-secondary mt-2 ml-7">{userVote.comment}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-primary mb-2">Member Status</h4>
        {approvalStatus.approvals.map((approval) => (
          <div
            key={approval.id}
            className="flex items-center justify-between p-2 bg-white/5 rounded-lg"
          >
            <span className="text-sm text-primary">{approval.userName}</span>
            <div className="flex items-center gap-2">
              {approval.vote === 'agree' ? (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <CheckCircle className="h-3 w-3" />
                  Agreed
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle className="h-3 w-3" />
                  Requested Changes
                </span>
              )}
            </div>
          </div>
        ))}
        {approvalStatus.pendingCount > 0 && (
          <div className="text-xs text-secondary text-center py-2">
            {approvalStatus.pendingCount} member{approvalStatus.pendingCount !== 1 ? 's' : ''} haven't voted yet
          </div>
        )}
      </div>

      {/* Comment Modal */}
      {showCommentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="glass-card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-primary mb-4">Request Changes</h3>
            <p className="text-sm text-secondary mb-4">
              Please provide feedback on what changes you'd like to see in the itinerary.
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe the changes you'd like..."
              className="w-full px-4 py-3 glass-input rounded-xl mb-4 min-h-[100px]"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowCommentModal(false);
                  setComment('');
                  setSelectedVote(null);
                }}
                className="flex-1 premium-button-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedVote) {
                    submitVote(selectedVote, comment);
                  }
                }}
                disabled={voting || !comment.trim()}
                className="flex-1 premium-button-primary disabled:opacity-50"
              >
                {voting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanApprovalSection;

