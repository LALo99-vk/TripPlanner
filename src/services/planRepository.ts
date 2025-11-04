import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { AiTripPlanData } from './api';

export interface SavedPlanRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: any;
  plan: AiTripPlanData;
}

const userPlansCollection = (userId: string) => collection(db, 'users', userId, 'plans');

export async function saveUserPlan(userId: string, plan: AiTripPlanData, name?: string): Promise<string> {
  const record = {
    userId,
    name: name || `${plan.overview.to} (${plan.overview.durationDays}D)`,
    createdAt: serverTimestamp(),
    plan,
  };
  const ref = await addDoc(userPlansCollection(userId), record);
  // Also set a pointer to latest plan for quick access
  await setDoc(doc(db, 'users', userId, 'meta', 'latestPlan'), { planId: ref.id, updatedAt: serverTimestamp() });
  return ref.id;
}

export async function getLatestUserPlan(userId: string): Promise<SavedPlanRecord | null> {
  const q = query(userPlansCollection(userId), orderBy('createdAt', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data() as any;
  return { id: d.id, userId, name: data.name, createdAt: data.createdAt, plan: data.plan };
}

export function subscribeLatestUserPlan(userId: string, cb: (rec: SavedPlanRecord | null) => void) {
  const q = query(userPlansCollection(userId), orderBy('createdAt', 'desc'), limit(1));
  return onSnapshot(q, (snap) => {
    if (snap.empty) { cb(null); return; }
    const d = snap.docs[0];
    const data = d.data() as any;
    cb({ id: d.id, userId, name: data.name, createdAt: data.createdAt, plan: data.plan });
  });
}

export async function listUserPlans(userId: string): Promise<SavedPlanRecord[]> {
  const q = query(userPlansCollection(userId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return { id: d.id, userId, name: data.name, createdAt: data.createdAt, plan: data.plan };
  });
}


