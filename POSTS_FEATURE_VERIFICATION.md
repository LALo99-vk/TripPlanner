# Posts Feature Verification Guide

## ✅ Database Setup Required

### Step 1: Run Posts Social Features Schema
Run `posts-social-features-schema.sql` in Supabase SQL Editor. This creates:
- `post_likes` table with **UNIQUE(post_id, user_id)** constraint (prevents duplicate likes)
- `post_comments` table (stores all comments)
- `post_shares` table (tracks shares)
- Triggers that auto-update `likes_count` and `comments_count` in `posts` table

### Step 2: Verify Storage Bucket
- Ensure `posts` storage bucket exists and is public
- Storage policies allow authenticated uploads

## ✅ Features Verification

### 1. All Users' Posts Appear on Discover Page
- ✅ **Verified**: DiscoverPage loads posts with NO `author_id` filter
- ✅ Query: `SELECT * FROM posts ORDER BY created_at DESC` (no WHERE clause)
- ✅ Posts from ALL users appear in chronological order

### 2. Real Database Interactions (Not Mock Data)

#### Likes:
- ✅ Uses `post_likes` table (not just incrementing a counter)
- ✅ **UNIQUE constraint** prevents duplicate likes (one user = one like per post)
- ✅ `togglePostLike()` checks database before like/unlike
- ✅ `likes_count` updated via database trigger (automatic)
- ✅ Real-time subscriptions update counts instantly

#### Comments:
- ✅ Uses `post_comments` table
- ✅ Each comment stored with `user_id`, `user_name`, `comment_text`
- ✅ `comments_count` updated via database trigger (automatic)
- ✅ Real-time subscriptions show new comments instantly

#### Shares:
- ✅ Uses `post_shares` table
- ✅ Each share recorded with `user_id` and timestamp
- ✅ Copies post URL to clipboard

### 3. Production-Ready Features

#### Database Constraints:
- ✅ `UNIQUE(post_id, user_id)` on `post_likes` - prevents duplicate likes
- ✅ Foreign key constraints ensure data integrity
- ✅ Cascade deletes when posts are deleted

#### Real-Time Updates:
- ✅ Supabase Realtime subscriptions for posts, likes, and comments
- ✅ All users see updates instantly without refresh

#### Error Handling:
- ✅ Handles UNIQUE constraint violations (race conditions)
- ✅ Optimistic updates with rollback on error
- ✅ Proper error messages for users

## 🧪 Testing Checklist

1. **Post from Multiple Accounts:**
   - [ ] Create post from Account A
   - [ ] Create post from Account B
   - [ ] Verify both appear on Discover page
   - [ ] Verify both appear in each user's Profile page

2. **Like Functionality:**
   - [ ] Like a post from Account A
   - [ ] Verify like count increases
   - [ ] Try to like again - should unlike (not create duplicate)
   - [ ] Check `post_likes` table - should have one row per user per post
   - [ ] Verify `posts.likes_count` is updated automatically

3. **Comment Functionality:**
   - [ ] Add comment from Account A
   - [ ] Add comment from Account B
   - [ ] Verify both comments appear
   - [ ] Check `post_comments` table - should have all comments
   - [ ] Verify `posts.comments_count` is updated automatically

4. **Share Functionality:**
   - [ ] Share a post
   - [ ] Verify URL is copied to clipboard
   - [ ] Check `post_shares` table - should record the share

5. **Real-Time Updates:**
   - [ ] Open Discover page in two browsers (different accounts)
   - [ ] Like a post in Browser A
   - [ ] Verify like count updates in Browser B instantly
   - [ ] Add comment in Browser A
   - [ ] Verify comment appears in Browser B instantly

## 🔍 Database Verification Queries

Run these in Supabase SQL Editor to verify:

```sql
-- Check all posts (should show posts from all users)
SELECT id, author_id, caption, likes_count, comments_count, created_at 
FROM posts 
ORDER BY created_at DESC;

-- Check likes (should show one row per user per post)
SELECT post_id, user_id, created_at 
FROM post_likes 
ORDER BY created_at DESC;

-- Check for duplicate likes (should return 0 rows)
SELECT post_id, user_id, COUNT(*) as count
FROM post_likes
GROUP BY post_id, user_id
HAVING COUNT(*) > 1;

-- Check comments
SELECT post_id, user_id, user_name, comment_text, created_at
FROM post_comments
ORDER BY created_at DESC;

-- Check shares
SELECT post_id, user_id, created_at
FROM post_shares
ORDER BY created_at DESC;
```

## ✅ Production Deployment Checklist

- [ ] Run `posts-social-features-schema.sql` in production database
- [ ] Verify `posts` storage bucket exists and is public
- [ ] Test posting from multiple accounts
- [ ] Test likes (verify no duplicates)
- [ ] Test comments
- [ ] Test shares
- [ ] Verify real-time updates work
- [ ] Check database tables have data (not empty)




