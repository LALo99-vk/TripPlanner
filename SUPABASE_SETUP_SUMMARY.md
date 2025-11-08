# Supabase Setup Summary

## ✅ What's Been Done

I've successfully migrated your codebase from Firebase Firestore to Supabase PostgreSQL while keeping Firebase Authentication. Here's what changed:

### Files Created:
1. **`src/config/supabase.ts`** - Supabase client configuration
2. **`supabase-schema.sql`** - Database schema with tables and RLS policies
3. **`SUPABASE_MIGRATION.md`** - Detailed migration guide
4. **`SUPABASE_SETUP_SUMMARY.md`** - This file

### Files Modified:
1. **`src/services/planRepository.ts`** - Now uses Supabase instead of Firestore
2. **`src/hooks/useAuth.ts`** - Creates user records in Supabase on sign-in
3. **`src/components/Pages/ProfilePage.tsx`** - Reads from Supabase
4. **`package.json`** - Added `@supabase/supabase-js` dependency

## 🔑 What You Need to Provide

### 1. Supabase Credentials

Get these from https://app.supabase.com → Your Project → Settings → API:

- **Project URL**: `https://xxxxx.supabase.co`
- **Anon/Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Service Role Key** (optional, for development): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### 2. Environment Variables

Add to `TripPlanner/.env`:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Optional for dev
```

### 3. Database Setup

1. Go to Supabase Dashboard → **SQL Editor**
2. Copy and paste the entire `supabase-schema.sql` file
3. Click **Run**
4. Verify tables were created in **Table Editor**

## 📦 Installation

Run this to install the Supabase client:

```bash
cd TripPlanner
npm install
```

## ⚠️ Important Notes

### Authentication Strategy

Since you're using **Firebase Auth** but **Supabase** for storage, there's a challenge:

- Supabase RLS expects Supabase JWT tokens
- Firebase Auth provides Firebase tokens
- These don't automatically work together

**Current Solution**: Use Supabase service role key (for development) with application-level auth checks. All database operations verify `user_id` matches Firebase Auth UID.

**For Production**: Consider setting up Firebase token verification in Supabase (see `SUPABASE_MIGRATION.md` Step 4).

### Security

- ⚠️ **Never commit `.env` file** to git
- ⚠️ **Service role key bypasses RLS** - only use in development
- ✅ Application code always verifies `user_id` matches Firebase UID

## 🧪 Testing Checklist

- [ ] Install Supabase package: `npm install`
- [ ] Add environment variables to `.env`
- [ ] Run database schema SQL in Supabase
- [ ] Restart dev server
- [ ] Sign in with Google → Check Supabase `users` table
- [ ] Generate a plan → Click "Save to Profile" → Check `plans` table
- [ ] Go to "My Plans" page → Should see saved plans
- [ ] Check Profile page → Should show trip count and history

## 📚 Next Steps

1. **Set up Supabase project** (if not done)
2. **Add credentials to `.env`**
3. **Run the SQL schema**
4. **Install dependencies**: `npm install`
5. **Test the integration**

For detailed instructions, see `SUPABASE_MIGRATION.md`.

## 🆘 Troubleshooting

### "Invalid API key"
- Check `.env` file has correct values
- Restart dev server after adding env vars
- Keys must start with `VITE_` for Vite projects

### "Table does not exist"
- Run the SQL schema in Supabase SQL Editor
- Check Table Editor to confirm tables exist

### "Row Level Security policy violation"
- Make sure you've added the service role key (for development)
- Or configure Firebase token verification (for production)

### Data not appearing
- Check that you're signed in (Firebase Auth)
- Verify user record exists in Supabase `users` table
- Check browser console for errors

## 💡 Why This Architecture?

**Firebase Auth + Supabase Storage** is a solid choice because:

✅ Firebase Auth is mature and reliable  
✅ Supabase provides PostgreSQL (SQL) with better querying  
✅ Real-time subscriptions similar to Firestore  
✅ Often more cost-effective at scale  
✅ Better for complex queries and relationships  

The main trade-off is managing two services, but the benefits usually outweigh this.

