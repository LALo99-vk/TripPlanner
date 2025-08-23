import React, { useState, useEffect } from 'react';
import { MapPin, Users, Calendar, Settings, Grid, Heart } from 'lucide-react';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../hooks/useAuth';

interface UserProfile {
  displayName: string;
  photoURL: string;
  bio: string;
  followersCount: number;
  followingCount: number;
  tripsCount: number;
}

interface TripPost {
  id: string;
  mediaUrls: string[];
  caption: string;
  location: string;
  likesCount: number;
  timestamp: any;
}

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<TripPost[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'liked'>('posts');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Load user profile
    const loadProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    // Load user's posts
    const postsQuery = query(
      collection(db, 'posts'),
      where('authorId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TripPost[];
      
      setPosts(postsData);
      setLoading(false);
    });

    loadProfile();
    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile not found</h2>
          <p className="text-gray-600">Please sign in to view your profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto p-4">
        {/* Profile Header */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-8">
            {/* Profile Picture */}
            <div className="relative">
              <img 
                src={profile.photoURL || user.photoURL || '/default-avatar.png'} 
                alt={profile.displayName || user.displayName || 'User'}
                className="w-32 h-32 rounded-full border-4 border-white shadow-lg"
              />
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row md:items-center md:space-x-4 mb-4">
                <h1 className="text-3xl font-bold text-gray-900">
                  {profile.displayName || user.displayName || 'User'}
                </h1>
                <button className="mt-2 md:mt-0 bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  Edit Profile
                </button>
              </div>

              {/* Stats */}
              <div className="flex justify-center md:justify-start space-x-8 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{profile.tripsCount}</div>
                  <div className="text-sm text-gray-600">Trips</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{profile.followersCount}</div>
                  <div className="text-sm text-gray-600">Followers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{profile.followingCount}</div>
                  <div className="text-sm text-gray-600">Following</div>
                </div>
              </div>

              {/* Bio */}
              <p className="text-gray-700 max-w-md">
                {profile.bio || "Travel enthusiast exploring the world one adventure at a time ✈️"}
              </p>
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('posts')}
              className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                activeTab === 'posts'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Grid className="h-5 w-5 mr-2" />
              Posts ({posts.length})
            </button>
            <button
              onClick={() => setActiveTab('liked')}
              className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                activeTab === 'liked'
                  ? 'text-orange-600 border-b-2 border-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Heart className="h-5 w-5 mr-2" />
              Liked
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'posts' && (
              <div>
                {posts.length === 0 ? (
                  <div className="text-center py-12">
                    <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">No posts yet</h3>
                    <p className="text-gray-600 mb-4">Share your travel experiences to get started!</p>
                    <button className="bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors">
                      Share Your First Trip
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posts.map((post) => (
                      <div key={post.id} className="bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                        {post.mediaUrls.length > 0 && (
                          <img 
                            src={post.mediaUrls[0]} 
                            alt="Trip experience"
                            className="w-full h-48 object-cover"
                          />
                        )}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center text-sm text-gray-600">
                              <MapPin className="h-4 w-4 mr-1" />
                              {post.location}
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <Heart className="h-4 w-4 mr-1" />
                              {post.likesCount}
                            </div>
                          </div>
                          <p className="text-gray-900 text-sm line-clamp-2">{post.caption}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'liked' && (
              <div className="text-center py-12">
                <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No liked posts yet</h3>
                <p className="text-gray-600">Posts you like will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;