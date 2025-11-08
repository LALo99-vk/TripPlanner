# Firebase Storage Setup Guide

## 🔴 CORS Error Fix

If you're getting CORS errors when uploading profile photos, you need to configure Firebase Storage security rules.

## 📝 Step 1: Update Firebase Storage Security Rules

1. Go to **Firebase Console**: https://console.firebase.google.com
2. Select your project: **photography-web-1f156**
3. Go to **Storage** (left sidebar)
4. Click on the **Rules** tab
5. Copy and paste the rules from `firebase-storage-rules.txt`
6. Click **Publish**

## 🔐 Security Rules Explained

The rules allow:
- ✅ **Authenticated users** can upload photos to their own `profile-photos/{userId}/` folder
- ✅ **Anyone** can read profile photos (for displaying in the app)
- ✅ **Authenticated users** can upload posts to their own `posts/{userId}/` folder
- ❌ **All other access** is denied

## 🧪 Step 2: Test the Upload

After updating the rules:

1. **Wait 1-2 minutes** for rules to propagate
2. Try uploading a profile photo again
3. Check the browser console for success messages
4. Verify the photo appears in:
   - Firebase Console → Storage → `profile-photos/` folder
   - Your profile page

## ⚠️ Troubleshooting

### Still getting CORS errors?

1. **Check rules are published**: Make sure you clicked "Publish" in Firebase Console
2. **Wait a few minutes**: Rules can take 1-2 minutes to propagate
3. **Check file size**: Maximum 5MB (configured in code)
4. **Check file type**: Must be an image file
5. **Hard refresh**: Try `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

### "Storage/unauthorized" error?

- Make sure you're signed in (Firebase Auth)
- Check that the security rules match your Firebase project
- Verify the user ID matches the folder path

### File uploads but doesn't appear?

- Check Firebase Console → Storage → Files
- Verify the file path: `profile-photos/{userId}/{filename}`
- Check browser console for download URL

## 📋 Quick Rules Copy-Paste

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /profile-photos/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /posts/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## ✅ After Setup

Once rules are published:
- Profile photo uploads will work
- Post image uploads will work
- All uploads are secure (users can only upload to their own folders)

