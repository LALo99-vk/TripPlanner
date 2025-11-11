import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface GroupMember {
  uid: string;
  name: string;
  email: string | null;
}

export interface Group {
  id: string;
  groupName: string;
  destination: string;
  startDate: string;
  endDate: string;
  description: string | null;
  leaderId: string;
  leaderName: string;
  members: GroupMember[];
  status: 'planning' | 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupData {
  groupName: string;
  destination: string;
  startDate: string;
  endDate: string;
  description?: string;
}

/**
 * Create a new group trip
 */
export async function createGroup(
  userId: string,
  userName: string,
  userEmail: string | null,
  data: CreateGroupData
): Promise<Group> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Create the initial member (leader)
  const initialMember: GroupMember = {
    uid: userId,
    name: userName,
    email: userEmail,
  };

  // Insert the group
  const { data: groupData, error: groupError } = await supabase
    .from('groups')
    .insert({
      group_name: data.groupName,
      destination: data.destination,
      start_date: data.startDate,
      end_date: data.endDate,
      description: data.description || null,
      leader_id: userId,
      leader_name: userName,
      members: [initialMember],
      status: 'planning',
    })
    .select()
    .single();

  if (groupError) {
    console.error('Error creating group:', groupError);
    throw groupError;
  }

  const groupId = groupData.id;

  // Add to user_groups junction table
  const { error: junctionError } = await supabase
    .from('user_groups')
    .insert({
      user_id: userId,
      group_id: groupId,
    });

  if (junctionError) {
    console.error('Error adding user to group:', junctionError);
    // Continue anyway, the group was created
  }

  return mapGroupData(groupData);
}

/**
 * Get a group by ID
 */
export async function getGroup(groupId: string): Promise<Group | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('id', groupId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching group:', error);
    return null;
  }

  return mapGroupData(data);
}

/**
 * Get all groups for a user (where they are a member)
 */
export async function getUserGroups(userId: string): Promise<Group[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Get group IDs from user_groups junction table
  const { data: userGroupData, error: userGroupError } = await supabase
    .from('user_groups')
    .select('group_id')
    .eq('user_id', userId);

  if (userGroupError) {
    console.error('Error fetching user groups:', userGroupError);
    return [];
  }

  if (!userGroupData || userGroupData.length === 0) {
    return [];
  }

  const groupIds = userGroupData.map((ug) => ug.group_id);

  // Fetch the actual groups
  const { data: groupsData, error: groupsError } = await supabase
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: false });

  if (groupsError) {
    console.error('Error fetching groups:', groupsError);
    return [];
  }

  return (groupsData || []).map(mapGroupData);
}

/**
 * Add a member to a group
 */
export async function addMemberToGroup(
  groupId: string,
  userId: string,
  userName: string,
  userEmail: string | null
): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Get current group
  const group = await getGroup(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  // Check if user is already a member
  const isAlreadyMember = group.members.some((m) => m.uid === userId);
  if (isAlreadyMember) {
    return; // Already a member, no-op
  }

  // Add new member
  const newMember: GroupMember = {
    uid: userId,
    name: userName,
    email: userEmail,
  };

  const updatedMembers = [...group.members, newMember];

  // Update group members array
  const { error: updateError } = await supabase
    .from('groups')
    .update({ members: updatedMembers })
    .eq('id', groupId);

  if (updateError) {
    console.error('Error adding member to group:', updateError);
    throw updateError;
  }

  // Add to user_groups junction table
  const { error: junctionError } = await supabase
    .from('user_groups')
    .insert({
      user_id: userId,
      group_id: groupId,
    });

  if (junctionError) {
    console.error('Error adding user to group junction:', junctionError);
    // Continue anyway, the member was added to the group
  }
}

/**
 * Subscribe to a group for real-time updates
 */
export function subscribeToGroup(
  groupId: string,
  callback: (group: Group | null) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial group data
    const initialGroup = await getGroup(groupId);
    callback(initialGroup);

    // Subscribe to changes
    channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
          filter: `id=eq.${groupId}`,
        },
        async () => {
          const updatedGroup = await getGroup(groupId);
          callback(updatedGroup);
        }
      )
      .subscribe();
  };

  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
  };
}

/**
 * Subscribe to all groups for a user (real-time)
 */
export function subscribeUserGroups(
  userId: string,
  callback: (groups: Group[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial groups
    const initialGroups = await getUserGroups(userId);
    callback(initialGroups);

    // Subscribe to changes in user_groups junction table
    channel = supabase
      .channel(`user-${userId}-groups`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_groups',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // Refetch groups when user_groups changes
          const updatedGroups = await getUserGroups(userId);
          callback(updatedGroups);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
        },
        async () => {
          // Refetch when any group is created or updated
          const updatedGroups = await getUserGroups(userId);
          callback(updatedGroups);
        }
      )
      .subscribe();
  };

  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
  };
}

/**
 * Delete a group (only leader can delete)
 */
export async function deleteGroup(groupId: string, userId: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  // First verify user is the leader
  const group = await getGroup(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  if (group.leaderId !== userId) {
    throw new Error('Only the group leader can delete the group');
  }

  // Delete the group (cascade will handle related records)
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId)
    .eq('leader_id', userId);

  if (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
}

/**
 * Helper function to map database row to Group interface
 */
function mapGroupData(data: any): Group {
  return {
    id: data.id,
    groupName: data.group_name,
    destination: data.destination,
    startDate: data.start_date,
    endDate: data.end_date,
    description: data.description,
    leaderId: data.leader_id,
    leaderName: data.leader_name,
    members: data.members || [],
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

