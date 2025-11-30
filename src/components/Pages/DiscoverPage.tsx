import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, MessageCircle, Share2, MapPin, Loader2, Bookmark, MoreHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';
import {
  togglePostLike,
  checkUserLikedPost,
  getPostComments,
  addPostComment,
  sharePost,
  subscribePostComments,
  togglePostBookmark,
  checkUserBookmarkedPost,
  deletePost,
  type PostComment,
  type PostRecord,
} from '../../services/postRepository';

interface TripPost {
  id: string;
  author_id: string;
  author_name?: string;
  author_photo?: string;
  trip_id?: string;
  caption: string;
  media_urls: string[];
  location: string;
  tags?: string[];
  likes_count: number;
  comments_count?: number;
  created_at: string | Date;
}

const DiscoverPage: React.FC = () => {
  const [posts, setPosts] = useState<TripPost[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [postLikes, setPostLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [selectedPost, setSelectedPost] = useState<TripPost | null>(null);
  const [postComments, setPostComments] = useState<Record<string, PostComment[]>>({});
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isLiking, setIsLiking] = useState<string | null>(null);
  const [savedPosts, setSavedPosts] = useState<Set<string>>(new Set());
  const [isBookmarking, setIsBookmarking] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const commentUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let channel: any = null;
    let supabaseClient: any = null;

    const loadPosts = async () => {
      try {
        supabaseClient = await getAuthenticatedSupabaseClient();
        
        // Subscribe to real-time changes
        channel = supabaseClient
          .channel('posts-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'posts',
            },
            async () => {
              // Refetch posts when changes occur - Loads ALL posts from ALL users (no filter)
              const { data, error } = await supabaseClient
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false }); // No .eq('author_id') - shows posts from all users

              if (error) {
                console.error('Error loading posts:', error);
                return;
              }

              if (data) {
                // Fetch author details for each post
                const postsWithAuthors = await Promise.all(
                  data.map(async (post: PostRecord) => {
                    const { data: userData } = await supabaseClient
                      .from('users')
                      .select('display_name, photo_url')
                      .eq('id', post.author_id)
                      .single();

                    return {
                      ...post,
                      author_name: userData?.display_name || 'Anonymous',
                      author_photo: userData?.photo_url || '',
                    };
                  })
                );

                setPosts(postsWithAuthors as TripPost[]);
                setLoading(false);

                // Load REAL likes status and bookmarks from database (not mock data)
                if (user) {
                  const likesMap: Record<string, { count: number; liked: boolean }> = {};
                  const bookmarksSet = new Set<string>();
                  
                  for (const post of postsWithAuthors) {
                    // REAL database query - checks post_likes table
                    const liked = await checkUserLikedPost(post.id, user.uid);
                    likesMap[post.id] = {
                      count: (post.likes_count || 0) as number, // REAL count from database trigger
                      liked, // REAL status from post_likes table
                    };
                    
                    // REAL database query - checks post_bookmarks table
                    const bookmarked = await checkUserBookmarkedPost(post.id, user.uid);
                    if (bookmarked) {
                      bookmarksSet.add(post.id);
                    }
                  }
                  setPostLikes(likesMap);
                  setSavedPosts(bookmarksSet);
                } else {
                  // If not logged in, just set counts from database
                  const likesMap: Record<string, { count: number; liked: boolean }> = {};
                  postsWithAuthors.forEach((post) => {
                    likesMap[post.id] = {
                      count: (post.likes_count || 0) as number, // REAL count from database
                      liked: false,
                    };
                  });
                  setPostLikes(likesMap);
                  setSavedPosts(new Set());
                }
              }
            }
          )
          .subscribe();

        // Initial load - Loads posts from ALL users (no filter by author_id)
        const { data, error } = await supabaseClient
          .from('posts')
          .select('*')
          .order('created_at', { ascending: false }); // No .eq('author_id') - shows ALL posts

        if (error) {
          console.error('Error loading posts:', error);
          setLoading(false);
          return;
        }

        if (data) {
          // Fetch author details for each post
          const postsWithAuthors = await Promise.all(
            data.map(async (post: PostRecord) => {
              const { data: userData } = await supabaseClient
                .from('users')
                .select('display_name, photo_url')
                .eq('id', post.author_id)
                .single();

              return {
                ...post,
                author_name: userData?.display_name || 'Anonymous',
                author_photo: userData?.photo_url || '',
              };
            })
          );

          setPosts(postsWithAuthors as TripPost[]);
          setLoading(false);

          // Load likes status for all posts (REAL database check - not mock data)
          if (user) {
            const likesMap: Record<string, { count: number; liked: boolean }> = {};
            for (const post of postsWithAuthors) {
              // REAL database check - queries post_likes table
              const liked = await checkUserLikedPost(post.id, user.uid);
              likesMap[post.id] = {
                count: (post.likes_count || 0) as number, // From database trigger
                liked, // From post_likes table
              };
            }
            setPostLikes(likesMap);
          } else {
            // If not logged in, just set counts from database
            const likesMap: Record<string, { count: number; liked: boolean }> = {};
            postsWithAuthors.forEach((post) => {
              likesMap[post.id] = {
                count: (post.likes_count || 0) as number, // REAL count from database
                liked: false,
              };
            });
            setPostLikes(likesMap);
          }
        }
      } catch (error) {
        console.error('Error setting up posts subscription:', error);
        setLoading(false);
      }
    };

    loadPosts();

    // Cleanup function
    return () => {
      if (channel && supabaseClient) {
        supabaseClient.removeChannel(channel);
      }
    };
  }, []);

  // Handle like/unlike post (REAL database interaction)
  const handleLike = async (postId: string) => {
    if (!user || isLiking === postId) return;
    
    setIsLiking(postId);
    try {
      // Optimistic update
      const currentLike = postLikes[postId];
      const newLiked = !currentLike?.liked;
      setPostLikes((prev) => ({
        ...prev,
        [postId]: {
          count: newLiked ? (currentLike?.count || 0) + 1 : Math.max((currentLike?.count || 0) - 1, 0),
          liked: newLiked,
        },
      }));

      // REAL database interaction - uses post_likes table with UNIQUE constraint
      const result = await togglePostLike(postId, user.uid);
      
      // Update with real data from database
      setPostLikes((prev) => ({
        ...prev,
        [postId]: {
          count: result.likesCount,
          liked: result.liked,
        },
      }));

      // Update post in list
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likes_count: result.likesCount } : p
        )
      );
    } catch (error: any) {
      console.error('Error toggling like:', error);
      // Revert optimistic update
      const currentLike = postLikes[postId];
      setPostLikes((prev) => ({
        ...prev,
        [postId]: {
          count: currentLike?.count || 0,
          liked: currentLike?.liked || false,
        },
      }));
    } finally {
      setIsLiking(null);
    }
  };

  // Handle open post detail (for comments)
  const handleOpenPostDetail = async (post: TripPost) => {
    // Cleanup previous subscription if any
    if (commentUnsubscribeRef.current) {
      commentUnsubscribeRef.current();
      commentUnsubscribeRef.current = null;
    }
    
    setSelectedPost(post);
    
    // Load comments from database
    try {
      const comments = await getPostComments(post.id);
      setPostComments((prev) => ({ ...prev, [post.id]: comments }));
      
      // Subscribe to real-time comment updates for this post
      const unsubscribe = subscribePostComments(post.id, (updatedComments) => {
        setPostComments((prev) => ({ ...prev, [post.id]: updatedComments }));
      });
      
      // Store unsubscribe function
      commentUnsubscribeRef.current = unsubscribe;
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  // Cleanup comment subscription when modal closes
  useEffect(() => {
    if (!selectedPost && commentUnsubscribeRef.current) {
      commentUnsubscribeRef.current();
      commentUnsubscribeRef.current = null;
    }
  }, [selectedPost]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.menu-container') && !target.closest('button[aria-label="More options"]')) {
        setOpenMenuPostId(null);
      }
    };

    if (openMenuPostId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuPostId]);

  // Handle add comment (REAL database interaction)
  const handleAddComment = async () => {
    if (!user || !selectedPost || !newComment.trim() || isAddingComment) return;

    setIsAddingComment(true);
    try {
      // Get user name
      const supabase = await getAuthenticatedSupabaseClient();
      const { data: userData } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', user.uid)
        .single();

      const userName = userData?.display_name || user.displayName || 'User';

      // REAL database interaction - saves to post_comments table
      const comment = await addPostComment(
        selectedPost.id,
        user.uid,
        userName,
        newComment.trim()
      );

      // Optimistic update
      setPostComments((prev) => ({
        ...prev,
        [selectedPost.id]: [...(prev[selectedPost.id] || []), comment],
      }));

      // Update comments count in post
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p
        )
      );

      setNewComment('');
    } catch (error: any) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment. Please try again.');
    } finally {
      setIsAddingComment(false);
    }
  };

  // Handle share post (REAL database interaction)
  const handleShare = async (post: TripPost) => {
    if (!user) {
      alert('Please log in to share posts.');
      return;
    }

    try {
      // REAL database interaction - saves to post_shares table
      await sharePost(post.id, user.uid);

      // Copy post URL to clipboard
      const postUrl = `${window.location.origin}/discover?post=${post.id}`;
      await navigator.clipboard.writeText(postUrl);
      
      alert('Post link copied to clipboard!');
    } catch (error: any) {
      console.error('Error sharing post:', error);
      // Fallback: just copy URL
      try {
        const postUrl = `${window.location.origin}/discover?post=${post.id}`;
        await navigator.clipboard.writeText(postUrl);
        alert('Post link copied to clipboard!');
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
      }
    }
  };

  // Handle save/unsave post (REAL database interaction)
  const handleSave = async (postId: string) => {
    if (!user || isBookmarking === postId) return;

    setIsBookmarking(postId);
    try {
      // Optimistic update
      const isCurrentlySaved = savedPosts.has(postId);
      setSavedPosts((prev) => {
        const newSet = new Set(prev);
        if (isCurrentlySaved) {
          newSet.delete(postId);
        } else {
          newSet.add(postId);
        }
        return newSet;
      });

      // REAL database interaction - uses post_bookmarks table
      const result = await togglePostBookmark(postId, user.uid);

      // Update with real data from database
      setSavedPosts((prev) => {
        const newSet = new Set(prev);
        if (result.bookmarked) {
          newSet.add(postId);
        } else {
          newSet.delete(postId);
        }
        return newSet;
      });
    } catch (error: any) {
      console.error('Error toggling bookmark:', error);
      // Revert optimistic update
      const isCurrentlySaved = savedPosts.has(postId);
      setSavedPosts((prev) => {
        const newSet = new Set(prev);
        if (isCurrentlySaved) {
          newSet.add(postId);
        } else {
          newSet.delete(postId);
        }
        return newSet;
      });
      alert('Failed to bookmark post. Please try again.');
    } finally {
      setIsBookmarking(null);
    }
  };

  // Handle delete post (only for author)
  const handleDelete = async (postId: string) => {
    if (!user || isDeleting === postId) return;

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    // Verify user is the author
    if (post.author_id !== user.uid) {
      alert('You can only delete your own posts.');
      return;
    }

    if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(postId);
    try {
      // REAL database interaction - deletes post and all related data (CASCADE)
      await deletePost(postId, user.uid);

      // Remove post from list
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      
      // Clean up state
      setPostLikes((prev) => {
        const newPrev = { ...prev };
        delete newPrev[postId];
        return newPrev;
      });
      setPostComments((prev) => {
        const newPrev = { ...prev };
        delete newPrev[postId];
        return newPrev;
      });
      setSavedPosts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });

      // Close modal if this post was selected
      if (selectedPost?.id === postId) {
        setSelectedPost(null);
      }

      alert('Post deleted successfully.');
    } catch (error: any) {
      console.error('Error deleting post:', error);
      alert(error.message || 'Failed to delete post. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  // Format relative time (e.g., "2 hours ago", "3 days ago")
  const formatRelativeTime = (date: string | Date): string => {
    const now = new Date();
    const postDate = typeof date === 'string' ? new Date(date) : date;
    const diffInSeconds = Math.floor((now.getTime() - postDate.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    }
    if (diffInSeconds < 2592000) {
      const weeks = Math.floor(diffInSeconds / 604800);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    }
    return postDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Lazy loading image observer
  const imageRef = useCallback((node: HTMLImageElement | null, postId: string) => {
    if (!node || imageLoaded.has(postId)) return;
    
    // Use native lazy loading as fallback, but also use IntersectionObserver for better control
    if ('loading' in HTMLImageElement.prototype) {
      node.loading = 'lazy';
      node.onload = () => setImageLoaded((prev) => new Set(prev).add(postId));
      return;
    }
    
    // Fallback for browsers without native lazy loading
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const src = img.dataset.src;
          if (src && !imageLoaded.has(postId)) {
            img.src = src;
            img.onload = () => {
              setImageLoaded((prev) => new Set(prev).add(postId));
              observerRef.current?.unobserve(img);
            };
          }
        }
      });
    }, {
      rootMargin: '100px',
    });

    observerRef.current.observe(node);
  }, [imageLoaded]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-primary mb-2">Discover</h1>
          <p className="text-secondary">Explore amazing travel experiences from the community</p>
        </div>

        {/* Posts Feed - Instagram vertical layout with glass theme */}
        <div className="space-y-6">
          {posts.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <MapPin className="h-16 w-16 text-muted mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-primary mb-2">No posts yet</h3>
              <p className="text-secondary">Be the first to share your travel experience!</p>
            </div>
          ) : (
            posts.map((post) => {
              const likeInfo = postLikes[post.id] || { count: post.likes_count || 0, liked: false };
              const commentsCount = post.comments_count || postComments[post.id]?.length || 0;
              const isSaved = savedPosts.has(post.id);
              
              return (
              <div key={post.id} className="glass-card overflow-hidden">
                  {/* Top Bar - Profile picture, username, menu */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                  <img 
                    src={post.author_photo || '/default-avatar.png'} 
                    alt={post.author_name || 'User'}
                        className="w-10 h-10 rounded-full object-cover border border-white/20"
                      />
                      <div>
                        <span className="text-sm font-semibold text-primary block">{post.author_name || 'Anonymous'}</span>
                        {post.location && (
                          <span className="text-xs text-secondary flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                      {post.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="relative menu-container">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuPostId(openMenuPostId === post.id ? null : post.id);
                        }}
                        className="text-primary hover:opacity-70 transition-opacity"
                        aria-label="More options"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      
                      {/* Dropdown Menu */}
                      {openMenuPostId === post.id && (
                        <>
                          {/* Backdrop to close menu */}
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setOpenMenuPostId(null)}
                          />
                          {/* Menu */}
                          <div className="absolute right-0 top-full mt-2 z-[100] glass-card rounded-lg border border-white/20 shadow-xl min-w-[200px] overflow-hidden bg-black/90 backdrop-blur-md">
                            {post.author_id === user?.uid ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuPostId(null);
                                  handleDelete(post.id);
                                }}
                                disabled={isDeleting === post.id}
                                className="w-full px-4 py-3 text-left text-red-400 hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                              >
                                {isDeleting === post.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Deleting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <div className="w-full px-4 py-3 text-left text-secondary text-sm">
                                You can only delete your own posts
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuPostId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-primary hover:bg-white/10 transition-colors border-t border-white/10"
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                </div>

                  {/* Square Image (1:1 ratio, full width) */}
                {post.media_urls && post.media_urls.length > 0 && (
                    <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                      {!imageLoaded.has(post.id) && (
                        <div 
                          className="absolute inset-0 bg-white/5 flex items-center justify-center z-0"
                        >
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/30"></div>
                        </div>
                      )}
                      <img 
                        ref={(node) => imageRef(node, post.id)}
                      src={post.media_urls[0]} 
                        data-src={post.media_urls[0]}
                        alt={post.caption || 'Post'}
                        loading="lazy"
                        className={`w-full h-full object-cover ${imageLoaded.has(post.id) ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
                        onLoad={() => setImageLoaded((prev) => new Set(prev).add(post.id))}
                    />
                    {post.media_urls.length > 1 && (
                        <div className="absolute top-2 right-2 glass-card px-2 py-1 rounded text-xs text-primary font-medium z-10">
                        +{post.media_urls.length - 1}
                      </div>
                    )}
                  </div>
                )}

                  {/* Action Buttons - Instagram style */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => handleLike(post.id)}
                          disabled={isLiking === post.id || !user}
                          className={`transition-all disabled:opacity-50 active:scale-95 ${
                            likeInfo.liked ? 'text-red-500' : 'text-primary'
                          }`}
                        >
                          <Heart className={`h-6 w-6 ${likeInfo.liked ? 'fill-current' : ''}`} />
                        </button>
                        
                        <button
                          onClick={() => handleOpenPostDetail(post)}
                          className="text-primary hover:opacity-70 transition-opacity active:scale-95"
                        >
                          <MessageCircle className="h-6 w-6" />
                        </button>
                        
                        <button
                          onClick={() => handleShare(post)}
                          disabled={!user}
                          className="text-primary hover:opacity-70 transition-opacity disabled:opacity-50 active:scale-95"
                        >
                          <Share2 className="h-6 w-6" />
                        </button>
                      </div>
                      
                      <button
                        onClick={() => handleSave(post.id)}
                        disabled={isBookmarking === post.id || !user}
                        className={`transition-all active:scale-95 disabled:opacity-50 ${
                          isSaved ? 'text-yellow-400' : 'text-primary hover:opacity-70'
                        }`}
                      >
                        {isBookmarking === post.id ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Bookmark className={`h-6 w-6 ${isSaved ? 'fill-current' : ''}`} />
                        )}
                      </button>
                    </div>

                    {/* Likes Count */}
                    {likeInfo.count > 0 && (
                      <div className="mb-1">
                        <span className="text-sm font-semibold text-primary">
                          {likeInfo.count.toLocaleString()} {likeInfo.count === 1 ? 'like' : 'likes'}
                        </span>
                    </div>
                  )}

                    {/* Caption - Username in bold + text */}
                    <div className="mb-1">
                      <span className="text-sm font-semibold text-primary mr-2">
                        {post.author_name || 'Anonymous'}
                      </span>
                      <span className="text-sm text-primary">{post.caption}</span>
                    </div>

                    {/* View Comments */}
                    {commentsCount > 0 && (
                      <button 
                        onClick={() => handleOpenPostDetail(post)}
                        className="text-sm text-secondary hover:text-primary mb-1 transition-colors"
                      >
                        View all {commentsCount} {commentsCount === 1 ? 'comment' : 'comments'}
                      </button>
                    )}

                    {/* Posted Time - Small gray text */}
                    <div className="text-xs text-muted mt-1">
                      {formatRelativeTime(post.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Post Detail Modal (for comments) - Glass theme */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-card max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row border border-white/20">
            {/* Left: Image - Square on mobile, full height on desktop */}
            <div className="w-full md:w-1/2 flex items-center justify-center bg-black/20" style={{ minHeight: '50vh' }}>
              <img
                src={selectedPost.media_urls[0] || ''}
                alt={selectedPost.caption || 'Post'}
                className="w-full h-full object-contain max-h-[90vh]"
                style={{ aspectRatio: '1 / 1' }}
              />
            </div>

            {/* Right: Comments and Interactions */}
            <div className="w-full md:w-1/2 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedPost.author_photo || '/default-avatar.png'}
                    alt={selectedPost.author_name || 'User'}
                    className="w-8 h-8 rounded-full object-cover border border-white/20"
                  />
                  <span className="text-sm font-semibold text-primary">{selectedPost.author_name || 'Anonymous'}</span>
                </div>
                <div className="relative menu-container">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuPostId(openMenuPostId === selectedPost.id ? null : selectedPost.id);
                    }}
                    className="text-primary hover:opacity-70 transition-opacity"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  
                  {/* Dropdown Menu */}
                  {openMenuPostId === selectedPost.id && (
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpenMenuPostId(null)}
                      />
                      {/* Menu */}
                      <div className="absolute right-0 top-full mt-2 z-[100] glass-card rounded-lg border border-white/20 shadow-xl min-w-[200px] overflow-hidden bg-black/90 backdrop-blur-md">
                        {selectedPost.author_id === user?.uid ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuPostId(null);
                              handleDelete(selectedPost.id);
                            }}
                            disabled={isDeleting === selectedPost.id}
                            className="w-full px-4 py-3 text-left text-red-400 hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {isDeleting === selectedPost.id ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Deleting...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="w-full px-4 py-3 text-left text-secondary text-sm">
                            You can only delete your own posts
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuPostId(null);
                            if (commentUnsubscribeRef.current) {
                              commentUnsubscribeRef.current();
                              commentUnsubscribeRef.current = null;
                            }
                            setSelectedPost(null);
                            setNewComment('');
                          }}
                          className="w-full px-4 py-3 text-left text-primary hover:bg-white/10 transition-colors border-t border-white/10"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Scrollable Content: Caption + Comments */}
              <div className="flex-1 overflow-y-auto">
                {/* Caption */}
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-start gap-3">
                    <img
                      src={selectedPost.author_photo || '/default-avatar.png'}
                      alt={selectedPost.author_name || 'User'}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-white/20"
                    />
                    <div className="flex-1">
                      <div className="mb-1">
                        <span className="text-sm font-semibold text-primary mr-2">
                          {selectedPost.author_name || 'Anonymous'}
                        </span>
                        <span className="text-sm text-primary">{selectedPost.caption}</span>
                      </div>
                      {selectedPost.location && (
                        <div className="text-xs text-secondary flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {selectedPost.location}
                        </div>
                      )}
                      <div className="text-xs text-muted mt-2">
                        {formatRelativeTime(selectedPost.created_at)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comments Section */}
                <div className="p-4 space-y-4">
                  {postComments[selectedPost.id]?.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/20">
                        <span className="text-xs font-semibold text-primary">
                          {comment.user_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="mb-1">
                          <span className="text-sm font-semibold text-primary mr-2">{comment.user_name}</span>
                          <span className="text-sm text-primary">{comment.comment_text}</span>
                        </div>
                        <div className="text-xs text-muted mt-1">
                          {formatRelativeTime(comment.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!postComments[selectedPost.id] || postComments[selectedPost.id].length === 0) && (
                    <div className="text-center py-8 text-secondary text-sm">
                      No comments yet. {user ? 'Be the first to comment!' : 'Log in to comment'}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Bar - Glass theme */}
              <div className="p-4 border-t border-white/10 flex-shrink-0">
                {/* Like/Comment/Share Buttons */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => handleLike(selectedPost.id)}
                      disabled={isLiking === selectedPost.id || !user}
                      className={`transition-all disabled:opacity-50 active:scale-95 ${
                        postLikes[selectedPost.id]?.liked ? 'text-red-500' : 'text-primary'
                      }`}
                    >
                      <Heart className={`h-6 w-6 ${postLikes[selectedPost.id]?.liked ? 'fill-current' : ''}`} />
                    </button>
                    
                    <button
                      className="text-primary hover:opacity-70 transition-opacity active:scale-95"
                    >
                      <MessageCircle className="h-6 w-6" />
                    </button>
                    
                    <button
                      onClick={() => handleShare(selectedPost)}
                      disabled={!user}
                      className="text-primary hover:opacity-70 transition-opacity disabled:opacity-50 active:scale-95"
                    >
                      <Share2 className="h-6 w-6" />
                    </button>
                  </div>
                  
                  <button
                    onClick={() => handleSave(selectedPost.id)}
                    disabled={isBookmarking === selectedPost.id || !user}
                    className={`transition-all active:scale-95 disabled:opacity-50 ${
                      savedPosts.has(selectedPost.id) ? 'text-yellow-400' : 'text-primary hover:opacity-70'
                    }`}
                  >
                    {isBookmarking === selectedPost.id ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Bookmark className={`h-6 w-6 ${savedPosts.has(selectedPost.id) ? 'fill-current' : ''}`} />
                    )}
                  </button>
                </div>

                {/* Likes Count */}
                {postLikes[selectedPost.id] && postLikes[selectedPost.id].count > 0 && (
                  <div className="text-sm font-semibold text-primary mb-2">
                    {postLikes[selectedPost.id].count.toLocaleString()} {postLikes[selectedPost.id].count === 1 ? 'like' : 'likes'}
                  </div>
                )}

                {/* Add Comment */}
                {user ? (
                  <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddComment();
                        }
                      }}
                      placeholder="Add a comment..."
                      className="flex-1 glass-input px-3 py-2 rounded-lg text-sm text-primary"
                      disabled={isAddingComment}
                    />
                    <button
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || isAddingComment}
                      className="premium-button-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAddingComment ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        'Post'
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-2 text-sm text-secondary">
                    <button
                      onClick={() => {
                        alert('Please log in to comment on posts.');
                      }}
                      className="text-primary hover:opacity-70"
                    >
                      Log in to comment
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoverPage;