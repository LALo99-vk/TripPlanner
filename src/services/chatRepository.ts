import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ChatMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  messageType: 'text' | 'voice' | 'sos';
  text: string | null;
  voiceUrl: string | null;
  voiceDuration: number | null;
  mentions: string[];
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  // SOS-specific fields
  sosLocation?: {
    lat: number;
    lng: number;
  };
  sosTimestamp?: string;
}

export interface SendMessageData {
  text?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  mentions?: string[];
}

export interface SOSAlertData {
  location: {
    lat: number;
    lng: number;
  };
  timestamp: string;
}

export interface LocationUpdateData {
  location: {
    lat: number;
    lng: number;
  };
  timestamp: string;
  updateNumber: number;
}

/**
 * Send a text or voice message to group chat
 */
export async function sendMessage(
  groupId: string,
  userId: string,
  userName: string,
  data: SendMessageData
): Promise<ChatMessage> {
  const supabase = await getAuthenticatedSupabaseClient();

  const messageType = data.voiceUrl ? 'voice' : 'text';

  const { data: messageData, error } = await supabase
    .from('group_chat_messages')
    .insert({
      group_id: groupId,
      sender_id: userId,
      sender_name: userName,
      message_type: messageType,
      text: data.text || null,
      voice_url: data.voiceUrl || null,
      voice_duration: data.voiceDuration || null,
      mentions: data.mentions || [],
      edited: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    throw error;
  }

  return mapMessageData(messageData);
}

/**
 * Send SOS alert to group chat with location
 */
export async function sendSOSAlert(
  groupId: string,
  userId: string,
  userName: string,
  sosData: SOSAlertData
): Promise<ChatMessage> {
  const supabase = await getAuthenticatedSupabaseClient();

  const locationUrl = `https://www.google.com/maps?q=${sosData.location.lat},${sosData.location.lng}`;
  const alertText = `🆘 EMERGENCY ALERT 🆘\n${userName} has activated SOS!\n📍 Location: ${locationUrl}\n⏰ Time: ${new Date(sosData.timestamp).toLocaleString()}`;

  const { data: messageData, error } = await supabase
    .from('group_chat_messages')
    .insert({
      group_id: groupId,
      sender_id: userId,
      sender_name: userName,
      message_type: 'sos',
      text: alertText,
      voice_url: null,
      voice_duration: null,
      mentions: [], // Mention all members
      edited: false,
      sos_location: sosData.location,
      sos_timestamp: sosData.timestamp,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending SOS alert:', error);
    throw error;
  }

  return mapMessageData(messageData);
}

/**
 * Send location update to group chat (periodic update during active SOS)
 */
export async function sendLocationUpdate(
  groupId: string,
  userId: string,
  userName: string,
  updateData: LocationUpdateData
): Promise<ChatMessage> {
  const supabase = await getAuthenticatedSupabaseClient();

  const locationUrl = `https://www.google.com/maps?q=${updateData.location.lat},${updateData.location.lng}`;
  const alertText = `📍 LOCATION UPDATE #${updateData.updateNumber}\n${userName}'s current location\n📍 ${locationUrl}\n⏰ ${new Date(updateData.timestamp).toLocaleString()}`;

  const { data: messageData, error } = await supabase
    .from('group_chat_messages')
    .insert({
      group_id: groupId,
      sender_id: userId,
      sender_name: userName,
      message_type: 'sos', // Still use 'sos' type for styling
      text: alertText,
      voice_url: null,
      voice_duration: null,
      mentions: [],
      edited: false,
      sos_location: updateData.location,
      sos_timestamp: updateData.timestamp,
    })
    .select()
    .single();

  if (error) {
    console.error('Error sending location update:', error);
    throw error;
  }

  return mapMessageData(messageData);
}

/**
 * Get all messages for a group
 */
export async function getGroupMessages(groupId: string): Promise<ChatMessage[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_chat_messages')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }

  return (data || []).map(mapMessageData);
}

/**
 * Edit a message
 */
export async function editMessage(
  messageId: string,
  newText: string,
  userId: string
): Promise<ChatMessage> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data: messageData, error } = await supabase
    .from('group_chat_messages')
    .update({
      text: newText,
      edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .eq('sender_id', userId) // Only sender can edit
    .select()
    .single();

  if (error) {
    console.error('Error editing message:', error);
    throw error;
  }

  return mapMessageData(messageData);
}

/**
 * Delete a message (leader can delete any, sender can delete their own)
 */
export async function deleteMessage(
  messageId: string,
  userId: string,
  isLeader: boolean
): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  let query = supabase
    .from('group_chat_messages')
    .delete()
    .eq('id', messageId);

  // If not leader, only allow deleting own messages
  if (!isLeader) {
    query = query.eq('sender_id', userId);
  }

  const { error } = await query;

  if (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
}

/**
 * Upload voice message - converts to base64 for storage in database
 * (Supabase Storage can be configured later for better performance)
 */
export async function uploadVoiceMessage(
  groupId: string,
  userId: string,
  audioBlob: Blob
): Promise<string> {
  // Convert blob to base64 data URL for storage in database
  // This works immediately without needing Supabase Storage setup
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read audio file'));
    };
    reader.readAsDataURL(audioBlob);
  });
}

/**
 * Subscribe to group chat messages (real-time)
 */
export function subscribeGroupChat(
  groupId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let messagesSnapshot: ChatMessage[] = [];
  let isSubscribed = false;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial messages
    messagesSnapshot = await getGroupMessages(groupId);
    callback(messagesSnapshot);

    // Subscribe to changes (delta-based for faster UI)
    channel = supabase.channel(`group-chat-${groupId}-${Date.now()}`);

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_chat_messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => {
          console.log('📨 New message received:', payload.new?.id);
          const msg = mapMessageData(payload.new);
          // Check if message already exists (avoid duplicates from optimistic update)
          if (!messagesSnapshot.some(m => m.id === msg.id)) {
            messagesSnapshot = [...messagesSnapshot, msg];
            callback(messagesSnapshot);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_chat_messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => {
          const updated = mapMessageData(payload.new);
          const idx = messagesSnapshot.findIndex((m) => m.id === updated.id);
          if (idx !== -1) {
            const next = [...messagesSnapshot];
            next[idx] = updated;
            messagesSnapshot = next;
            callback(messagesSnapshot);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'group_chat_messages', filter: `group_id=eq.${groupId}` },
        (payload: any) => {
          const id = payload.old?.id as string;
          messagesSnapshot = messagesSnapshot.filter((m) => m.id !== id);
          callback(messagesSnapshot);
        }
      )
      .subscribe((status) => {
        console.log(`📡 Chat subscription status for ${groupId}:`, status);
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
        }
      });
  };

  setupSubscription();

  // Return unsubscribe function
  return () => {
    if (channel) {
      console.log(`📴 Unsubscribing from chat ${groupId}`);
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
  };
}

/**
 * Add a message to existing subscription (for optimistic updates)
 */
export function addOptimisticMessage(
  messages: ChatMessage[],
  newMessage: Partial<ChatMessage>
): ChatMessage[] {
  const optimisticMsg: ChatMessage = {
    id: `temp-${Date.now()}`,
    groupId: newMessage.groupId || '',
    senderId: newMessage.senderId || '',
    senderName: newMessage.senderName || '',
    messageType: newMessage.messageType || 'text',
    text: newMessage.text || null,
    voiceUrl: null,
    voiceDuration: null,
    mentions: [],
    edited: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [...messages, optimisticMsg];
}

/**
 * Helper function to map database row to ChatMessage interface
 */
function mapMessageData(data: any): ChatMessage {
  return {
    id: data.id,
    groupId: data.group_id,
    senderId: data.sender_id,
    senderName: data.sender_name,
    messageType: data.message_type,
    text: data.text,
    voiceUrl: data.voice_url,
    voiceDuration: data.voice_duration,
    mentions: data.mentions || [],
    edited: data.edited,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    sosLocation: data.sos_location,
    sosTimestamp: data.sos_timestamp,
  };
}

