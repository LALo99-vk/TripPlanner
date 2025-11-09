import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { AiTripPlanData, AiPlanDay, AiPlanSlotItem } from './api';

export interface ActivityLocation {
  name?: string;
  lat?: number;
  lng?: number;
}

export interface GroupItineraryActivity {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  ownerId: string;
  ownerName: string;
  lastEditedBy: string;
  lastEditedAt: string;
  location: ActivityLocation | null;
  orderIndex: number;
  importedFromUser: boolean;
  sourcePlanId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityData {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: ActivityLocation;
}

export interface UpdateActivityData extends Partial<CreateActivityData> {}

/**
 * Create a new activity in group itinerary
 */
export async function createActivity(
  groupId: string,
  userId: string,
  userName: string,
  data: CreateActivityData
): Promise<GroupItineraryActivity> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Get current max order_index for this date to set next order
  const { data: existingActivities } = await supabase
    .from('group_itinerary_activities')
    .select('order_index')
    .eq('group_id', groupId)
    .eq('date', data.date)
    .order('order_index', { ascending: false })
    .limit(1);

  const nextOrderIndex = existingActivities && existingActivities.length > 0
    ? (existingActivities[0].order_index as number) + 1
    : 0;

  const { data: activityData, error } = await supabase
    .from('group_itinerary_activities')
    .insert({
      group_id: groupId,
      title: data.title,
      description: data.description || null,
      date: data.date,
      start_time: data.startTime || null,
      end_time: data.endTime || null,
      owner_id: userId,
      owner_name: userName,
      last_edited_by: userId,
      location: data.location || null,
      order_index: nextOrderIndex,
      imported_from_user: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating activity:', error);
    throw error;
  }

  return mapActivityData(activityData);
}

/**
 * Get all activities for a group
 */
export async function getGroupActivities(groupId: string): Promise<GroupItineraryActivity[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_itinerary_activities')
    .select('*')
    .eq('group_id', groupId)
    .order('date', { ascending: true })
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error fetching activities:', error);
    return [];
  }

  return (data || []).map(mapActivityData);
}

/**
 * Update an activity
 */
export async function updateActivity(
  activityId: string,
  userId: string,
  data: UpdateActivityData
): Promise<GroupItineraryActivity> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data: activityData, error } = await supabase
    .from('group_itinerary_activities')
    .update({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description || null }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.startTime !== undefined && { start_time: data.startTime || null }),
      ...(data.endTime !== undefined && { end_time: data.endTime || null }),
      ...(data.location !== undefined && { location: data.location || null }),
      last_edited_by: userId,
      last_edited_at: new Date().toISOString(),
    })
    .eq('id', activityId)
    .select()
    .single();

  if (error) {
    console.error('Error updating activity:', error);
    throw error;
  }

  return mapActivityData(activityData);
}

/**
 * Delete an activity
 */
export async function deleteActivity(activityId: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { error } = await supabase
    .from('group_itinerary_activities')
    .delete()
    .eq('id', activityId);

  if (error) {
    console.error('Error deleting activity:', error);
    throw error;
  }
}

/**
 * Import activities from a user's plan into group itinerary
 */
export async function importPlanToGroupItinerary(
  groupId: string,
  userId: string,
  userName: string,
  plan: AiTripPlanData,
  planId: string,
  groupStartDate?: string
): Promise<number> {
  const supabase = await getAuthenticatedSupabaseClient();
  let importedCount = 0;

  // Get group start date if not provided
  let baseDate: Date;
  if (groupStartDate) {
    baseDate = new Date(groupStartDate);
  } else {
    // Fetch group to get start date
    const { data: groupData } = await supabase
      .from('groups')
      .select('start_date')
      .eq('id', groupId)
      .single();
    
    if (groupData?.start_date) {
      baseDate = new Date(groupData.start_date);
    } else {
      baseDate = new Date(); // Fallback to today
    }
  }

  // Extract activities from plan days
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex++) {
    const day = plan.days[dayIndex];
    
    // Calculate date for this day
    // If day has a date, use it; otherwise calculate from group start date
    let date: string;
    if (day.date) {
      date = day.date;
    } else {
      // Calculate date based on day number and group start date
      const dayDate = new Date(baseDate);
      dayDate.setDate(baseDate.getDate() + day.day - 1);
      date = dayDate.toISOString().split('T')[0];
    }
    
    // Process morning, afternoon, evening slots
    const allSlots: Array<{ slot: AiPlanSlotItem; time: string }> = [];
    
    if (day.slots.morning) {
      day.slots.morning.forEach(slot => {
        allSlots.push({ slot, time: slot.time || '' });
      });
    }
    if (day.slots.afternoon) {
      day.slots.afternoon.forEach(slot => {
        allSlots.push({ slot, time: slot.time || '' });
      });
    }
    if (day.slots.evening) {
      day.slots.evening.forEach(slot => {
        allSlots.push({ slot, time: slot.time || '' });
      });
    }

    // Sort by time
    allSlots.sort((a, b) => {
      const timeA = a.time || '';
      const timeB = b.time || '';
      return timeA.localeCompare(timeB);
    });

    // Create activities for each slot
    for (let i = 0; i < allSlots.length; i++) {
      const { slot } = allSlots[i];
      
      // Parse time to get start and end time
      const timeStr = slot.time || '';
      const [startTime, endTime] = parseTimeRange(timeStr, slot.duration);

      // Extract location if available
      const location: ActivityLocation | null = slot.location
        ? { name: slot.location }
        : null;

      const { error } = await supabase
        .from('group_itinerary_activities')
        .insert({
          group_id: groupId,
          title: slot.name,
          description: slot.description || null,
          date: date,
          start_time: startTime,
          end_time: endTime,
          owner_id: userId,
          owner_name: userName,
          last_edited_by: userId,
          location: location,
          order_index: i,
          imported_from_user: true,
          source_plan_id: planId,
        });

      if (!error) {
        importedCount++;
      } else {
        console.error('Error importing activity:', error);
      }
    }
  }

  return importedCount;
}

/**
 * Helper function to parse time range from time string and duration
 */
function parseTimeRange(timeStr: string, duration: string): [string | null, string | null] {
  if (!timeStr) return [null, null];

  // Try to parse time like "09:00" or "9:00 AM"
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return [timeStr, null];

  const hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  
  // Try to parse duration like "2 hours" or "30 minutes"
  let durationMinutes = 0;
  const durationMatch = duration.match(/(\d+)/);
  if (durationMatch) {
    const durationNum = parseInt(durationMatch[1]);
    if (duration.includes('hour')) {
      durationMinutes = durationNum * 60;
    } else if (duration.includes('minute')) {
      durationMinutes = durationNum;
    }
  }

  // Calculate end time
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  
  const startTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

  return [startTime, endTime];
}

/**
 * Subscribe to group itinerary activities (real-time)
 */
export function subscribeGroupItinerary(
  groupId: string,
  callback: (activities: GroupItineraryActivity[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial activities
    const initialActivities = await getGroupActivities(groupId);
    callback(initialActivities);

    // Subscribe to changes
    channel = supabase
      .channel(`group-itinerary-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_itinerary_activities',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updatedActivities = await getGroupActivities(groupId);
          callback(updatedActivities);
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
 * Helper function to map database row to GroupItineraryActivity interface
 */
function mapActivityData(data: any): GroupItineraryActivity {
  return {
    id: data.id,
    groupId: data.group_id,
    title: data.title,
    description: data.description,
    date: data.date,
    startTime: data.start_time,
    endTime: data.end_time,
    ownerId: data.owner_id,
    ownerName: data.owner_name,
    lastEditedBy: data.last_edited_by,
    lastEditedAt: data.last_edited_at,
    location: data.location,
    orderIndex: data.order_index,
    importedFromUser: data.imported_from_user,
    sourcePlanId: data.source_plan_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

