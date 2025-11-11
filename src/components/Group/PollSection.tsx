import React, { useEffect, useState } from 'react';
import { Plus, BarChart2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  GroupPoll,
  createPoll,
  listPolls,
  subscribeGroupPolls,
  votePoll,
  closePoll,
} from '../../services/pollRepository';

interface PollSectionProps {
  groupId: string;
  leaderId: string;
}

// Separate component for poll card to properly use hooks
interface PollCardProps {
  poll: GroupPoll;
  isLeader: boolean;
  userHasVoted: boolean;
  onClose: (poll: GroupPoll) => void;
  onVote: (poll: GroupPoll, selectedIds: string[]) => void;
}

const PollCard: React.FC<PollCardProps> = ({ 
  poll, 
  isLeader, 
  userHasVoted, 
  onClose, 
  onVote 
}) => {
  const { user } = useAuth();
  const calcTotalVotes = (p: GroupPoll) => p.options.reduce((sum, o) => sum + (o.votes?.length || 0), 0);
  const total = calcTotalVotes(poll) || 1;
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    // Initialize selection with user's current votes
    if (!user) return;
    const current = poll.options.filter((o) => o.votes?.includes(user.uid)).map((o) => o.id);
    setSelected(current);
  }, [poll.id, poll.options, user]);

  const toggleSelect = (id: string) => {
    if (poll.type === 'single') {
      setSelected([id]);
    } else {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
  };

  const submitVote = () => onVote(poll, selected);

  return (
    <div className="glass-card p-6 border border-white/10 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-xl font-semibold text-primary">{poll.question}</h4>
          <div className="text-sm text-muted mt-1">
            {poll.type === 'single' ? 'Single choice' : 'Multiple choice'}
            {poll.expiresAt ? ` • Ends ${new Date(poll.expiresAt).toLocaleString()}` : ''}
          </div>
        </div>
        {isLeader && poll.status === 'active' && (
          <button
            className="text-xs premium-button-secondary"
            onClick={() => onClose(poll)}
          >
            Close
          </button>
        )}
      </div>

      <div className="space-y-3 mt-2">
        {poll.options.map((opt) => {
          const votes = opt.votes?.length || 0;
          const pct = Math.round((votes / total) * 100);
          const isSelected = selected.includes(opt.id);

          return (
            <div key={opt.id} className="p-3 rounded border border-white/10 bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {poll.type === 'single' ? (
                    <input
                      type="radio"
                      name={`poll-${poll.id}`}
                      checked={isSelected}
                      onChange={() => toggleSelect(opt.id)}
                    />
                  ) : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(opt.id)}
                    />
                  )}
                  <span className="text-primary text-base">{opt.text}</span>
                </div>
                <span className="text-xs text-muted">{votes} votes</span>
              </div>
              <div className="mt-3 h-3 bg-white/10 rounded overflow-hidden">
                <div className="h-3 bg-orange-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {poll.status === 'active' ? (
          <button
            onClick={submitVote}
            disabled={userHasVoted && selected.length === 0}
            className="premium-button-primary text-sm px-4 py-2 disabled:opacity-50"
          >
            {userHasVoted ? 'Update Vote' : 'Vote'}
          </button>
        ) : (
          <span className="text-xs text-muted">Poll closed</span>
        )}
      </div>

      {poll.aiSummary && (
        <div className="mt-4 p-4 glass-card border border-blue-500/20">
          <div className="text-xs text-blue-300 mb-2">🧠 AI Suggestion</div>
          <div className="text-sm text-primary whitespace-pre-wrap leading-relaxed">
            {poll.aiSummary}
          </div>
        </div>
      )}
    </div>
  );
};

const PollSection: React.FC<PollSectionProps> = ({ groupId, leaderId }) => {
  const { user } = useAuth();
  const isLeader = user?.uid === leaderId;

  const [polls, setPolls] = useState<GroupPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create poll form state
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [type, setType] = useState<'single' | 'multiple'>('single');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setError(null);

    // Initial load
    listPolls(groupId)
      .then((res) => {
        if (mounted) {
          setPolls(res || []);
          setLoading(false);
          setError(null);
        }
      })
      .catch((err) => {
        console.error('Error loading polls:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load polls');
          setLoading(false);
          setPolls([]);
        }
      });

    // Realtime subscription
    try {
      const unsub = subscribeGroupPolls(groupId, (p) => {
        if (mounted) {
          setPolls(p || []);
          setLoading(false);
          setError(null);
        }
      });

      return () => {
        mounted = false;
        unsub();
      };
    } catch (err) {
      console.error('Error setting up subscription:', err);
      if (mounted) {
        setError('Failed to set up real-time updates');
        setLoading(false);
      }
      return () => {
        mounted = false;
      };
    }
  }, [groupId]);

  const activePolls = polls.filter((p) => p.status === 'active');
  const closedPolls = polls.filter((p) => p.status === 'closed');

  const userHasVoted = (poll: GroupPoll) => {
    if (!user) return false;
    return poll.options.some((opt) => (opt.votes || []).includes(user.uid));
  };

  const createPollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;

    setCreating(true);
    try {
      await createPoll(groupId, user.uid, user.displayName || 'User', {
        question: question.trim(),
        options: cleanOptions,
        type,
        expiresAt: expiresAt || null,
      });
      setQuestion('');
      setOptions(['', '']);
      setType('single');
      setExpiresAt('');
      setShowCreateModal(false);
    } catch (error) {
      console.error('Error creating poll:', error);
    } finally {
      setCreating(false);
    }
  };

  const castVote = async (poll: GroupPoll, selectedIds: string[]) => {
    if (!user) return;
    try {
      await votePoll(poll.id, user.uid, selectedIds, poll.type === 'multiple');
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  const handleClosePoll = async (poll: GroupPoll) => {
    if (!isLeader) return;
    try {
      await closePoll(poll.id);
    } catch (error) {
      console.error('Error closing poll:', error);
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-extrabold text-primary">Group Decision Center</h2>
          <p className="text-sm text-muted mt-1">
            Create polls and make decisions together in real time.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="premium-button-primary flex items-center gap-2 text-sm px-4 py-3"
        >
          <Plus className="h-4 w-4" />
          Create Poll
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
      ) : error ? (
        <div className="glass-card p-8 text-center border border-red-500/20">
          <p className="text-red-400 font-medium mb-2">Error loading polls</p>
          <p className="text-sm text-muted">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              listPolls(groupId)
                .then((res) => {
                  setPolls(res || []);
                  setLoading(false);
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : 'Failed to load polls');
                  setLoading(false);
                });
            }}
            className="mt-4 premium-button-primary text-sm"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="max-w-6xl mx-auto space-y-8">
            {activePolls.length === 0 ? (
              <div className="glass-card p-8 text-center border border-white/10">
                <BarChart2 className="h-10 w-10 text-muted mx-auto mb-3" />
                <p className="text-primary font-medium">No active polls</p>
                <p className="text-sm text-muted mt-1">Create a poll to get started.</p>
              </div>
            ) : (
              activePolls.map((p) => (
                <div key={p.id} className="transition-transform hover:scale-[1.005]">
                  <PollCard 
                    poll={p} 
                    isLeader={isLeader} 
                    userHasVoted={userHasVoted(p)} 
                    onClose={handleClosePoll}
                    onVote={castVote}
                  />
                </div>
              ))
            )}
          </div>

          <div className="max-w-6xl mx-auto">
            <h3 className="text-xl font-semibold text-primary mb-3">Past Polls</h3>
            {closedPolls.length === 0 ? (
              <div className="text-sm text-muted">No past polls</div>
            ) : (
              <div className="space-y-4">
                {closedPolls.map((p) => (
                  <div key={p.id} className="opacity-90">
                    <PollCard 
                      poll={p} 
                      isLeader={isLeader} 
                      userHasVoted={userHasVoted(p)} 
                      onClose={handleClosePoll}
                      onVote={castVote}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Poll Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50">
          <div className="w-full h-full flex items-center justify-center p-4 md:p-8">
            <div className="glass-card w-full h-full md:h-auto max-w-5xl md:max-h-[90vh] overflow-y-auto p-10 shadow-2xl border border-white/20 rounded-xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-bold text-primary">Create Poll</h3>
              <button className="text-muted" onClick={() => setShowCreateModal(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createPollSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-secondary mb-2">Question</label>
                <input
                  type="text"
                  className="glass-input bg-white/10 w-full px-4 py-3 rounded"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-secondary mb-2">Options</label>
                <div className="space-y-3">
                  {options.map((opt, idx) => (
                    <input
                      key={idx}
                      type="text"
                      className="glass-input bg-white/10 w-full px-4 py-3 rounded"
                      value={opt}
                      onChange={(e) => {
                        const next = [...options];
                        next[idx] = e.target.value;
                        setOptions(next);
                      }}
                      required={idx < 2}
                      placeholder={`Option ${idx + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-3 text-xs premium-button-secondary"
                  onClick={() => setOptions((prev) => [...prev, ''])}
                >
                  Add option
                </button>
              </div>

              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-secondary mb-2">Poll Type</label>
                  <select
                    className="glass-input bg-white/10 w-full px-4 py-3 rounded"
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                  >
                    <option value="single">Single choice</option>
                    <option value="multiple">Multiple choice</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-secondary mb-2">Expires At (optional)</label>
                  <input
                    type="datetime-local"
                    className="glass-input bg-white/10 w-full px-4 py-3 rounded"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3 pt-2">
                <button type="button" className="flex-1 premium-button-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={creating} className="flex-1 premium-button-primary disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PollSection;
