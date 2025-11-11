import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // array of userIds
}

export interface GroupPoll {
  id: string;
  groupId: string;
  question: string;
  options: PollOption[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string | null;
  type: 'single' | 'multiple';
  aiSummary?: string | null;
  status: 'active' | 'closed';
  updatedAt: string;
}

export interface CreatePollData {
  question: string;
  options: string[]; // option texts
  type: 'single' | 'multiple';
  expiresAt?: string | null;
}

function mapPollRow(row: any): GroupPoll {
  return {
    id: row.id,
    groupId: row.group_id,
    question: row.question,
    options: (row.options || []) as PollOption[],
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    type: row.type,
    aiSummary: row.ai_summary,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function createPoll(
  groupId: string,
  userId: string,
  userName: string,
  data: CreatePollData
): Promise<GroupPoll> {
  const supabase = await getAuthenticatedSupabaseClient();

  const options: PollOption[] = data.options.map((text, i) => ({ id: `${Date.now()}-${i}`, text, votes: [] }));

  const { data: row, error } = await supabase
    .from('group_polls')
    .insert({
      group_id: groupId,
      question: data.question,
      options,
      created_by: userId,
      created_by_name: userName,
      expires_at: data.expiresAt || null,
      type: data.type,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return mapPollRow(row);
}

export async function listPolls(groupId: string): Promise<GroupPoll[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('group_polls')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapPollRow);
}

export async function votePoll(
  pollId: string,
  userId: string,
  optionIds: string[],
  isMultiple: boolean
): Promise<GroupPoll> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data: row, error } = await supabase
    .from('group_polls')
    .select('options')
    .eq('id', pollId)
    .single();
  if (error) throw error;

  let options: PollOption[] = (row.options || []) as PollOption[];

  options = options.map((opt) => {
    // Remove existing vote by this user from all options first
    const withoutUser = (opt.votes || []).filter((v) => v !== userId);
    // Add vote if this option is selected
    const shouldAdd = optionIds.includes(opt.id);
    const nextVotes = shouldAdd ? [...withoutUser, userId] : withoutUser;
    return { ...opt, votes: nextVotes };
  });

  const { data: updated, error: upErr } = await supabase
    .from('group_polls')
    .update({ options })
    .eq('id', pollId)
    .select()
    .single();
  if (upErr) throw upErr;
  return mapPollRow(updated);
}

export async function closePoll(pollId: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from('group_polls')
    .update({ status: 'closed' })
    .eq('id', pollId);
  if (error) throw error;
}

export async function setPollAiSummary(pollId: string, summary: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from('group_polls')
    .update({ ai_summary: summary })
    .eq('id', pollId);
  if (error) throw error;
}

export function subscribeGroupPolls(
  groupId: string,
  cb: (polls: GroupPoll[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setup = async () => {
    const supabase = await getAuthenticatedSupabaseClient();
    const initial = await listPolls(groupId);
    cb(initial);

    channel = supabase
      .channel(`group-polls-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_polls', filter: `group_id=eq.${groupId}` }, async () => {
        const latest = await listPolls(groupId);
        cb(latest);
      })
      .subscribe();
  };

  setup();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((s) => s.removeChannel(channel as RealtimeChannel));
    }
  };
}
