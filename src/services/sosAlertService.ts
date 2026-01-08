/**
 * SOS Alert Service
 * Handles sending emergency alerts via SMS using TextBee
 * 
 * NOTE: Emergency ringtone/tune must be set on the recipient's phone:
 * - iOS: Settings > Contacts > Select Contact > Ringtone/Text Tone
 * - Android: Contacts > Select Contact > Set Ringtone/Notification Sound
 */

// API Base URL (same as used by apiService)
const API_BASE_URL = 'http://localhost:3001/api';

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface SOSAlertPayload {
  userName: string;
  location: {
    lat: number;
    lng: number;
  };
  timestamp: string;
  emergencyContacts: EmergencyContact[];
}

export interface LocationUpdatePayload {
  userName: string;
  location: {
    lat: number;
    lng: number;
  };
  timestamp: string;
  updateNumber: number;
  emergencyContacts: EmergencyContact[];
}

/**
 * Normalize phone number to E.164 format (required by Twilio)
 * Ensures phone number has country code
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // If it doesn't start with +, assume it's missing country code
  if (!normalized.startsWith('+')) {
    // If it starts with 91 (India), add +
    if (normalized.startsWith('91')) {
      normalized = '+' + normalized;
    }
    // If it starts with 1 (US/Canada), add +
    else if (normalized.startsWith('1') && normalized.length === 11) {
      normalized = '+' + normalized;
    }
    // Otherwise, default to India (+91)
    else {
      normalized = '+91' + normalized;
    }
  }
  
  console.log(`📞 Phone normalized: ${phone} → ${normalized}`);
  return normalized;
}

/**
 * Send SOS alert via SMS (calls backend TextBee API)
 * Backend handles TextBee credentials and message delivery
 */
export async function sendSMSAlert(contact: EmergencyContact, alertData: SOSAlertPayload): Promise<void> {
  const locationUrl = `https://www.google.com/maps?q=${alertData.location.lat},${alertData.location.lng}`;
  const dateTime = new Date(alertData.timestamp).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  
  // New emergency template
  const message = `🚨 EMERGENCY ALERT

${alertData.userName} may need immediate help.

Last known location:
${locationUrl}

Time: ${dateTime}

This message was sent from the Trip Planner safety system.
Please contact them as soon as possible.`;

  // Normalize phone number to E.164 format
  const normalizedPhone = normalizePhoneNumber(contact.phone);
  
  console.log(`📱 Sending SMS to ${contact.name} (${normalizedPhone})...`);

  try {
    // Call backend endpoint to send SMS automatically via TextBee
    const response = await fetch(`${API_BASE_URL}/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: normalizedPhone,
        message: message,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `SMS API error: ${response.status}`);
    }

    console.log(`✅ SMS sent to ${contact.name} (${normalizedPhone})`);
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${contact.name}:`, error);
    throw error;
  }
}

/**
 * Send SOS alert via WhatsApp (DISABLED - SMS only)
 * WhatsApp functionality removed per user request
 */
export async function sendWhatsAppAlert(contact: EmergencyContact, alertData: SOSAlertPayload): Promise<void> {
  console.log(`⚠️ WhatsApp disabled. Only SMS will be sent to ${contact.name}.`);
  // WhatsApp functionality disabled - SMS only
  return Promise.resolve();
}

/**
 * Send SMS to all emergency contacts
 */
export async function sendSMSToAllContacts(alertData: SOSAlertPayload): Promise<void> {
  const promises = alertData.emergencyContacts.map(contact => 
    sendSMSAlert(contact, alertData).catch(err => {
      console.error(`Failed to send SMS to ${contact.name}:`, err);
      return null; // Don't fail the entire batch
    })
  );

  await Promise.all(promises);
  console.log(`✅ SMS alerts sent to ${alertData.emergencyContacts.length} contacts`);
}

/**
 * Send WhatsApp to all emergency contacts
 */
export async function sendWhatsAppToAllContacts(alertData: SOSAlertPayload): Promise<void> {
  const promises = alertData.emergencyContacts.map(contact => 
    sendWhatsAppAlert(contact, alertData).catch(err => {
      console.error(`Failed to send WhatsApp to ${contact.name}:`, err);
      return null; // Don't fail the entire batch
    })
  );

  await Promise.all(promises);
  console.log(`✅ WhatsApp alerts sent to ${alertData.emergencyContacts.length} contacts`);
}

/**
 * Complete SOS alert flow - sends SMS only
 * WhatsApp disabled per user request
 */
export async function sendCompleteSOSAlert(alertData: SOSAlertPayload): Promise<void> {
  console.log('🚨 Sending SOS SMS to emergency contacts...');
  
  try {
    // Send SMS only (WhatsApp disabled)
    await sendSMSToAllContacts(alertData);
    
    console.log('✅ SMS alert sent successfully');
  } catch (error) {
    console.error('❌ Error sending SMS alert:', error);
    throw error;
  }
}

/**
 * Send location update SMS to emergency contacts
 * Sent periodically (every 5 minutes) during active SOS
 */
export async function sendLocationUpdateSMS(updateData: LocationUpdatePayload): Promise<void> {
  const locationUrl = `https://www.google.com/maps?q=${updateData.location.lat},${updateData.location.lng}`;
  const dateTime = new Date(updateData.timestamp).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  
  // Location update template
  const message = `📍 LOCATION UPDATE #${updateData.updateNumber}

${updateData.userName}'s current location:
${locationUrl}

Time: ${dateTime}

SOS is still active. Updates sent every 3 mins.`;

  console.log(`📍 Sending location update #${updateData.updateNumber} SMS...`);

  const promises = updateData.emergencyContacts.map(async (contact) => {
    const normalizedPhone = normalizePhoneNumber(contact.phone);
    
    try {
      const response = await fetch(`${API_BASE_URL}/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: normalizedPhone,
          message: message,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `SMS API error: ${response.status}`);
      }

      console.log(`✅ Location update SMS sent to ${contact.name}`);
    } catch (error) {
      console.error(`❌ Failed to send location update to ${contact.name}:`, error);
    }
  });

  await Promise.all(promises);
  console.log(`✅ Location update #${updateData.updateNumber} sent to all contacts`);
}
