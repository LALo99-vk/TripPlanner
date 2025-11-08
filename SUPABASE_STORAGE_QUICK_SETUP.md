# Supabase Storage Quick Setup

## ✅ Step 1: Create Storage Buckets

1. Go to **Supabase Dashboard**: https://app.supabase.com
2. Select your project
3. Click **Storage** (left sidebar)
4. Click **"New bucket"** button

### Create Bucket 1: `profile-photos`
- **Name**: `profile-photos`
- **Public bucket**: ✅ **Check this box** (important!)
- Click **"Create bucket"**

### Create Bucket 2: `posts`
- **Name**: `posts`
- **Public bucket**: ✅ **Check this box** (important!)
- Click **"Create bucket"**

## 🔐 Step 2: Set Storage Policies (Simplified)

Since we're using Firebase Auth with service role key, we can use simplified policies:

1. Go to **Storage** → **Policies** tab
2. For each bucket (`profile-photos` and `posts`):

### Add Policy: "Allow public read"
- Click **"New policy"**
- **Policy name**: "Public read"
- **Allowed operation**: SELECT
- **Policy definition**: `true`
- Click **"Save"**

### Add Policy: "Allow authenticated upload"
- Click **"New policy"**
- **Policy name**: "Authenticated upload"
- **Allowed operation**: INSERT
- **Policy definition**: `true`
- Click **"Save"**

**Note**: Since we're using the service role key in the app, these policies allow uploads. The app code ensures users can only upload to their own folders by checking `user.uid`.

## ✅ Step 3: Verify

1. Go to **Storage** → **Buckets**
2. You should see:
   - ✅ `profile-photos` (public)
   - ✅ `posts` (public)

## 🧪 Step 4: Test

1. Go to Profile Page
2. Click "Edit Profile"
3. Upload a photo
4. Check console for success message
5. Verify photo in Supabase Storage → `profile-photos` bucket

## 🎉 Done!

That's it! No CORS issues, no Firebase Storage rules to configure. Everything works with Supabase!

