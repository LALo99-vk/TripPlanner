import { useState, useEffect } from 'react';
import { 
  User,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { getAuthenticatedSupabaseClient } from '../config/supabase';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user document exists in Supabase, if not create it
      const supabase = await getAuthenticatedSupabaseClient();
      
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.uid)
        .single();
      
      if (!existingUser) {
        // Create user record in Supabase
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.uid,
            email: user.email || null,
            display_name: user.displayName || null,
            photo_url: user.photoURL || null,
            bio: '',
            followers_count: 0,
            following_count: 0,
            trips_count: 0,
          });

        if (insertError) {
          console.error('Error creating user in Supabase:', insertError);
          // Don't fail the sign-in, just log the error
        }
      }

      return { success: true, user: result.user };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  return {
    user,
    loading,
    signInWithGoogle,
    logout
  };
};