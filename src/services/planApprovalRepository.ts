import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getGroup } from './groupRepository';
import { upsertGroupBudget } from './budgetRepository';

export interface PlanApproval {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  vote: 'agree' | 'request_changes';
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinalizedPlan {
  id: string;
  groupId: string;
  planId: string | null;
  planName: string | null;
  destination: string;
  totalDays: number;
  totalEstimatedBudget: number;
  categoryBudgets: Record<string, { budgeted: number; color?: string }> | null;
  startDate: string;
  endDate: string;
  status: 'fixed' | 'editable';
  agreedMembers: string[];
  disagreedMembers: string[];
  finalizedBy: string | null;
  finalizedAt: string | null;
  syncedToBudget: boolean;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStatus {
  approvals: PlanApproval[];
  finalizedPlan: FinalizedPlan | null;
  totalMembers: number;
  agreedCount: number;
  disagreedCount: number;
  pendingCount: number;
  approvalPercentage: number;
  isFixed: boolean;
}

const APPROVAL_THRESHOLD = 0.8; // 80% approval required

/**
 * Vote on plan approval
 */
export async function voteOnPlan(
  groupId: string,
  userId: string,
  userName: string,
  vote: 'agree' | 'request_changes',
  comment?: string
): Promise<PlanApproval> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_plan_approvals')
    .upsert(
      {
        group_id: groupId,
        user_id: userId,
        user_name: userName,
        vote,
        comment: comment || null,
      },
      { onConflict: 'group_id,user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error voting on plan:', error);
    throw error;
  }

  // Check if we should auto-finalize
  await checkAndFinalizePlan(groupId);

  return mapApprovalData(data);
}

/**
 * Get approval status for a group
 */
export async function getApprovalStatus(groupId: string): Promise<ApprovalStatus> {
  const supabase = await getAuthenticatedSupabaseClient();

  const [approvalsData, finalizedPlanData, groupData] = await Promise.all([
    supabase.from('group_plan_approvals').select('*').eq('group_id', groupId),
    supabase.from('group_finalized_plans').select('*').eq('group_id', groupId).maybeSingle(),
    getGroup(groupId),
  ]);

  if (approvalsData.error) {
    console.error('Error fetching approvals:', approvalsData.error);
    throw approvalsData.error;
  }

  const approvals = (approvalsData.data || []).map(mapApprovalData);
  const finalizedPlan = finalizedPlanData.data ? mapFinalizedPlanData(finalizedPlanData.data) : null;

  const totalMembers = groupData?.members.length || 0;
  const agreedCount = approvals.filter((a) => a.vote === 'agree').length;
  const disagreedCount = approvals.filter((a) => a.vote === 'request_changes').length;
  const pendingCount = totalMembers - approvals.length;
  const approvalPercentage = totalMembers > 0 ? agreedCount / totalMembers : 0;
  const isFixed = finalizedPlan?.status === 'fixed';

  return {
    approvals,
    finalizedPlan,
    totalMembers,
    agreedCount,
    disagreedCount,
    pendingCount,
    approvalPercentage,
    isFixed,
  };
}

/**
 * Check if plan should be auto-finalized and do it if threshold is met
 */
async function checkAndFinalizePlan(groupId: string): Promise<void> {
  const status = await getApprovalStatus(groupId);

  // Don't finalize if already fixed
  if (status.isFixed) {
    return;
  }

  // Check if threshold is met
  if (status.approvalPercentage >= APPROVAL_THRESHOLD && status.totalMembers > 0) {
    const group = await getGroup(groupId);
    if (!group) return;

    const supabase = await getAuthenticatedSupabaseClient();

    // Try to use existing finalized plan budgets if present
    let totalEstimatedBudget = 0;
    let categoryBudgets: Record<string, { budgeted: number; color?: string }> | null = null;

    const { data: existingFinalized } = await supabase
      .from('group_finalized_plans')
      .select('total_estimated_budget, category_budgets, plan_id')
      .eq('group_id', groupId)
      .maybeSingle();

    let sourcePlanId: string | null = existingFinalized?.plan_id ?? null;

    if (existingFinalized?.total_estimated_budget) {
      totalEstimatedBudget = parseFloat(existingFinalized.total_estimated_budget as any);
      categoryBudgets = existingFinalized.category_budgets;
    }

    // If no budget yet, look at the most recent imported plan for this group
    if (totalEstimatedBudget === 0) {
      const { data: itineraryData } = await supabase
        .from('group_itinerary_activities')
        .select('plan_id')
        .eq('group_id', groupId)
        .not('plan_id', 'is', null)
        .limit(1)
        .single();

      if (itineraryData && itineraryData.plan_id) {
        sourcePlanId = itineraryData.plan_id;
      }
    }

    if (totalEstimatedBudget === 0 && sourcePlanId) {
      const { data: planRow } = await supabase
        .from('plans')
        .select('optimized_budget, total_estimated_budget, category_budgets, plan_data')
        .eq('id', sourcePlanId)
        .single();

      if (planRow) {
        totalEstimatedBudget = Number(
          planRow.optimized_budget ??
            planRow.total_estimated_budget ??
            (planRow.plan_data as any)?.totals?.totalCostINR ??
            0
        );

        categoryBudgets =
          planRow.category_budgets ??
          (planRow.plan_data as any)?.totals?.breakdown ??
          null;
      }
    }

    const agreedMembers = status.approvals
      .filter((a) => a.vote === 'agree')
      .map((a) => a.userId);
    const disagreedMembers = status.approvals
      .filter((a) => a.vote === 'request_changes')
      .map((a) => a.userId);

    const totalDays = Math.max(
      1,
      Math.ceil(
        (new Date(group.endDate).getTime() - new Date(group.startDate).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    // Upsert finalized plan
    const { data: finalizedData, error: finalizedError } = await supabase
      .from('group_finalized_plans')
      .upsert(
        {
          group_id: groupId,
          plan_id: sourcePlanId,
          destination: group.destination,
          total_days: totalDays,
          total_estimated_budget: totalEstimatedBudget,
          category_budgets: categoryBudgets,
          start_date: group.startDate,
          end_date: group.endDate,
          status: 'fixed',
          agreed_members: agreedMembers,
          disagreed_members: disagreedMembers,
          finalized_by: group.leaderId,
          finalized_at: new Date().toISOString(),
        },
        { onConflict: 'group_id' }
      )
      .select()
      .single();

    if (finalizedError) {
      console.error('Error finalizing plan:', finalizedError);
      return;
    }

    // Auto-sync to budget
    await syncPlanToBudget(groupId, mapFinalizedPlanData(finalizedData));
  }
}

/**
 * Unlock plan (leader only)
 */
export async function unlockPlan(groupId: string, leaderId: string): Promise<void> {
  const group = await getGroup(groupId);
  if (!group || group.leaderId !== leaderId) {
    throw new Error('Only the group leader can unlock the plan');
  }

  const supabase = await getAuthenticatedSupabaseClient();

  const { error } = await supabase
    .from('group_finalized_plans')
    .update({
      status: 'editable',
      finalized_at: null,
    })
    .eq('group_id', groupId);

  if (error) {
    console.error('Error unlocking plan:', error);
    throw error;
  }

  // Clear all approvals when unlocking
  await supabase.from('group_plan_approvals').delete().eq('group_id', groupId);
}

/**
 * Sync finalized plan to budget
 */
export async function syncPlanToBudget(groupId: string, finalizedPlan: FinalizedPlan): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Update budget with plan data
  await upsertGroupBudget({
    groupId,
    totalBudget: finalizedPlan.totalEstimatedBudget,
    createdBy: finalizedPlan.finalizedBy || '',
    categoryAllocations: finalizedPlan.categoryBudgets || undefined,
  });

  // Mark as synced
  const { error } = await supabase
    .from('group_finalized_plans')
    .update({
      synced_to_budget: true,
      synced_at: new Date().toISOString(),
    })
    .eq('group_id', groupId);

  if (error) {
    console.error('Error marking plan as synced:', error);
  }
}

/**
 * Get finalized plan for a group
 */
export async function getFinalizedPlan(groupId: string): Promise<FinalizedPlan | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_finalized_plans')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'fixed')
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching finalized plan:', error);
    return null;
  }

  return data ? mapFinalizedPlanData(data) : null;
}

/**
 * Subscribe to finalized plan changes
 */
export function subscribeToFinalizedPlan(
  groupId: string,
  callback: (plan: FinalizedPlan | null) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial plan
    const initialPlan = await getFinalizedPlan(groupId);
    callback(initialPlan);

    // Subscribe to changes
    channel = supabase
      .channel(`finalized-plan-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_finalized_plans',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updatedPlan = await getFinalizedPlan(groupId);
          callback(updatedPlan);
        }
      )
      .subscribe();
  };

  setupSubscription();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
  };
}

/**
 * Subscribe to approval status changes
 */
export function subscribeToApprovalStatus(
  groupId: string,
  callback: (status: ApprovalStatus) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    // Get initial status
    const initialStatus = await getApprovalStatus(groupId);
    callback(initialStatus);

    // Subscribe to changes
    channel = supabase
      .channel(`plan-approvals-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_plan_approvals',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updatedStatus = await getApprovalStatus(groupId);
          callback(updatedStatus);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_finalized_plans',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updatedStatus = await getApprovalStatus(groupId);
          callback(updatedStatus);
        }
      )
      .subscribe();
  };

  setupSubscription();

  return () => {
    if (channel) {
      getAuthenticatedSupabaseClient().then((supabase) => {
        supabase.removeChannel(channel as RealtimeChannel);
      });
    }
  };
}

// Note: heuristic budget calculation helpers removed; budgets now always come from stored plan data.

/**
 * Helper function to map database row to PlanApproval interface
 */
function mapApprovalData(data: any): PlanApproval {
  return {
    id: data.id,
    groupId: data.group_id,
    userId: data.user_id,
    userName: data.user_name,
    vote: data.vote,
    comment: data.comment,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Helper function to map database row to FinalizedPlan interface
 */
function mapFinalizedPlanData(data: any): FinalizedPlan {
  return {
    id: data.id,
    groupId: data.group_id,
    planId: data.plan_id,
    planName: data.plan_name,
    destination: data.destination,
    totalDays: data.total_days,
    totalEstimatedBudget: parseFloat(data.total_estimated_budget || '0'),
    categoryBudgets: data.category_budgets,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status,
    agreedMembers: data.agreed_members || [],
    disagreedMembers: data.disagreed_members || [],
    finalizedBy: data.finalized_by,
    finalizedAt: data.finalized_at,
    syncedToBudget: data.synced_to_budget || false,
    syncedAt: data.synced_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

