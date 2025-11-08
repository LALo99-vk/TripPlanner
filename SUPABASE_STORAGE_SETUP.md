# Supabase Storage Setup Guide

## 📦 Why Supabase Storage?

Using Supabase Storage instead of Firebase Storage:
- ✅ **Simpler architecture**: Everything in one place (Supabase)
- ✅ **No CORS issues**: Supabase handles CORS automatically
- ✅ **Better integration**: Works seamlessly with Supabase database
- ✅ **Easier setup**: No separate storage rules to configure
- ✅ **Firebase only for auth**: Clean separation of concerns

## 🔧 Step 1: Enable Supabase Storage

1. Go to **Supabase Dashboard**: https://app.supabase.com
2. Select your project
3. Go to **Storage** (left sidebar)
4. Click **"New bucket"** or **"Create bucket"**

## 📁 Step 2: Create Storage Buckets

Create these two buckets:

### Bucket 1: `profile-photos`
- **Name**: `profile-photos`
- **Public**: ✅ **Yes** (check this box)
- **File size limit**: 5 MB (or leave default)
- **Allowed MIME types**: `image/*` (or leave empty for all)

### Bucket 2: `posts`
- **Name**: `posts`
- **Public**: ✅ **Yes** (check this box)
- **File size limit**: 10 MB (or leave default)
- **Allowed MIME types**: `image/*,video/*` (or leave empty for all)

## 🔐 Step 3: Configure Storage Policies

After creating buckets, set up security policies:

1. Go to **Storage** → **Policies** tab
2. For each bucket (`profile-photos` and `posts`), add these policies:

### Policy 1: Allow Public Read
- **Policy name**: "Public read access"
- **Allowed operation**: SELECT (read)
- **Policy definition**: 
  ```sql
  true
  ```
- **Description**: Anyone can read/view files

### Policy 2: Allow Authenticated Upload
- **Policy name**: "Authenticated users can upload"
- **Allowed operation**: INSERT (upload)
- **Policy definition**:
  ```sql
  bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]
  ```
  OR for posts:
  ```sql
  bucket_id = 'posts' AND auth.uid()::text = (storage.foldername(name))[1]
  ```
- **Description**: Users can only upload to their own folder

### Policy 3: Allow Authenticated Update/Delete
- **Policy name**: "Users can manage own files"
- **Allowed operation**: UPDATE, DELETE
- **Policy definition**:
  ```sql
  bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]
  ```
  OR for posts:
  ```sql
  bucket_id = 'posts' AND auth.uid()::text = (storage.foldername(name))[1]
  ```

**Note**: Since we're using Firebase Auth (not Supabase Auth), the policies above won't work directly. Use this simpler approach:

### Simplified Policy (For Firebase Auth)

Since we're using Firebase Auth, use these policies:

**For `profile-photos` bucket:**
```sql
-- Public read
SELECT: true

-- Authenticated upload (using service role key in app)
INSERT: true

-- Authenticated update/delete
UPDATE: true
DELETE: true
```

**For `posts` bucket:**
```sql
-- Public read
SELECT: true

-- Authenticated upload (using service role key in app)
INSERT: true

-- Authenticated update/delete
UPDATE: true
DELETE: true
```

**Important**: Since we're using the service role key in the app (for Firebase Auth compatibility), the policies are enforced in application code. Users can only upload to their own folders because the app checks `user.uid` before uploading.

## ✅ Step 4: Verify Setup

1. **Check buckets exist**: Go to Storage → Buckets → You should see `profile-photos` and `posts`
2. **Check policies**: Go to Storage → Policies → Verify policies are active
3. **Test upload**: Try uploading a profile photo in the app

## 🧪 Step 5: Test the Upload

1. Go to Profile Page
2. Click "Edit Profile"
3. Click camera icon on photo
4. Select an image
5. Click "Save Changes"
6. Check console for success message
7. Verify photo appears in Supabase Storage → `profile-photos` bucket

## 📝 Quick Setup Checklist

- [ ] Created `profile-photos` bucket (public)
- [ ] Created `posts` bucket (public)
- [ ] Added storage policies (or using service role key)
- [ ] Tested profile photo upload
- [ ] Verified files appear in Supabase Storage

## 🔍 Verify Files in Supabase

1. Go to **Supabase Dashboard** → **Storage**
2. Click on **`profile-photos`** bucket
3. You should see folders named with user IDs (Firebase Auth UIDs)
4. Click into a user folder to see uploaded photos

## ⚠️ Important Notes

1. **Service Role Key**: The app uses the service role key for uploads (since we're using Firebase Auth). This bypasses RLS, but the app code ensures users can only upload to their own folders.

2. **Public Buckets**: Both buckets are set to public so images can be displayed in the app without authentication.

3. **File Paths**: Files are stored as:
   - Profile photos: `profile-photos/{userId}/{filename}`
   - Posts: `posts/{userId}/{filename}`

4. **Security**: Even though buckets are public, users can only upload to their own folders because the app code checks `user.uid` before uploading.

## 🎉 Benefits

- ✅ No CORS errors
- ✅ Everything in Supabase (database + storage)
- ✅ Firebase only for authentication
- ✅ Simpler architecture
- ✅ Better integration

