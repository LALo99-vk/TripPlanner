import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
// Note: Firestore and Storage are no longer used - we use Supabase instead
// Keeping Firestore import for backward compatibility (if needed)
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBKtpTtUoyggUVbqwfp-q1uzdlC9sh-Ls8",
  authDomain: "photography-web-1f156.firebaseapp.com",
  projectId: "photography-web-1f156",
  storageBucket: "photography-web-1f156.firebasestorage.app",
  messagingSenderId: "555188726893",
  appId: "1:555188726893:web:f041ce0557f66ff51da364",
  measurementId: "G-N1C33DYFLP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore (kept for backward compatibility, but we use Supabase now)
export const db = getFirestore(app);

// Note: Firebase Storage is no longer used - we use Supabase Storage instead
// If you need it for other features, uncomment:
// import { getStorage } from 'firebase/storage';
// export const storage = getStorage(app);

export default app;