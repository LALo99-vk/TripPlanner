import React, { useState, useEffect } from 'react';
import { MapPin, Grid, Heart, Edit2, X, Save, Camera, Map, Loader2, Upload, MessageCircle, Share2, Send, Bookmark } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { SavedPlanRecord, subscribeUserPlans } from '../../services/planRepository';
import { planStore } from '../../services/planStore';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';
import { updateProfile } from 'firebase/auth';
import { getMedicalProfile, upsertMedicalProfile } from '../../services/medicalProfileRepository';
import { updateUserDisplayNameInGroups } from '../../services/groupRepository';
import { 
  createPost, 
  subscribeUserPosts, 
  uploadPostImage, 
  togglePostLike,
  getPostComments,
  addPostComment,
  sharePost,
  getUserBookmarkedPosts,
  type PostRecord,
  type PostComment
} from '../../services/postRepository';

interface UserProfile {
  displayName: string;
  photoURL: string;
  bio: string;
  homeLocation: string;
  followersCount: number;
  followingCount: number;
  tripsCount: number;
}

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'plans' | 'posts' | 'bookmarked'>('plans');
  const [bookmarkedPosts, setBookmarkedPosts] = useState<PostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [plans, setPlans] = useState<SavedPlanRecord[]>([]);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHomeLocation, setEditHomeLocation] = useState('');
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Medical profile state
  const [medicalBloodType, setMedicalBloodType] = useState('');
  const [medicalAllergiesInput, setMedicalAllergiesInput] = useState('');
  const [medicalConditionsInput, setMedicalConditionsInput] = useState('');
  const [medicalEmergencyName, setMedicalEmergencyName] = useState('');
  const [medicalEmergencyPhone, setMedicalEmergencyPhone] = useState('');
  const [, setIsMedicalLoading] = useState(false);
  
  // Post creation state
  const [showPostModal, setShowPostModal] = useState(false);
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [postCaption, setPostCaption] = useState('');
  const [postLocation, setPostLocation] = useState('');
  const [isUploadingPost, setIsUploadingPost] = useState(false);
  
  // Post interaction state
  const [selectedPost, setSelectedPost] = useState<PostRecord | null>(null);
  const [postLikes, setPostLikes] = useState<Record<string, { count: number; liked: boolean }>>({});
  const [postComments, setPostComments] = useState<Record<string, PostComment[]>>({});
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [isLiking, setIsLiking] = useState<string | null>(null);

  // Load bookmarked posts when tab is active
  useEffect(() => {
    if (!user || activeTab !== 'bookmarked') return;

    const loadBookmarkedPosts = async () => {
      try {
        const bookmarked = await getUserBookmarkedPosts(user.uid);
        setBookmarkedPosts(bookmarked);
      } catch (error) {
        console.error('Error loading bookmarked posts:', error);
      }
    };

    loadBookmarkedPosts();
  }, [user, activeTab]);

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
            homeLocation: data.home_location || '',
            followersCount: data.followers_count || 0,
            followingCount: data.following_count || 0,
            tripsCount: data.trips_count || 0,
          };
          setProfile(profileData);
          setEditName(profileData.displayName || user?.displayName || '');
          setEditHomeLocation(profileData.homeLocation || '');
        } else {
          // If no profile exists, initialize with Firebase user data
          setEditName(user?.displayName || '');
          setEditHomeLocation('');
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();

    // Subscribe to user posts in real-time
    const unsubscribePosts = subscribeUserPosts(user.uid, (updatedPosts) => {
      setPosts(updatedPosts);
      setLoading(false);
    });

    // Load medical profile (Supabase first, then localStorage fallback)
    const loadMedical = async () => {
      try {
        setIsMedicalLoading(true);
        const profile = await getMedicalProfile(user.uid);
        if (profile) {
          setMedicalBloodType(profile.bloodType || '');
          setMedicalAllergiesInput(profile.allergies.join(', '));
          setMedicalConditionsInput(profile.medicalConditions.join(', '));
          setMedicalEmergencyName(profile.emergencyContactName || '');
          setMedicalEmergencyPhone(profile.emergencyContactPhone || '');
        }
      } catch (error) {
        console.error('Error loading medical profile:', error);
      } finally {
        setIsMedicalLoading(false);
      }
    };

    loadMedical();

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
            homeLocation: data.home_location || '',
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
      unsubscribePosts();
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

  // Save profile changes (including medical info)
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
          const { error: uploadError } = await supabase.storage
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
          home_location: editHomeLocation.trim() || null,
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

      // Upsert medical profile in Supabase
      try {
        const allergies = medicalAllergiesInput
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        const conditions = medicalConditionsInput
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0);

        await upsertMedicalProfile(user.uid, {
          bloodType: medicalBloodType.trim() || null,
          allergies,
          medicalConditions: conditions,
          emergencyContactName: medicalEmergencyName.trim() || null,
          emergencyContactPhone: medicalEmergencyPhone.trim() || null,
        });

        console.log('✅ Medical profile saved successfully');
      } catch (medError) {
        console.error('❌ Error saving medical profile:', medError);
        // Do not block main profile save; just log the error
      }

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
          homeLocation: updatedData.home_location || '',
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
          homeLocation: editHomeLocation.trim() || '',
        }));
      }

      setIsEditing(false);
      setEditPhoto(null);
      setPhotoPreview(null);
      
      // Update display name in all groups user is a member of
      try {
        await updateUserDisplayNameInGroups(user.uid, editName.trim() || user.displayName || 'User');
        console.log('✅ Display name updated in all groups');
      } catch (groupUpdateError) {
        console.error('⚠️ Error updating display name in groups:', groupUpdateError);
        // Don't fail the whole operation, just log the error
      }
      
      // Dispatch event to update profile name across app (before showing success)
      window.dispatchEvent(new CustomEvent('profileUpdated'));
      
      // Show success message
      console.log('✅ Profile updated successfully!');
      console.log('✅ Changes synced to:');
      console.log('   - Supabase Database (users table)');
      console.log('   - Firebase Auth');
      console.log('   - All groups (groups.members & group_members.user_name)');
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

  // Handle post image selection
  const handlePostImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPostImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPostImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle post submission
  const handleSubmitPost = async () => {
    if (!user || !postImage || !postCaption.trim()) {
      return;
    }

    setIsUploadingPost(true);
    try {
      // Upload image first
      const imageUrl = await uploadPostImage(user.uid, postImage);

      // Create post with optimistic update
      const optimisticPost: PostRecord = {
        id: `temp_${Date.now()}`,
        author_id: user.uid,
        media_urls: [imageUrl],
        caption: postCaption.trim(),
        location: postLocation.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistic update: add post immediately
      setPosts((prev) => [optimisticPost, ...prev]);

      // Create post in database
      const savedPost = await createPost({
        userId: user.uid,
        imageUrl,
        caption: postCaption.trim(),
        location: postLocation.trim() || undefined,
      });

      // Replace optimistic post with real one
      setPosts((prev) => prev.map((p) => (p.id === optimisticPost.id ? savedPost : p)));

      // Reset form
      setPostImage(null);
      setPostImagePreview(null);
      setPostCaption('');
      setPostLocation('');
      setShowPostModal(false);
    } catch (error: any) {
      console.error('Error creating post:', error);
      // Remove optimistic post on error
      setPosts((prev) => prev.filter((p) => !p.id.startsWith('temp_')));
      alert(`Failed to create post: ${error.message || 'Unknown error'}`);
    } finally {
      setIsUploadingPost(false);
    }
  };

  // Close post modal and reset form
  const handleClosePostModal = () => {
    setShowPostModal(false);
    setPostImage(null);
    setPostImagePreview(null);
    setPostCaption('');
    setPostLocation('');
  };

  // Handle like/unlike post
  const handleLikePost = async (postId: string) => {
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

      const result = await togglePostLike(postId, user.uid);
      
      // Update with real data
      setPostLikes((prev) => ({
        ...prev,
        [postId]: {
          count: result.likesCount,
          liked: result.liked,
        },
      }));
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
  const handleOpenPostDetail = async (post: PostRecord) => {
    setSelectedPost(post);
    
    // Load comments
    try {
      const comments = await getPostComments(post.id);
      setPostComments((prev) => ({ ...prev, [post.id]: comments }));
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  };

  // Handle add comment
  const handleAddComment = async () => {
    if (!user || !selectedPost || !newComment.trim() || isAddingComment) return;

    setIsAddingComment(true);
    try {
      const userName = profile?.displayName || user.displayName || 'User';
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

      setNewComment('');
    } catch (error: any) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment. Please try again.');
    } finally {
      setIsAddingComment(false);
    }
  };

  // Handle share post
  const handleSharePost = async (post: PostRecord) => {
    if (!user) return;

    try {
      // Record share in database
      await sharePost(post.id, user.uid);

      // Copy post URL to clipboard
      const postUrl = `${window.location.origin}/profile?post=${post.id}`;
      await navigator.clipboard.writeText(postUrl);
      
      // Show success message (you can use a toast here)
      alert('Post link copied to clipboard!');
    } catch (error: any) {
      console.error('Error sharing post:', error);
      // Fallback: just copy URL
      try {
        const postUrl = `${window.location.origin}/profile?post=${post.id}`;
        await navigator.clipboard.writeText(postUrl);
        alert('Post link copied to clipboard!');
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
      }
    }
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
                  <div>
                    <label className="flex text-sm font-medium text-primary mb-2 items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Home Location
                    </label>
                    <input
                      type="text"
                      value={editHomeLocation}
                      onChange={(e) => setEditHomeLocation(e.target.value)}
                      placeholder="Enter your home city (e.g., Mumbai, Delhi)"
                      className="glass-input w-full px-4 py-2 rounded-lg text-primary focus:ring-2 focus:ring-white/30 focus:border-white/30"
                      maxLength={100}
                    />
                    <p className="text-xs text-secondary mt-1">
                      This helps us suggest the best travel options for your trips
                    </p>
                  </div>
                  {/* Medical Information (edited together with profile) */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">Blood Type</label>
                      <input
                        type="text"
                        value={medicalBloodType}
                        onChange={(e) => setMedicalBloodType(e.target.value)}
                        placeholder="e.g., O+, A-, B+"
                        className="glass-input w-full px-4 py-2 rounded-lg text-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">Emergency Contact Name</label>
                      <input
                        type="text"
                        value={medicalEmergencyName}
                        onChange={(e) => setMedicalEmergencyName(e.target.value)}
                        placeholder="Person to contact in emergencies"
                        className="glass-input w-full px-4 py-2 rounded-lg text-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">Allergies</label>
                      <input
                        type="text"
                        value={medicalAllergiesInput}
                        onChange={(e) => setMedicalAllergiesInput(e.target.value)}
                        placeholder="Comma separated (e.g., peanuts, penicillin)"
                        className="glass-input w-full px-4 py-2 rounded-lg text-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">Emergency Contact Phone</label>
                      <input
                        type="tel"
                        value={medicalEmergencyPhone}
                        onChange={(e) => setMedicalEmergencyPhone(e.target.value)}
                        placeholder="Phone number"
                        className="glass-input w-full px-4 py-2 rounded-lg text-primary"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-primary mb-1">Medical Conditions</label>
                      <input
                        type="text"
                        value={medicalConditionsInput}
                        onChange={(e) => setMedicalConditionsInput(e.target.value)}
                        placeholder="Comma separated (e.g., asthma, diabetes)"
                        className="glass-input w-full px-4 py-2 rounded-lg text-primary"
                      />
                      <p className="text-xs text-secondary mt-1">
                        Only include information you are comfortable sharing. This will be shown on your Emergency page.
                      </p>
                    </div>
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
              onClick={() => setActiveTab('bookmarked')}
              className={`flex-1 flex items-center justify-center py-4 px-6 font-medium transition-colors ${
                activeTab === 'bookmarked'
                  ? 'text-primary border-b-2 border-white/30 bg-white/5'
                  : 'text-secondary hover:text-primary hover:bg-white/5'
              }`}
            >
              <Bookmark className="h-5 w-5 mr-2" />
              Saved
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
                      className="premium-button-primary touch-manipulation touch-target active-scale"
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
                    <Camera className="h-16 w-16 text-secondary mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-primary mb-2">No posts yet</h3>
                    <p className="text-secondary mb-4">Share your travel experiences to get started!</p>
                    <button 
                      onClick={() => setShowPostModal(true)}
                      className="premium-button-primary touch-manipulation touch-target active-scale"
                    >
                      Share Your First Trip
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex justify-end">
                      <button
                        onClick={() => setShowPostModal(true)}
                        className="premium-button-primary touch-manipulation touch-target active-scale flex items-center gap-2"
                      >
                        <Camera className="h-4 w-4" />
                        New Post
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {posts.map((post) => {
                        const likeInfo = postLikes[post.id] || { count: post.likes_count || 0, liked: false };
                        const comments = postComments[post.id] || [];
                        const commentsCount = post.comments_count || comments.length || 0;
                        
                        return (
                          <div key={post.id} className="glass-card overflow-hidden hover:bg-white/10 transition-all group">
                            <div className="relative aspect-square overflow-hidden">
                              <img 
                                src={post.media_urls[0] || ''} 
                                alt={post.caption || 'Trip experience'}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                                onClick={() => handleOpenPostDetail(post)}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <div className="flex items-center gap-6 text-white">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLikePost(post.id);
                                    }}
                                    disabled={isLiking === post.id}
                                    className={`flex items-center gap-2 hover:scale-110 transition-transform disabled:opacity-50 ${
                                      likeInfo.liked ? 'text-red-400' : ''
                                    }`}
                                  >
                                    <Heart className={`h-6 w-6 ${likeInfo.liked ? 'fill-current' : ''}`} />
                                    <span className="text-base font-semibold">{likeInfo.count}</span>
                                  </button>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenPostDetail(post);
                                    }}
                                    className="flex items-center gap-2 hover:scale-110 transition-transform"
                                  >
                                    <MessageCircle className="h-6 w-6" />
                                    <span className="text-base font-semibold">{commentsCount}</span>
                                  </button>
                                  
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSharePost(post);
                                    }}
                                    className="flex items-center gap-2 hover:scale-110 transition-transform"
                                  >
                                    <Share2 className="h-6 w-6" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <button
                                  onClick={() => handleLikePost(post.id)}
                                  disabled={isLiking === post.id}
                                  className={`flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                    likeInfo.liked ? 'text-red-400' : 'text-secondary hover:text-red-400'
                                  }`}
                                >
                                  <Heart className={`h-4 w-4 ${likeInfo.liked ? 'fill-current' : ''}`} />
                                  <span className="text-sm font-semibold">{likeInfo.count}</span>
                                </button>
                                <button
                                  onClick={() => handleOpenPostDetail(post)}
                                  className="flex items-center gap-1 text-secondary hover:text-primary transition-colors"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                  <span className="text-sm font-semibold">{commentsCount}</span>
                                </button>
                              </div>
                              <p className="text-primary text-sm line-clamp-2 mb-2">{post.caption}</p>
                              {post.location && (
                                <div className="flex items-center text-xs text-secondary">
                                  <MapPin className="h-3 w-3 mr-1" />
                                  {post.location}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'bookmarked' && (
              <div>
                {bookmarkedPosts.length === 0 ? (
                  <div className="text-center py-12">
                    <Bookmark className="h-16 w-16 text-muted mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-primary mb-2">No saved posts yet</h3>
                    <p className="text-secondary mb-4">Bookmark posts you want to save for later!</p>
                    <button
                      onClick={() => {
                        const evt = new CustomEvent('navigate', { detail: { page: 'discover' } });
                        window.dispatchEvent(evt as any);
                      }}
                      className="premium-button-primary touch-manipulation touch-target active-scale"
                    >
                      Discover Posts
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bookmarkedPosts.map((post) => {
                      const likeInfo = postLikes[post.id] || { count: post.likes_count || 0, liked: false };
                      const comments = postComments[post.id] || [];
                      
                      return (
                        <div
                          key={post.id}
                          className="glass-card overflow-hidden cursor-pointer hover:bg-white/10 transition-all group"
                          onClick={() => handleOpenPostDetail(post)}
                        >
                          {/* Post Image */}
                          {post.media_urls && post.media_urls.length > 0 && (
                            <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                              <img
                                src={post.media_urls[0]}
                                alt={post.caption || 'Post'}
                                className="w-full h-full object-cover"
                              />
                              {post.media_urls.length > 1 && (
                                <div className="absolute top-2 right-2 glass-card px-2 py-1 rounded text-xs text-primary font-medium">
                                  +{post.media_urls.length - 1}
                                </div>
                              )}
                              {/* Hover overlay */}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <div className="flex items-center gap-4 text-white">
                                  <div className="flex items-center gap-1">
                                    <Heart className="h-5 w-5" />
                                    <span className="text-sm font-semibold">{likeInfo.count}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <MessageCircle className="h-5 w-5" />
                                    <span className="text-sm font-semibold">{comments.length}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post Creation Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-card max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-white/20">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-primary">Create New Post</h2>
                <button
                  onClick={handleClosePostModal}
                  disabled={isUploadingPost}
                  className="text-secondary hover:text-primary transition-colors disabled:opacity-50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Trip Photo *
                  </label>
                  {postImagePreview ? (
                    <div className="relative">
                      <img
                        src={postImagePreview}
                        alt="Post preview"
                        className="w-full h-64 object-cover rounded-lg border border-white/10"
                      />
                      <button
                        onClick={() => {
                          setPostImage(null);
                          setPostImagePreview(null);
                        }}
                        disabled={isUploadingPost}
                        className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-white/5">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Camera className="h-12 w-12 text-secondary mb-4" />
                        <p className="mb-2 text-sm text-primary">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-secondary">PNG, JPG, GIF up to 10MB</p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePostImageSelect}
                        disabled={isUploadingPost}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Caption */}
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Caption *
                  </label>
                  <textarea
                    value={postCaption}
                    onChange={(e) => setPostCaption(e.target.value)}
                    placeholder="Write a caption..."
                    rows={4}
                    maxLength={500}
                    disabled={isUploadingPost}
                    className="w-full px-4 py-3 glass-input rounded-lg text-primary resize-none focus:ring-2 focus:ring-white/30 focus:border-white/30"
                  />
                  <p className="text-xs text-secondary mt-1">
                    {postCaption.length}/500 characters
                  </p>
                </div>

                {/* Location */}
                <div>
                  <label className="flex text-sm font-medium text-primary mb-2 items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={postLocation}
                    onChange={(e) => setPostLocation(e.target.value)}
                    placeholder="Where was this taken?"
                    maxLength={100}
                    disabled={isUploadingPost}
                    className="w-full px-4 py-3 glass-input rounded-lg text-primary focus:ring-2 focus:ring-white/30 focus:border-white/30"
                  />
                </div>

                {/* Submit Button */}
                <div className="flex gap-3">
                  <button
                    onClick={handleClosePostModal}
                    disabled={isUploadingPost}
                    className="flex-1 premium-button-secondary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitPost}
                    disabled={isUploadingPost || !postImage || !postCaption.trim()}
                    className="flex-1 premium-button-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploadingPost ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Share Post
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post Detail Modal (Instagram-style) */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className="glass-card max-w-4xl w-full max-h-[90vh] overflow-hidden rounded-2xl border border-white/20 flex flex-col md:flex-row">
            {/* Left: Image */}
            <div className="w-full md:w-1/2 bg-black flex items-center justify-center">
              <img
                src={selectedPost.media_urls[0] || ''}
                alt={selectedPost.caption || 'Post'}
                className="w-full h-full object-contain max-h-[90vh]"
              />
            </div>

            {/* Right: Comments and Interactions */}
            <div className="w-full md:w-1/2 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={profile?.photoURL || user?.photoURL || '/default-avatar.png'}
                    alt={profile?.displayName || 'User'}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className="font-semibold text-primary">{profile?.displayName || user?.displayName || 'User'}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedPost(null);
                    setNewComment('');
                  }}
                  className="text-secondary hover:text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Caption */}
              <div className="p-4 border-b border-white/10">
                <div className="flex items-start gap-3">
                  <img
                    src={profile?.photoURL || user?.photoURL || '/default-avatar.png'}
                    alt={profile?.displayName || 'User'}
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-primary">{profile?.displayName || user?.displayName || 'User'}</span>
                      {selectedPost.location && (
                        <span className="text-xs text-secondary flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {selectedPost.location}
                        </span>
                      )}
                    </div>
                    <p className="text-primary text-sm">{selectedPost.caption}</p>
                  </div>
                </div>
              </div>

              {/* Comments Section */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {postComments[selectedPost.id]?.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-primary">
                        {comment.user_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-primary text-sm">{comment.user_name}</span>
                        <span className="text-xs text-secondary">
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-primary text-sm">{comment.comment_text}</p>
                    </div>
                  </div>
                ))}
                {(!postComments[selectedPost.id] || postComments[selectedPost.id].length === 0) && (
                  <div className="text-center py-8 text-secondary text-sm">
                    No comments yet. Be the first to comment!
                  </div>
                )}
              </div>

              {/* Actions Bar */}
              <div className="p-4 border-t border-white/10 space-y-3">
                {/* Like/Comment/Share Buttons */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleLikePost(selectedPost.id)}
                    disabled={isLiking === selectedPost.id}
                    className={`transition-colors disabled:opacity-50 ${
                      postLikes[selectedPost.id]?.liked ? 'text-red-400' : 'text-secondary hover:text-red-400'
                    }`}
                  >
                    <Heart className={`h-6 w-6 ${postLikes[selectedPost.id]?.liked ? 'fill-current' : ''}`} />
                  </button>
                  
                  <button
                    className="text-secondary hover:text-primary transition-colors"
                  >
                    <MessageCircle className="h-6 w-6" />
                  </button>
                  
                  <button
                    onClick={() => handleSharePost(selectedPost)}
                    className="text-secondary hover:text-primary transition-colors"
                  >
                    <Share2 className="h-6 w-6" />
                  </button>
                </div>

                {/* Likes Count */}
                {postLikes[selectedPost.id] && postLikes[selectedPost.id].count > 0 && (
                  <div className="text-sm font-semibold text-primary">
                    {postLikes[selectedPost.id].count} {postLikes[selectedPost.id].count === 1 ? 'like' : 'likes'}
                  </div>
                )}

                {/* Add Comment */}
                <div className="flex items-center gap-2">
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
                    className="flex-1 px-3 py-2 glass-input rounded-lg text-sm text-primary focus:ring-2 focus:ring-white/30 focus:border-white/30"
                    disabled={isAddingComment}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || isAddingComment}
                    className="p-2 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAddingComment ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;