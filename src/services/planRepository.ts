import { getAuthenticatedSupabaseClient } from '../config/supabase';
import { AiTripPlanData } from './api';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface SavedPlanRecord {
  id: string;
  userId: string;
  name: string;
  createdAt: Date | string;
  plan: AiTripPlanData;
}

export interface SaveUserPlanInput {
  userId: string;
  plan: AiTripPlanData;
  name?: string;
  userBudget?: number;
  optimizedBudget?: number;
  categoryBudgets?: any;
}

/**
 * Save a user's trip plan to Supabase
 */
export async function saveUserPlan(input: SaveUserPlanInput): Promise<string> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { userId, plan, name, userBudget, optimizedBudget, categoryBudgets } = input;

  const planName = name || `${plan.overview.to} (${plan.overview.durationDays}D)`;

  const finalOptimizedBudget =
    optimizedBudget ?? (plan.totals?.totalCostINR ?? null);

  const finalCategoryBudgets =
    categoryBudgets ?? (plan.totals?.breakdown ?? null);

  const finalUserBudget =
    userBudget ?? (plan as any).userBudget ?? null;

  const totalEstimatedBudget = finalOptimizedBudget ?? 0;

  // Insert the plan
  const { data: planData, error: planError } = await supabase
    .from('plans')
    .insert({
      user_id: userId,
      name: planName,
      plan_data: plan as any, // JSONB column
      user_budget: finalUserBudget,
      optimized_budget: finalOptimizedBudget,
      category_budgets: finalCategoryBudgets,
      total_estimated_budget: totalEstimatedBudget,
    })
    .select()
    .single();

  if (planError) {
    console.error('Error saving plan:', planError);
    throw planError;
  }

  const planId = planData.id;

  // Update user metadata with latest plan
  await supabase
    .from('user_metadata')
    .upsert({
      user_id: userId,
      latest_plan_id: planId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  // Increment trips_count on user profile
  const { data: userData } = await supabase
    .from('users')
    .select('trips_count')
    .eq('id', userId)
    .single();

  const currentCount = (userData?.trips_count || 0) as number;
  
  await supabase
    .from('users')
    .update({ trips_count: currentCount + 1 })
    .eq('id', userId);

  return planId;
}

/**
 * Get the latest plan for a user
 */
export async function getLatestUserPlan(userId: string): Promise<SavedPlanRecord | null> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('Error fetching latest plan:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    createdAt: data.created_at,
    plan: data.plan_data as AiTripPlanData,
  };
}

/**
 * Subscribe to the latest plan for a user (real-time)
 */
export function subscribeLatestUserPlan(userId: string, cb: (rec: SavedPlanRecord | null) => void): () => void {
  const channel = getAuthenticatedSupabaseClient().then(async (supabase) => {
    // First, get the current latest plan
    const latest = await getLatestUserPlan(userId);
    cb(latest);

    // Then subscribe to changes
    return supabase
      .channel(`user-${userId}-latest-plan`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // Refetch latest plan when changes occur
          const updated = await getLatestUserPlan(userId);
          cb(updated);
        }
      )
      .subscribe();
  });

  // Return unsubscribe function
  return () => {
    channel.then((ch) => {
      if (ch) {
        getAuthenticatedSupabaseClient().then((supabase) => {
          supabase.removeChannel(ch as RealtimeChannel);
        });
      }
    });
  };
}

/**
 * List all plans for a user
 */
export async function listUserPlans(userId: string): Promise<SavedPlanRecord[]> {
  const supabase = await getAuthenticatedSupabaseClient();
  
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing plans:', error);
    return [];
  }

  return (data || []).map((d) => ({
    id: d.id,
    userId: d.user_id,
    name: d.name,
    createdAt: d.created_at,
    plan: d.plan_data as AiTripPlanData,
  }));
}

/**
 * Subscribe to all plans for a user (real-time)
 */
export function subscribeUserPlans(userId: string, cb: (recs: SavedPlanRecord[]) => void): () => void {
  const channel = getAuthenticatedSupabaseClient().then(async (supabase) => {
    // First, get current plans
    const plans = await listUserPlans(userId);
    cb(plans);

    // Then subscribe to changes
    return supabase
      .channel(`user-${userId}-plans`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // Refetch plans when changes occur
          const updated = await listUserPlans(userId);
          cb(updated);
        }
      )
      .subscribe();
  });

  // Return unsubscribe function
  return () => {
    channel.then((ch) => {
      if (ch) {
        getAuthenticatedSupabaseClient().then((supabase) => {
          supabase.removeChannel(ch as RealtimeChannel);
        });
      }
    });
  };
}


