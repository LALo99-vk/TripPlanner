import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PostRecord {
  id: string;
  author_id: string;
  media_urls: string[];
  caption: string;
  location: string | null;
  likes_count?: number;
  comments_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePostInput {
  userId: string;
  imageUrl: string;
  caption: string;
  location?: string;
}

/**
 * Create a new post
 */
export async function createPost(input: CreatePostInput): Promise<PostRecord> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: input.userId,
      media_urls: [input.imageUrl], // Store as array for future multi-image support
      caption: input.caption.trim(),
      location: input.location?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating post:', error);
    throw error;
  }

  return data as PostRecord;
}

/**
 * Get all posts for a user
 */
export async function getUserPosts(userId: string): Promise<PostRecord[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching user posts:', error);
    throw error;
  }

  return (data || []) as PostRecord[];
}

/**
 * Subscribe to user posts in real-time
 */
export function subscribeUserPosts(
  userId: string,
  callback: (posts: PostRecord[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let pollInterval: NodeJS.Timeout | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Load initial posts
    const initialPosts = await getUserPosts(userId);
    callback(initialPosts);

    // Subscribe to changes
    channel = supabase
      .channel(`user-posts-${userId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `author_id=eq.${userId}`,
        },
        async () => {
          // Reload posts when changes occur
          const updatedPosts = await getUserPosts(userId);
          callback(updatedPosts);
        }
      )
      .subscribe();

    // Polling fallback every 5 seconds
    pollInterval = setInterval(async () => {
      try {
        const updatedPosts = await getUserPosts(userId);
        callback(updatedPosts);
      } catch (err) {
        console.error('User posts polling error:', err);
      }
    }, 5000);
  };

  setupSubscription();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
    if (pollInterval) clearInterval(pollInterval);
  };
}

/**
 * Upload post image to Supabase Storage
 */
export async function uploadPostImage(
  userId: string,
  file: File
): Promise<string> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file');
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('Image size must be less than 10MB');
  }

  // Generate unique filename
  const fileExtension = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
  const filePath = `posts/${userId}/${fileName}`;

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('posts')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Error uploading post image:', uploadError);
    throw uploadError;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('posts')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  user_name: string;
  comment_text: string;
  created_at: string;
  updated_at: string;
}

/**
 * Toggle like on a post
 */
export async function togglePostLike(
  postId: string,
  userId: string
): Promise<{ liked: boolean; likesCount: number }> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Check if user already liked the post
  const { data: existingLike } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  if (existingLike) {
    // Unlike: Remove the like
    const { error: deleteError } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error removing like:', deleteError);
      throw deleteError;
    }

    // Get updated likes count (trigger updates it automatically)
    const { data: postData } = await supabase
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    return {
      liked: false,
      likesCount: (postData?.likes_count || 0) as number,
    };
  } else {
    // Like: Add the like (UNIQUE constraint prevents duplicates)
    const { error: insertError } = await supabase.from('post_likes').insert({
      post_id: postId,
      user_id: userId,
    });

    if (insertError) {
      // If UNIQUE constraint violation (race condition), check again
      if (insertError.code === '23505') {
        // Duplicate key - like already exists, fetch current state
        const { data: postData } = await supabase
          .from('posts')
          .select('likes_count')
          .eq('id', postId)
          .single();

        return {
          liked: true,
          likesCount: (postData?.likes_count || 0) as number,
        };
      }
      console.error('Error adding like:', insertError);
      throw insertError;
    }

    // Get updated likes count (trigger updates it automatically)
    const { data: postData } = await supabase
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    return {
      liked: true,
      likesCount: (postData?.likes_count || 0) as number,
    };
  }
}

/**
 * Check if user has liked a post
 */
export async function checkUserLikedPost(
  postId: string,
  userId: string
): Promise<boolean> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  return !!data;
}

/**
 * Get all comments for a post
 */
export async function getPostComments(postId: string): Promise<PostComment[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching post comments:', error);
    throw error;
  }

  return (data || []) as PostComment[];
}

/**
 * Add a comment to a post
 */
export async function addPostComment(
  postId: string,
  userId: string,
  userName: string,
  commentText: string
): Promise<PostComment> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      user_id: userId,
      user_name: userName,
      comment_text: commentText.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding comment:', error);
    throw error;
  }

  return data as PostComment;
}

/**
 * Share a post (track share)
 */
export async function sharePost(
  postId: string,
  userId: string
): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Record the share
  await supabase.from('post_shares').insert({
    post_id: postId,
    user_id: userId,
  });

  // Copy post URL to clipboard (handled in UI)
}

/**
 * Toggle bookmark for a post
 */
export async function togglePostBookmark(
  postId: string,
  userId: string
): Promise<{ bookmarked: boolean }> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Check if already bookmarked
  const { data: existing } = await supabase
    .from('post_bookmarks')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  if (existing) {
    // Unbookmark
    const { error } = await supabase
      .from('post_bookmarks')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (error) throw error;
    return { bookmarked: false };
  } else {
    // Bookmark
    const { error } = await supabase
      .from('post_bookmarks')
      .insert({
        post_id: postId,
        user_id: userId,
      });

    if (error) throw error;
    return { bookmarked: true };
  }
}

/**
 * Check if user has bookmarked a post
 */
export async function checkUserBookmarkedPost(
  postId: string,
  userId: string
): Promise<boolean> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('post_bookmarks')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned, which is fine
    console.error('Error checking bookmark:', error);
  }

  return !!data;
}

/**
 * Get all bookmarked posts for a user
 */
export async function getUserBookmarkedPosts(userId: string): Promise<PostRecord[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('post_bookmarks')
    .select(`
      post_id,
      posts (
        id,
        author_id,
        media_urls,
        caption,
        location,
        likes_count,
        comments_count,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookmarked posts:', error);
    throw error;
  }

  // Extract posts from the nested structure
  const posts = (data || [])
    .map((item: any) => item.posts)
    .filter((post: any) => post !== null) as PostRecord[];

  return posts;
}

/**
 * Delete a post (only by author)
 */
export async function deletePost(
  postId: string,
  userId: string
): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  // First verify the user is the author
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', postId)
    .single();

  if (fetchError) {
    throw new Error('Post not found');
  }

  if (post.author_id !== userId) {
    throw new Error('You can only delete your own posts');
  }

  // Delete the post (CASCADE will handle related records)
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId);

  if (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
}

/**
 * Subscribe to post likes in real-time
 */
export function subscribePostLikes(
  postId: string,
  callback: (likesCount: number) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let pollInterval: NodeJS.Timeout | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial likes count
    const { data: postData } = await supabase
      .from('posts')
      .select('likes_count')
      .eq('id', postId)
      .single();

    if (postData) {
      callback((postData.likes_count || 0) as number);
    }

    // Subscribe to likes changes
    channel = supabase
      .channel(`post-likes-${postId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_likes',
          filter: `post_id=eq.${postId}`,
        },
        async () => {
          const { data: updatedPost } = await supabase
            .from('posts')
            .select('likes_count')
            .eq('id', postId)
            .single();

          if (updatedPost) {
            callback((updatedPost.likes_count || 0) as number);
          }
        }
      )
      .subscribe();

    // Polling fallback every 5 seconds
    pollInterval = setInterval(async () => {
      try {
        const { data: updatedPost } = await supabase
          .from('posts')
          .select('likes_count')
          .eq('id', postId)
          .single();

        if (updatedPost) {
          callback((updatedPost.likes_count || 0) as number);
        }
      } catch (err) {
        console.error('Post likes polling error:', err);
      }
    }, 5000);
  };

  setupSubscription();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
    if (pollInterval) clearInterval(pollInterval);
  };
}

/**
 * Subscribe to post comments in real-time
 */
export function subscribePostComments(
  postId: string,
  callback: (comments: PostComment[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;
  let pollInterval: NodeJS.Timeout | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Load initial comments
    const initialComments = await getPostComments(postId);
    callback(initialComments);

    // Subscribe to comments changes
    channel = supabase
      .channel(`post-comments-${postId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_comments',
          filter: `post_id=eq.${postId}`,
        },
        async () => {
          const updatedComments = await getPostComments(postId);
          callback(updatedComments);
        }
      )
      .subscribe();

    // Polling fallback every 5 seconds
    pollInterval = setInterval(async () => {
      try {
        const updatedComments = await getPostComments(postId);
        callback(updatedComments);
      } catch (err) {
        console.error('Post comments polling error:', err);
      }
    }, 5000);
  };

  setupSubscription();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
    if (pollInterval) clearInterval(pollInterval);
  };
}

