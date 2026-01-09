import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface MemberLocation {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  lat: number;
  lng: number;
  isActive: boolean;
  lastUpdated: string;
  createdAt: string;
}

export interface MeetupPoint {
  id: string;
  groupId: string;
  name: string;
  lat: number;
  lng: number;
  addedBy: string;
  addedByName: string;
  createdAt: string;
}

export interface EmergencyAlert {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  lat: number;
  lng: number;
  resolved: boolean;
  createdAt: string;
}

function mapLocationRow(row: any): MemberLocation {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    userName: row.user_name,
    lat: row.lat,
    lng: row.lng,
    isActive: row.is_active,
    lastUpdated: row.last_updated,
    createdAt: row.created_at,
  };
}

function mapMeetupRow(row: any): MeetupPoint {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    addedBy: row.added_by,
    addedByName: row.added_by_name,
    createdAt: row.created_at,
  };
}

function mapAlertRow(row: any): EmergencyAlert {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    lat: row.lat,
    lng: row.lng,
    resolved: row.resolved,
    createdAt: row.created_at,
  };
}

// Location functions
export async function updateMemberLocation(
  groupId: string,
  userId: string,
  userName: string,
  lat: number,
  lng: number,
  isActive: boolean = true
): Promise<MemberLocation> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_member_locations')
    .upsert({
      group_id: groupId,
      user_id: userId,
      user_name: userName,
      lat,
      lng,
      is_active: isActive,
      last_updated: new Date().toISOString(),
    }, {
      onConflict: 'group_id,user_id',
    })
    .select()
    .single();

  if (error) throw error;
  return mapLocationRow(data);
}

export async function setLocationActive(groupId: string, userId: string, isActive: boolean): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from('group_member_locations')
    .update({ is_active: isActive })
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listMemberLocations(groupId: string): Promise<MemberLocation[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('group_member_locations')
    .select('*')
    .eq('group_id', groupId)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map(mapLocationRow);
}

export function subscribeMemberLocations(
  groupId: string,
  callback: (locations: MemberLocation[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let pollInterval: NodeJS.Timeout | null = null;

  const setup = async () => {
    const supabase = await getAuthenticatedSupabaseClient();
    const initial = await listMemberLocations(groupId);
    callback(initial);

    channel = supabase
      .channel(`member-locations-${groupId}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_member_locations',
        filter: `group_id=eq.${groupId}`,
      }, async () => {
        const latest = await listMemberLocations(groupId);
        callback(latest);
      })
      .subscribe();

    // Polling fallback every 5 seconds
    pollInterval = setInterval(async () => {
      try {
        const latest = await listMemberLocations(groupId);
        callback(latest);
      } catch (err) {
        console.error('Member locations polling error:', err);
      }
    }, 5000);
  };

  setup();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((s) => s.removeChannel(channel as RealtimeChannel));
    }
    if (pollInterval) clearInterval(pollInterval);
  };
}

// Meetup functions
export async function createMeetup(
  groupId: string,
  userId: string,
  userName: string,
  name: string,
  lat: number,
  lng: number
): Promise<MeetupPoint> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_meetups')
    .insert({
      group_id: groupId,
      name,
      lat,
      lng,
      added_by: userId,
      added_by_name: userName,
    })
    .select()
    .single();

  if (error) throw error;
  return mapMeetupRow(data);
}

export async function deleteMeetup(meetupId: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from('group_meetups')
    .delete()
    .eq('id', meetupId);
  if (error) throw error;
}

export async function listMeetups(groupId: string): Promise<MeetupPoint[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('group_meetups')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapMeetupRow);
}

export function subscribeMeetups(
  groupId: string,
  callback: (meetups: MeetupPoint[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let pollInterval: NodeJS.Timeout | null = null;

  const setup = async () => {
    const supabase = await getAuthenticatedSupabaseClient();
    const initial = await listMeetups(groupId);
    callback(initial);

    channel = supabase
      .channel(`meetups-${groupId}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_meetups',
        filter: `group_id=eq.${groupId}`,
      }, async () => {
        const latest = await listMeetups(groupId);
        callback(latest);
      })
      .subscribe();

    // Polling fallback every 5 seconds
    pollInterval = setInterval(async () => {
      try {
        const latest = await listMeetups(groupId);
        callback(latest);
      } catch (err) {
        console.error('Meetups polling error:', err);
      }
    }, 5000);
  };

  setup();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((s) => s.removeChannel(channel as RealtimeChannel));
    }
    if (pollInterval) clearInterval(pollInterval);
  };
}

// Alert functions
export async function createEmergencyAlert(
  groupId: string,
  userId: string,
  userName: string,
  lat: number,
  lng: number
): Promise<EmergencyAlert> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_alerts')
    .insert({
      group_id: groupId,
      sender_id: userId,
      sender_name: userName,
      lat,
      lng,
      resolved: false,
    })
    .select()
    .single();

  if (error) throw error;
  return mapAlertRow(data);
}

export async function resolveAlert(alertId: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { error } = await supabase
    .from('group_alerts')
    .update({ resolved: true })
    .eq('id', alertId);
  if (error) throw error;
}

export async function listActiveAlerts(groupId: string): Promise<EmergencyAlert[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .from('group_alerts')
    .select('*')
    .eq('group_id', groupId)
    .eq('resolved', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapAlertRow);
}

export function subscribeAlerts(
  groupId: string,
  callback: (alerts: EmergencyAlert[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let pollInterval: NodeJS.Timeout | null = null;

  const setup = async () => {
    const supabase = await getAuthenticatedSupabaseClient();
    const initial = await listActiveAlerts(groupId);
    callback(initial);

    channel = supabase
      .channel(`alerts-${groupId}-${Date.now()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'group_alerts',
        filter: `group_id=eq.${groupId}`,
      }, async () => {
        const latest = await listActiveAlerts(groupId);
        callback(latest);
      })
      .subscribe();

    // Polling fallback every 3 seconds (faster for emergencies)
    pollInterval = setInterval(async () => {
      try {
        const latest = await listActiveAlerts(groupId);
        callback(latest);
      } catch (err) {
        console.error('Alerts polling error:', err);
      }
    }, 3000);
  };

  setup();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((s) => s.removeChannel(channel as RealtimeChannel));
    }
    if (pollInterval) clearInterval(pollInterval);
  };
}

