# Professional Invite Member System - How It Works

## Overview
A professional invite member system provides secure, trackable, and user-friendly invitations with email notifications, token-based links, and proper invitation management.

---

## 🔄 Complete Invitation Flow

### **Step 1: Leader Initiates Invitation**

**UI Flow:**
1. Leader clicks "Invite Member" button
2. Modal opens with two options:
   - **Email Invitation** (send email directly)
   - **Share Link** (copy invite link)

**Email Invitation:**
```
┌─────────────────────────────────────┐
│  Invite Member                      │
├─────────────────────────────────────┤
│  [Email Input]                      │
│  Enter email address...             │
│                                     │
│  [Optional: Custom Message]         │
│  "Hey! Join our trip to Goa..."    │
│                                     │
│  [Send Invitation] [Cancel]        │
└─────────────────────────────────────┘
```

**Share Link:**
```
┌─────────────────────────────────────┐
│  Share Invite Link                  │
├─────────────────────────────────────┤
│  https://app.com/join?token=abc123  │
│  [Copy Link]                        │
│                                     │
│  Share via:                         │
│  [WhatsApp] [Email] [Copy]         │
└─────────────────────────────────────┘
```

---

### **Step 2: Backend Processing**

When leader sends invitation:

**1. Generate Secure Invite Token**
```typescript
// Generate unique, secure token
const inviteToken = crypto.randomUUID(); // or use JWT
// Example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**2. Create Invitation Record**
```sql
INSERT INTO group_invitations (
  id,
  group_id,
  invitee_email,
  invited_by_id,
  invited_by_name,
  invite_token,
  status,              -- 'pending', 'accepted', 'expired', 'cancelled'
  expires_at,          -- 7 days from now
  created_at
) VALUES (...);
```

**3. Send Email Notification**
```typescript
// Email service (SendGrid, AWS SES, Resend, etc.)
await sendInviteEmail({
  to: inviteeEmail,
  subject: "You're invited to join a trip!",
  template: 'group-invitation',
  data: {
    inviterName: leaderName,
    groupName: groupName,
    destination: destination,
    inviteLink: `https://app.com/join?token=${inviteToken}`,
    expiresIn: "7 days"
  }
});
```

---

### **Step 3: Email Template**

**Professional Email Design:**
```
┌─────────────────────────────────────────────┐
│  [Logo] TripPlanner                         │
├─────────────────────────────────────────────┤
│                                             │
│  Hi there!                                  │
│                                             │
│  John Doe invited you to join:              │
│                                             │
│  🏖️  Goa Beach Trip                        │
│  📍  Goa, India                             │
│  📅  Dec 15-20, 2024                        │
│                                             │
│  [Accept Invitation] (Button)              │
│                                             │
│  Or copy this link:                         │
│  https://app.com/join?token=abc123         │
│                                             │
│  This invitation expires in 7 days.         │
│                                             │
│  If you didn't expect this, ignore it.      │
└─────────────────────────────────────────────┘
```

---

### **Step 4: User Receives & Clicks Invitation**

**Two Scenarios:**

#### **Scenario A: User Already Has Account**
1. User clicks invite link → Redirected to `/join?token=abc123`
2. System validates token:
   ```typescript
   // Check if token is valid
   const invitation = await getInvitationByToken(token);
   
   if (!invitation) {
     return "Invalid invitation link";
   }
   
   if (invitation.status !== 'pending') {
     return "Invitation already used or expired";
   }
   
   if (invitation.expires_at < new Date()) {
     return "Invitation has expired";
   }
   ```
3. User is logged in → Automatically added to group
4. Redirect to group page with success message

#### **Scenario B: User Doesn't Have Account**
1. User clicks invite link → Redirected to `/join?token=abc123`
2. System validates token (same as above)
3. User sees signup/login page with pre-filled email:
   ```
   ┌─────────────────────────────────────┐
   │  Join Trip: Goa Beach Trip          │
   ├─────────────────────────────────────┤
   │  You've been invited by John Doe    │
   │                                     │
   │  Email: [user@example.com] (prefill)│
   │  Password: [________]                │
   │                                     │
   │  [Create Account & Join]            │
   │  [Already have account? Login]      │
   └─────────────────────────────────────┘
   ```
4. After signup/login → Automatically added to group
5. Redirect to group page

---

### **Step 5: Accepting Invitation**

**Backend Process:**
```typescript
async function acceptInvitation(token: string, userId: string) {
  // 1. Validate invitation
  const invitation = await validateInvitationToken(token);
  
  // 2. Check if user is already a member
  const group = await getGroup(invitation.group_id);
  const isAlreadyMember = group.members.some(m => m.uid === userId);
  
  if (isAlreadyMember) {
    return { success: false, message: "Already a member" };
  }
  
  // 3. Add user to group
  await addMemberToGroup(
    invitation.group_id,
    userId,
    user.name,
    user.email
  );
  
  // 4. Update invitation status
  await updateInvitationStatus(invitation.id, 'accepted');
  
  // 5. Create member record in group_members table
  await ensureGroupMemberRecords(invitation.group_id, [newMember]);
  
  // 6. Send notification to leader
  await notifyLeader({
    message: `${user.name} joined your group!`,
    groupId: invitation.group_id
  });
  
  return { success: true, groupId: invitation.group_id };
}
```

---

## 📊 Database Schema

### **New Table: `group_invitations`**

```sql
CREATE TABLE group_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invited_by_id TEXT NOT NULL, -- Firebase Auth UID of leader
  invited_by_name TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE, -- Secure token for invite link
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'declined')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  accepted_by_id TEXT, -- User who accepted (if different from invitee_email)
  custom_message TEXT, -- Optional message from leader
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_invitations_token ON group_invitations(invite_token);
CREATE INDEX idx_invitations_group_id ON group_invitations(group_id);
CREATE INDEX idx_invitations_email ON group_invitations(invitee_email);
CREATE INDEX idx_invitations_status ON group_invitations(status) WHERE status = 'pending';

-- RLS Policies
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders can manage invitations"
  ON group_invitations FOR ALL
  USING (
    invited_by_id = auth.uid()::TEXT
    OR auth.uid()::TEXT IN (
      SELECT leader_id FROM groups WHERE id = group_invitations.group_id
    )
  );

CREATE POLICY "Users can view their own invitations"
  ON group_invitations FOR SELECT
  USING (
    invitee_email = (SELECT email FROM users WHERE id = auth.uid()::TEXT)
    OR accepted_by_id = auth.uid()::TEXT
  );
```

---

## 🔐 Security Features

### **1. Token Security**
- **Unique tokens**: Each invitation gets a unique UUID or JWT
- **Expiration**: Tokens expire after 7 days (configurable)
- **One-time use**: Token becomes invalid after acceptance
- **Rate limiting**: Prevent spam invitations

### **2. Validation Checks**
```typescript
function validateInvitation(invitation) {
  // Check expiration
  if (invitation.expires_at < new Date()) {
    return { valid: false, reason: 'expired' };
  }
  
  // Check status
  if (invitation.status !== 'pending') {
    return { valid: false, reason: 'already_used' };
  }
  
  // Check if group still exists
  if (!groupExists(invitation.group_id)) {
    return { valid: false, reason: 'group_deleted' };
  }
  
  // Check if user is already a member
  if (isAlreadyMember(invitation.group_id, userId)) {
    return { valid: false, reason: 'already_member' };
  }
  
  return { valid: true };
}
```

### **3. Email Verification**
- Verify email format before sending
- Check if email is already registered
- Prevent duplicate invitations to same email

---

## 🎨 UI Components

### **1. Invite Modal (Enhanced)**
```typescript
<InviteModal>
  <Tabs>
    <Tab name="Email">
      <EmailInput />
      <CustomMessage />
      <SendButton />
    </Tab>
    <Tab name="Link">
      <InviteLink />
      <ShareButtons />
    </Tab>
  </Tabs>
  
  <PendingInvitations>
    {pendingInvites.map(invite => (
      <InviteCard
        email={invite.email}
        sentAt={invite.created_at}
        status={invite.status}
        onResend={() => resendInvitation(invite.id)}
        onCancel={() => cancelInvitation(invite.id)}
      />
    ))}
  </PendingInvitations>
</InviteModal>
```

### **2. Pending Invitations List**
```
┌─────────────────────────────────────┐
│  Pending Invitations (3)            │
├─────────────────────────────────────┤
│  📧 user1@example.com               │
│     Sent 2 days ago                 │
│     [Resend] [Cancel]               │
├─────────────────────────────────────┤
│  📧 user2@example.com               │
│     Sent 1 hour ago                 │
│     [Resend] [Cancel]               │
└─────────────────────────────────────┘
```

### **3. Invitation Status Badges**
- 🟡 **Pending**: Waiting for acceptance
- 🟢 **Accepted**: User joined
- 🔴 **Expired**: Link expired
- ⚫ **Cancelled**: Leader cancelled
- ⚪ **Declined**: User declined

---

## 📧 Email Service Integration

### **Using Resend (Recommended)**
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendInviteEmail(invitation: Invitation) {
  await resend.emails.send({
    from: 'TripPlanner <invites@tripplanner.com>',
    to: invitation.invitee_email,
    subject: `You're invited to join ${invitation.group_name}!`,
    react: InviteEmailTemplate({
      inviterName: invitation.invited_by_name,
      groupName: invitation.group_name,
      destination: invitation.destination,
      inviteLink: `https://app.com/join?token=${invitation.invite_token}`,
    }),
  });
}
```

### **Email Template (React Email)**
```typescript
import { Html, Head, Body, Container, Button, Text } from '@react-email/components';

export function InviteEmailTemplate({ inviterName, groupName, inviteLink }) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>You're Invited!</Text>
          <Text>
            {inviterName} invited you to join <strong>{groupName}</strong>
          </Text>
          <Button href={inviteLink} style={button}>
            Accept Invitation
          </Button>
          <Text style={footer}>
            This link expires in 7 days.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

---

## 🔄 Real-time Updates

### **WebSocket/Realtime Notifications**
```typescript
// When invitation is accepted
supabase
  .channel(`group-${groupId}`)
  .send({
    type: 'broadcast',
    event: 'member_joined',
    payload: {
      userId: newMember.uid,
      userName: newMember.name,
      viaInvitation: true
    }
  });
```

---

## 📱 Mobile App Support

### **Deep Linking**
```
// iOS
tripplanner://join?token=abc123

// Android
intent://join?token=abc123#Intent;scheme=tripplanner;end
```

---

## 🎯 Key Features Summary

✅ **Secure token-based invitations**
✅ **Email notifications with beautiful templates**
✅ **Pending invitations tracking**
✅ **Expiration management (7 days default)**
✅ **One-time use tokens**
✅ **Resend/cancel functionality**
✅ **Status tracking (pending/accepted/expired)**
✅ **Automatic member addition on acceptance**
✅ **Real-time notifications**
✅ **Mobile deep linking support**
✅ **Rate limiting to prevent spam**
✅ **Email verification**

---

## 🚀 Implementation Priority

1. **Phase 1: Basic Invitations**
   - Database schema
   - Token generation
   - Basic invite link sharing

2. **Phase 2: Email Integration**
   - Email service setup
   - Email templates
   - Email sending

3. **Phase 3: Enhanced Features**
   - Pending invitations UI
   - Resend/cancel functionality
   - Status tracking
   - Real-time updates

4. **Phase 4: Advanced**
   - Bulk invitations
   - Custom messages
   - Analytics
   - Mobile deep linking

---

This system provides a professional, secure, and user-friendly way to invite members to groups with proper tracking, notifications, and management capabilities.

