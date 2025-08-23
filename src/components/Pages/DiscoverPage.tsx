import React, { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share, MapPin, Calendar, Users } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

interface TripPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  tripId: string;
  caption: string;
  mediaUrls: string[];
  location: string;
  tags: string[];
  likesCount: number;
  commentsCount: number;
  timestamp: any;
}

const DiscoverPage: React.FC = () => {
  const [posts, setPosts] = useState<TripPost[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const postsQuery = query(
      collection(db, 'posts'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TripPost[];
      
      setPosts(postsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLike = async (postId: string) => {
    if (!user) return;
    
    try {
      await updateDoc(doc(db, 'posts', postId), {
        likesCount: increment(1)
      });
    } catch (error) {
      console.error('Error liking post:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-4">Discover</h1>
          <p className="text-xl text-secondary">Explore amazing travel experiences from the community</p>
        </div>

        {/* Posts Feed */}
        <div className="space-y-6">
          {posts.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 glass-card rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="h-8 w-8 text-muted" />
              </div>
              <h3 className="text-xl font-semibold text-primary mb-2">No posts yet</h3>
              <p className="text-secondary">Be the first to share your travel experience!</p>
            </div>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="glass-card overflow-hidden">
                {/* Post Header */}
                <div className="p-4 flex items-center space-x-3">
                  <img 
                    src={post.authorPhoto || '/default-avatar.png'} 
                    alt={post.authorName}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-primary">{post.authorName}</h3>
                    <div className="flex items-center text-sm text-secondary">
                      <MapPin className="h-4 w-4 mr-1" />
                      {post.location}
                    </div>
                  </div>
                  <div className="text-sm text-muted">
                    {post.timestamp?.toDate?.()?.toLocaleDateString() || 'Recently'}
                  </div>
                </div>

                {/* Post Media */}
                {post.mediaUrls.length > 0 && (
                  <div className="relative">
                    <img 
                      src={post.mediaUrls[0]} 
                      alt="Trip experience"
                      className="w-full h-80 object-cover"
                    />
                    {post.mediaUrls.length > 1 && (
                      <div className="absolute top-4 right-4 glass-card px-2 py-1 rounded-full text-sm text-primary">
                        +{post.mediaUrls.length - 1}
                      </div>
                    )}
                  </div>
                )}

                {/* Post Content */}
                <div className="p-4">
                  <p className="text-primary mb-3">{post.caption}</p>
                  
                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {post.tags.map((tag, index) => (
                        <span key={index} className="glass-card px-2 py-1 rounded-full text-sm text-secondary">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Post Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <div className="flex items-center space-x-6">
                      <button 
                        onClick={() => handleLike(post.id)}
                        className="flex items-center space-x-2 text-secondary hover:text-primary transition-colors"
                      >
                        <Heart className="h-5 w-5" />
                        <span className="text-sm">{post.likesCount}</span>
                      </button>
                      
                      <button className="flex items-center space-x-2 text-secondary hover:text-primary transition-colors">
                        <MessageCircle className="h-5 w-5" />
                        <span className="text-sm">{post.commentsCount}</span>
                      </button>
                      
                      <button className="flex items-center space-x-2 text-secondary hover:text-primary transition-colors">
                        <Share className="h-5 w-5" />
                        <span className="text-sm">Share</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscoverPage;