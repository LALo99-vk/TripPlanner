# Supabase Migration Guide

This guide will help you migrate from Firebase Firestore to Supabase PostgreSQL while keeping Firebase Authentication.

## 📋 Prerequisites

1. **Supabase Account**: Sign up at https://supabase.com
2. **Firebase Auth**: Keep your existing Firebase Auth setup (we'll only replace Firestore)

## 🔑 Step 1: Get Supabase Credentials

1. Go to https://app.supabase.com
2. Create a new project (or use existing)
3. Wait for the project to finish provisioning (~2 minutes)
4. Go to **Settings** → **API**
5. Copy these values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## 📝 Step 2: Add Environment Variables

Add these to your `.env` file in the `TripPlanner` directory:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Optional: Service role key for authenticated operations (see Step 4)
# ⚠️ Keep this SECRET! Only use in development or with proper security measures
VITE_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Important**: 
- Restart your dev server after adding these!
- Never commit `.env` file to git (it should be in `.gitignore`)

## 🗄️ Step 3: Set Up Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase-schema.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify tables were created: Go to **Table Editor** → You should see:
   - `users`
   - `plans`
   - `user_metadata`
   - `posts`

## 🔐 Step 4: Configure Authentication (IMPORTANT!)

Since we're using **Firebase Auth** but **Supabase** for storage, we need to handle authentication carefully.

### ⚠️ The Challenge

Supabase RLS (Row Level Security) uses `auth.uid()` which expects Supabase JWT tokens. Since we're using Firebase Auth, Supabase won't automatically verify Firebase tokens.

### Solution Options

#### Option A: Use Service Role Key (Quick Start - Less Secure)

**For development/testing**, you can use Supabase's service role key which bypasses RLS:

1. In Supabase Dashboard → **Settings** → **API**
2. Copy the **service_role** key (⚠️ Keep this SECRET!)
3. Add to your `.env`:
   ```env
   VITE_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
4. **Security Note**: The service role key bypasses RLS. Make sure your application code always verifies `user_id` matches the Firebase Auth UID before any database operations.

**Pros**: Works immediately, no additional setup  
**Cons**: Less secure, requires careful application-level auth checks

#### Option B: Configure Firebase Token Verification (Recommended for Production)

For production, you should configure Supabase to verify Firebase tokens:

1. **Backend Setup Required**: Create a backend endpoint that:
   - Receives Firebase tokens from the client
   - Verifies tokens using Firebase Admin SDK
   - Issues Supabase-compatible JWTs

2. **Or use Supabase Edge Functions**: Create a function that verifies Firebase tokens and returns Supabase tokens

3. **Update RLS Policies**: Once tokens are verified, RLS policies using `auth.uid()` will work properly

**Pros**: More secure, proper RLS enforcement  
**Cons**: Requires backend setup

### Current Implementation

The code currently uses **Option A** (service role key) with application-level auth checks. All database operations verify that `user_id` matches the Firebase Auth UID.

## 📦 Step 5: Install Supabase Client

```bash
cd TripPlanner
npm install @supabase/supabase-js
```

## 🔄 Step 6: Migration Checklist

- [x] Supabase config file created (`src/config/supabase.ts`)
- [ ] Database schema applied
- [ ] Environment variables added
- [ ] Supabase package installed
- [ ] `planRepository.ts` updated to use Supabase
- [ ] `useAuth.ts` updated to create users in Supabase
- [ ] `ProfilePage.tsx` updated to read from Supabase
- [ ] Test plan creation
- [ ] Test plan retrieval
- [ ] Test user profile loading

## 🧪 Step 7: Testing

1. **Test User Creation**:
   - Sign in with Google
   - Check Supabase Table Editor → `users` table → Should see your user record

2. **Test Plan Saving**:
   - Generate a trip plan
   - Click "Save to Profile"
   - Check `plans` table → Should see your plan

3. **Test Plan Retrieval**:
   - Go to "My Plans" page
   - Should see your saved plans

## ⚠️ Important Notes

1. **Firebase Auth Token**: The current implementation passes Firebase tokens to Supabase. You may need to configure Supabase to accept Firebase JWT tokens, or use a different authentication approach.

2. **RLS Policies**: The schema includes Row Level Security policies. Make sure they work with your Firebase Auth setup. You might need to adjust them based on how Supabase verifies Firebase tokens.

3. **Data Migration**: If you have existing Firestore data, you'll need to export it and import it into Supabase manually.

4. **Real-time Subscriptions**: Supabase supports real-time via `supabase.realtime`, similar to Firestore's `onSnapshot`.

## 🐛 Troubleshooting

### "Invalid API key" error
- Check your `.env` file has correct values
- Restart dev server after adding env vars
- Make sure keys start with `VITE_` for Vite projects

### "Row Level Security policy violation"
- Check that you're authenticated (Firebase Auth)
- Verify RLS policies in Supabase Dashboard → Authentication → Policies
- Check that Firebase token is being passed correctly

### "Table does not exist"
- Run the SQL schema in Supabase SQL Editor
- Check Table Editor to confirm tables exist

## 📚 Resources

- [Supabase Docs](https://supabase.com/docs)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Firebase Auth Integration](https://supabase.com/docs/guides/auth/auth-helpers/auth-helpers-nextjs)

