/**
 * SOS Session Service
 * Manages SOS session tracking and acknowledgements
 */

const API_BASE_URL = 'http://localhost:3001/api';

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface Acknowledgement {
  id: string;
  contactName: string;
  contactPhone: string;
  responseType: 'safe' | 'on_my_way' | 'received' | 'other';
  responseMessage: string;
  acknowledgedAt: string;
}

export interface SOSSession {
  id: string;
  userId: string;
  userName: string;
  groupId?: string;
  status: 'active' | 'resolved' | 'cancelled';
  startedAt: string;
  endedAt?: string;
  lastLocation?: {
    lat: number;
    lng: number;
  };
  lastLocationUpdate?: string;
  locationUpdateCount: number;
  emergencyContacts: EmergencyContact[];
  acknowledgements: Acknowledgement[];
}

/**
 * Create a new SOS session
 */
export async function createSOSSession(
  userId: string,
  userName: string,
  groupId: string | null,
  location: { lat: number; lng: number },
  emergencyContacts: EmergencyContact[]
): Promise<SOSSession> {
  const response = await fetch(`${API_BASE_URL}/sos/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId,
      userName,
      groupId,
      location,
      emergencyContacts,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || 'Failed to create SOS session');
  }

  return result.session;
}

/**
 * Get SOS session status
 */
export async function getSOSSession(sessionId: string): Promise<SOSSession | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/sos/session/${sessionId}`);
    const result = await response.json();

    if (!response.ok) {
      return null;
    }

    return result.session;
  } catch (error) {
    console.error('Error fetching SOS session:', error);
    return null;
  }
}

/**
 * Cancel SOS session
 */
export async function cancelSOSSession(sessionId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/sos/session/${sessionId}/cancel`, {
      method: 'POST',
    });

    return response.ok;
  } catch (error) {
    console.error('Error cancelling SOS session:', error);
    return false;
  }
}

/**
 * Get acknowledgements for a session
 */
export async function getAcknowledgements(sessionId: string): Promise<Acknowledgement[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/sos/session/${sessionId}/acknowledgements`);
    const result = await response.json();

    if (!response.ok) {
      return [];
    }

    return result.acknowledgements || [];
  } catch (error) {
    console.error('Error fetching acknowledgements:', error);
    return [];
  }
}

/**
 * Get response type display text
 */
export function getResponseTypeDisplay(responseType: string): { text: string; emoji: string; color: string } {
  switch (responseType) {
    case 'safe':
      return { text: 'Help is coming!', emoji: '🆘', color: 'text-green-400' };
    case 'on_my_way':
      return { text: 'On the way to help!', emoji: '🚗', color: 'text-blue-400' };
    case 'received':
      return { text: 'Alert received, staying alert', emoji: '📨', color: 'text-yellow-400' };
    default:
      return { text: 'Acknowledged', emoji: '💬', color: 'text-gray-400' };
  }
}

/**
 * Format acknowledgement time
 */
export function formatAckTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min ago`;
  } else {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
}
