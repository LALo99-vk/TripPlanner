import React, { useState, useEffect } from 'react';
import { MapPin, Users, Calendar, Settings, Grid, Heart, Edit2, X, Save, Camera, Map } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { listUserPlans, SavedPlanRecord, subscribeUserPlans } from '../../services/planRepository';
import { planStore } from '../../services/planStore';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';
import { updateProfile } from 'firebase/auth';

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
  const [activeTab, setActiveTab] = useState<'plans' | 'posts' | 'liked'>('plans');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [plans, setPlans] = useState<SavedPlanRecord[]>([]);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
          const profileData = {
            displayName: data.display_name || '',
            photoURL: data.photo_url || '',
            bio: data.bio || '',
            followersCount: data.followers_count || 0,
            followingCount: data.following_count || 0,
            tripsCount: data.trips_count || 0,
          };
          setProfile(profileData);
          setEditName(profileData.displayName || user?.displayName || '');
        } else {
          // If no profile exists, initialize with Firebase user data
          setEditName(user?.displayName || '');
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
    
    // Listen for profile updates to refresh the page
    const handleProfileUpdate = async () => {
      // Reload profile from Supabase when updated
      try {
        const supabase = await getAuthenticatedSupabaseClient();
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.uid)
          .single();

        if (data) {
          setProfile({
            displayName: data.display_name || '',
            photoURL: data.photo_url || '',
            bio: data.bio || '',
            followersCount: data.followers_count || 0,
            followingCount: data.following_count || 0,
            tripsCount: data.trips_count || 0,
          });
          setEditName(data.display_name || user?.displayName || '');
        }
      } catch (error) {
        console.error('Error reloading profile after update:', error);
      }
    };
    
    window.addEventListener('profileUpdated', handleProfileUpdate);
    
    return () => {
      unsubPlans();
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, [user]);

  // Handle photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const supabase = await getAuthenticatedSupabaseClient();
      let photoURL = profile?.photoURL || user.photoURL || '';

      // Upload new photo if selected
      if (editPhoto) {
        try {
          // Validate file type
          if (!editPhoto.type.startsWith('image/')) {
            throw new Error('Please select an image file');
          }
          
          // Validate file size (max 5MB)
          const maxSize = 5 * 1024 * 1024; // 5MB
          if (editPhoto.size > maxSize) {
            throw new Error('Image size must be less than 5MB');
          }
          
          // Generate unique filename
          const fileExtension = editPhoto.name.split('.').pop() || 'jpg';
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
          const filePath = `profile-photos/${user.uid}/${fileName}`;
          
          console.log('📤 Uploading profile photo to Supabase Storage...');
          
          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-photos')
            .upload(filePath, editPhoto, {
              cacheControl: '3600',
              upsert: false
            });
          
          if (uploadError) {
            throw uploadError;
          }
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('profile-photos')
            .getPublicUrl(filePath);
          
          photoURL = urlData.publicUrl;
          console.log('✅ Profile photo uploaded successfully:', photoURL);
        } catch (uploadError: any) {
          console.error('❌ Error uploading profile photo:', uploadError);
          alert(`Failed to upload photo: ${uploadError.message || 'Unknown error'}\n\nMake sure Supabase Storage bucket "profile-photos" exists.`);
          setIsSaving(false);
          return;
        }
      }

      // Update profile in Supabase
      const { error } = await supabase
        .from('users')
        .upsert({
          id: user.uid,
          display_name: editName.trim() || user.displayName || 'User',
          photo_url: photoURL,
          email: user.email,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (error) {
        console.error('❌ Error saving profile to Supabase:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        alert(`Failed to save profile: ${error.message || 'Unknown error'}. Please check console for details.`);
        setIsSaving(false);
        return;
      }
      
      console.log('✅ Profile saved to Supabase successfully');

      // Update Firebase Auth profile (this will trigger auth state change)
      if (user) {
        try {
          await updateProfile(user, {
            displayName: editName.trim() || user.displayName || 'User',
            photoURL: photoURL,
          });
          console.log('✅ Firebase Auth profile updated successfully');
        } catch (authError: any) {
          console.error('⚠️ Error updating Firebase Auth profile:', authError);
          // Don't fail the whole operation, just log the error
          // The Supabase update already succeeded
        }
      }

      // Reload profile from Supabase to ensure we have the latest data
      const { data: updatedData } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.uid)
        .single();

      if (updatedData) {
        setProfile({
          displayName: updatedData.display_name || '',
          photoURL: updatedData.photo_url || '',
          bio: updatedData.bio || '',
          followersCount: updatedData.followers_count || 0,
          followingCount: updatedData.following_count || 0,
          tripsCount: updatedData.trips_count || 0,
        });
      } else {
        // Fallback: update local state if Supabase query fails
        setProfile(prev => ({
          ...prev!,
          displayName: editName.trim() || user.displayName || 'User',
          photoURL: photoURL,
        }));
      }

      setIsEditing(false);
      setEditPhoto(null);
      setPhotoPreview(null);
      
      // Dispatch event to update profile name across app (before showing success)
      window.dispatchEvent(new CustomEvent('profileUpdated'));
      
      // Show success message
      console.log('✅ Profile updated successfully!');
      console.log('✅ Changes synced to:');
      console.log('   - Supabase Database');
      console.log('   - Firebase Auth');
      console.log('   - App UI (Sidebar, Group Page, Profile Page)');
    } catch (error: any) {
      console.error('❌ Error saving profile:', error);
      console.error('Error stack:', error.stack);
      alert(`Failed to save profile: ${error.message || 'Unknown error'}. Please check console for details.`);
      setIsSaving(false);
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditName(profile?.displayName || user?.displayName || '');
    setEditPhoto(null);
    setPhotoPreview(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/30"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center glass-card p-8">
          <h2 className="text-2xl font-bold text-primary mb-2">Profile not found</h2>
          <p className="text-secondary">Please sign in to view your profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="content-container p-4 md:p-6">
        {/* Profile Header */}
        <div className="glass-card p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-8">
            {/* Profile Picture */}
            <div className="relative group">
              <img 
                src={photoPreview || profile?.photoURL || user?.photoURL || '/default-avatar.png'} 
                alt={profile?.displayName || user?.displayName || 'User'}
                className="w-32 h-32 rounded-full border-4 border-white/20 shadow-lg object-cover"
              />
              {isEditing && (
                <>
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer hover:bg-black/60 transition-colors">
                    <Camera className="h-6 w-6 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                </>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left w-full">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary mb-2">Display Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Enter your name"
                      className="glass-input w-full px-4 py-2 rounded-lg text-primary focus:ring-2 focus:ring-white/30 focus:border-white/30"
                      maxLength={50}
                    />
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="flex-1 premium-button-primary flex items-center justify-center disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="flex-1 premium-button-secondary flex items-center justify-center disabled:opacity-50"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row md:items-center md:space-x-4 mb-4">
                    <h1 className="text-3xl font-bold text-primary">
                      {profile?.displayName || user?.displayName || 'User'}
                    </h1>
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="mt-2 md:mt-0 premium-button-secondary flex items-center justify-center"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Profile
                    </button>
                  </div>

              {/* Stats */}
              <div className="flex justify-center md:justify-start space-x-8 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{profile?.tripsCount || plans.length}</div>
                  <div className="text-sm text-secondary">Trips</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{profile?.followersCount || 0}</div>
                  <div className="text-sm text-secondary">Followers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{profile?.followingCount || 0}</div>
                  <div className="text-sm text-secondary">Following</div>
                </div>
              </div>

                  {/* Bio */}
                  <p className="text-secondary max-w-md">
                    {profile?.bio || "Travel enthusiast exploring the world one adventure at a time ✈️"}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="glass-card overflow-hidden mb-6">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('plans')}
              className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                activeTab === 'plans'
                  ? 'text-primary border-b-2 border-white/30 bg-white/5'
                  : 'text-secondary hover:text-primary hover:bg-white/5'
              }`}
            >
              <Map className="h-5 w-5 mr-2" />
              My Plans ({plans.length})
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                activeTab === 'posts'
                  ? 'text-primary border-b-2 border-white/30 bg-white/5'
                  : 'text-secondary hover:text-primary hover:bg-white/5'
              }`}
            >
              <Grid className="h-5 w-5 mr-2" />
              Posts ({posts.length})
            </button>
            <button
              onClick={() => setActiveTab('liked')}
              className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                activeTab === 'liked'
                  ? 'text-primary border-b-2 border-white/30 bg-white/5'
                  : 'text-secondary hover:text-primary hover:bg-white/5'
              }`}
            >
              <Heart className="h-5 w-5 mr-2" />
              Liked
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'plans' && (
              <div>
                {plans.length === 0 ? (
                  <div className="text-center py-12">
                    <Map className="h-16 w-16 text-muted mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-primary mb-2">No saved plans yet</h3>
                    <p className="text-secondary mb-4">Generate a trip plan and save it to see it here!</p>
                    <button
                      onClick={() => {
                        const evt = new CustomEvent('navigate', { detail: { page: 'plan' } });
                        window.dispatchEvent(evt as any);
                      }}
                      className="premium-button-primary"
                    >
                      Plan My Trip
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {plans.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          planStore.setPlan(p.plan);
                          const evt = new CustomEvent('navigate', { detail: { page: 'yourplan' } });
                          window.dispatchEvent(evt as any);
                        }}
                        className="w-full text-left glass-card p-5 hover:bg-white/10 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="font-semibold text-primary text-lg mb-1">{p.name}</div>
                            <div className="text-sm text-secondary flex items-center">
                              <MapPin className="h-4 w-4 mr-1" />
                              {p.plan.overview.from} → {p.plan.overview.to}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                          <div className="text-xs text-muted">
                            {p.plan.overview.durationDays} Days • {p.plan.overview.travelers} Traveler{p.plan.overview.travelers > 1 ? 's' : ''}
                          </div>
                          <div className="text-xs text-muted">
                            {p.createdAt instanceof Date 
                              ? p.createdAt.toLocaleDateString() 
                              : typeof p.createdAt === 'string' 
                                ? new Date(p.createdAt).toLocaleDateString() 
                                : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'posts' && (
              <div>
                {posts.length === 0 ? (
                  <div className="text-center py-12">
                    <MapPin className="h-16 w-16 text-muted mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-primary mb-2">No posts yet</h3>
                    <p className="text-secondary mb-4">Share your travel experiences to get started!</p>
                    <button className="premium-button-primary">
                      Share Your First Trip
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posts.map((post) => (
                      <div key={post.id} className="glass-card overflow-hidden hover:bg-white/10 transition-all cursor-pointer">
                        {post.mediaUrls.length > 0 && (
                          <img 
                            src={post.mediaUrls[0]} 
                            alt="Trip experience"
                            className="w-full h-48 object-cover"
                          />
                        )}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center text-sm text-secondary">
                              <MapPin className="h-4 w-4 mr-1" />
                              {post.location}
                            </div>
                            <div className="flex items-center text-sm text-secondary">
                              <Heart className="h-4 w-4 mr-1" />
                              {post.likesCount}
                            </div>
                          </div>
                          <p className="text-primary text-sm line-clamp-2">{post.caption}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'liked' && (
              <div className="text-center py-12">
                <Heart className="h-16 w-16 text-muted mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-primary mb-2">No liked posts yet</h3>
                <p className="text-secondary">Posts you like will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;