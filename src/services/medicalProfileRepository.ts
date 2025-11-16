import { getAuthenticatedSupabaseClient } from '../config/supabase';

export interface MedicalProfile {
  userId: string;
  bloodType: string | null;
  allergies: string[];
  medicalConditions: string[];
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  updatedAt: string | null;
}

const MEDICAL_PROFILE_CACHE_KEY = 'medical_profile_cached';

function mapMedicalRow(row: any): MedicalProfile {
  return {
    userId: row.user_id,
    bloodType: row.blood_type ?? null,
    allergies: (row.allergies as string[]) ?? [],
    medicalConditions: (row.medical_conditions as string[]) ?? [],
    emergencyContactName: row.emergency_contact_name ?? null,
    emergencyContactPhone: row.emergency_contact_phone ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function cacheMedicalProfile(profile: MedicalProfile) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(MEDICAL_PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Error caching medical profile:', e);
  }
}

function loadCachedMedicalProfile(userId: string): MedicalProfile | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(MEDICAL_PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MedicalProfile;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch (e) {
    console.error('Error reading cached medical profile:', e);
    return null;
  }
}

export async function getMedicalProfile(userId: string): Promise<MedicalProfile | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('user_medical_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if ((error as any).code === 'PGRST116') {
        // Not found in DB, try cache
        return loadCachedMedicalProfile(userId);
      }
      console.error('Error fetching medical profile:', error);
      // On network/other errors, fall back to cache
      const cached = loadCachedMedicalProfile(userId);
      if (cached) return cached;
      throw error;
    }

    if (!data) {
      return loadCachedMedicalProfile(userId);
    }

    const profile = mapMedicalRow(data);
    cacheMedicalProfile(profile);
    return profile;
  } catch (e) {
    console.error('Error in getMedicalProfile:', e);
    const cached = loadCachedMedicalProfile(userId);
    return cached;
  }
}

export interface UpsertMedicalProfileInput {
  bloodType?: string | null;
  allergies?: string[];
  medicalConditions?: string[];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export async function upsertMedicalProfile(
  userId: string,
  input: UpsertMedicalProfileInput
): Promise<MedicalProfile> {
  const supabase = await getAuthenticatedSupabaseClient();

  const payload = {
    user_id: userId,
    blood_type: input.bloodType ?? null,
    allergies: input.allergies ?? [],
    medical_conditions: input.medicalConditions ?? [],
    emergency_contact_name: input.emergencyContactName ?? null,
    emergency_contact_phone: input.emergencyContactPhone ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_medical_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting medical profile:', error);
    throw error;
  }

  const profile = mapMedicalRow(data);
  cacheMedicalProfile(profile);
  return profile;
}
