import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type BookingType = 'flight' | 'train' | 'bus' | 'hotel';

export interface GroupBookingSelection {
  id: string;
  groupId: string;
  dayNumber: number;
  bookingType: BookingType;
  selectedOption: unknown;
  selectedBy: string | null;
  selectedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapBookingRow(row: any): GroupBookingSelection {
  return {
    id: row.id,
    groupId: row.group_id,
    dayNumber: row.day_number,
    bookingType: row.booking_type,
    selectedOption: row.selected_option,
    selectedBy: row.selected_by,
    selectedByName: row.selected_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getGroupBookings(groupId: string): Promise<GroupBookingSelection[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_bookings')
    .select('*')
    .eq('group_id', groupId)
    .order('day_number', { ascending: true });

  if (error) {
    console.error('Error fetching group bookings:', error);
    return [];
  }

  return (data ?? []).map(mapBookingRow);
}

export async function upsertGroupBookingSelection(params: {
  groupId: string;
  dayNumber: number;
  bookingType: BookingType;
  selectedOption: unknown;
  userId?: string | null;
  userName?: string | null;
}): Promise<GroupBookingSelection | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_bookings')
    .upsert(
      {
        group_id: params.groupId,
        day_number: params.dayNumber,
        booking_type: params.bookingType,
        selected_option: params.selectedOption,
        selected_by: params.userId ?? null,
        selected_by_name: params.userName ?? null,
      },
      {
        onConflict: 'group_id,day_number,booking_type',
      }
    )
    .select('*')
    .single();

  if (error) {
    console.error('Error saving booking selection:', error);
    throw error;
  }

  return data ? mapBookingRow(data) : null;
}

export async function subscribeToGroupBookings(
  groupId: string,
  callback: (booking: GroupBookingSelection) => void
): Promise<() => void> {
  const supabase = await getAuthenticatedSupabaseClient();

  const channel: RealtimeChannel = supabase.channel(`group_bookings_${groupId}`);

  channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'group_bookings',
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        if (payload.new) {
          callback(mapBookingRow(payload.new));
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}


