import React, { useState, useEffect } from 'react';
import { MapPin, Users, Calendar, Settings, Grid, Heart } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { listUserPlans, SavedPlanRecord, subscribeUserPlans } from '../../services/planRepository';
import { planStore } from '../../services/planStore';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';

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
  const [plans, setPlans] = useState<SavedPlanRecord[]>([]);

  useEffect(() => {
    if (!user) return;

    // Load user profile from Supabase
    const loadProfile = async () => {
      try {
        const supabase = await getAuthenticatedSupabaseClient();
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.uid)
          .single();

        if (error) {
          console.error('Error loading profile:', error);
          setLoading(false);
          return;
        }

        if (data) {
          setProfile({
            displayName: data.display_name || '',
            photoURL: data.photo_url || '',
            bio: data.bio || '',
            followersCount: data.followers_count || 0,
            followingCount: data.following_count || 0,
            tripsCount: data.trips_count || 0,
          });
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    // Load user's posts from Supabase
    const loadPosts = async () => {
      try {
        const supabase = await getAuthenticatedSupabaseClient();
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('author_id', user.uid)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error loading posts:', error);
          setLoading(false);
          return;
        }

        if (data) {
          const postsData: TripPost[] = data.map((post) => ({
            id: post.id,
            mediaUrls: post.media_urls || [],
            caption: post.caption || '',
            location: post.location || '',
            likesCount: post.likes_count || 0,
            timestamp: post.created_at,
          }));
          setPosts(postsData);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error loading posts:', error);
        setLoading(false);
      }
    };

    loadProfile();
    loadPosts();

    // Load user's saved plans (history) in real-time
    const unsubPlans = subscribeUserPlans(user.uid, (recs) => setPlans(recs));
    
    return () => {
      unsubPlans();
    };
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
                  <div className="text-2xl font-bold text-gray-900">{profile.tripsCount || plans.length}</div>
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

        {/* Trip History */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Trip History</h2>
            <div className="text-sm text-gray-600">{plans.length} saved plan{plans.length === 1 ? '' : 's'}</div>
          </div>
          {plans.length === 0 ? (
            <div className="text-gray-600 text-sm">No saved plans yet. Generate a plan and tap “Save to Profile”.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    planStore.setPlan(p.plan);
                    const evt = new CustomEvent('navigate', { detail: { page: 'yourplan' } });
                    window.dispatchEvent(evt as any);
                  }}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="font-semibold text-gray-900">{p.name}</div>
                  <div className="text-sm text-gray-600">{p.plan.overview.from} → {p.plan.overview.to} • {p.plan.overview.durationDays} Days</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {p.createdAt instanceof Date 
                      ? p.createdAt.toLocaleString() 
                      : typeof p.createdAt === 'string' 
                        ? new Date(p.createdAt).toLocaleString() 
                        : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
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