import type { RealtimeChannel } from '@supabase/supabase-js';
import { getAuthenticatedSupabaseClient } from '../config/supabase';
import type { GroupMember } from './groupRepository';

export interface GroupBudgetRecord {
  id: string;
  groupId: string;
  totalBudget: number;
  categoryAllocations?: Record<
    string,
    {
      budgeted: number;
      color?: string;
      description?: string;
    }
  > | null;
  lockedCategories?: string[]; // Array of locked category names
  createdBy: string;
  updatedAt: string;
}

export interface GroupExpenseRecord {
  id: string;
  groupId: string;
  category: string;
  amount: number;
  description: string | null;
  paidBy: string;
  paidById: string;
  splitBetween: string[];
  date: string;
  receiptUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMemberSummary {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  budgetShare: number; // Assigned budget share (money brought)
  totalPaid: number;
  totalOwed: number;
  balance: number;
  walletBalance: number; // Remaining balance in individual contribution wallet
  updatedAt: string;
}

export interface CreateExpenseInput {
  groupId: string;
  expenseId?: string;
  category: string;
  amount: number;
  description?: string;
  paidById: string;
  paidByName: string;
  splitBetween: string[];
  date: Date;
  receiptUrl?: string | null;
}

export async function getGroupBudget(groupId: string): Promise<GroupBudgetRecord | null> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_budgets')
    .select('*')
    .eq('group_id', groupId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching group budget:', error);
    throw error;
  }

  return mapBudgetRecord(data);
}

export async function upsertGroupBudget(params: {
  groupId: string;
  totalBudget: number;
  createdBy: string;
  categoryAllocations?: GroupBudgetRecord['categoryAllocations'];
  lockedCategories?: string[];
}): Promise<GroupBudgetRecord> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_budgets')
    .upsert(
      {
        group_id: params.groupId,
        total_budget: params.totalBudget,
        created_by: params.createdBy,
        category_allocations: params.categoryAllocations ?? null,
        locked_categories: params.lockedCategories ?? [],
      },
      { onConflict: 'group_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error upserting group budget:', error);
    throw error;
  }

  return mapBudgetRecord(data);
}

export async function getGroupExpenses(groupId: string): Promise<GroupExpenseRecord[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_expenses')
    .select('*')
    .eq('group_id', groupId)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching group expenses:', error);
    throw error;
  }

  return (data ?? []).map(mapExpenseRecord);
}

export async function getGroupMembersSummary(groupId: string): Promise<GroupMemberSummary[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('user_name', { ascending: true });

  if (error) {
    console.error('Error fetching group members summary:', error);
    throw error;
  }

  return (data ?? []).map(mapMemberSummary);
}

export async function ensureGroupMemberRecords(
  groupId: string,
  members: GroupMember[]
): Promise<void> {
  if (!members || members.length === 0) {
    return;
  }

  const supabase = await getAuthenticatedSupabaseClient();

  const { data, error } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (error) {
    console.error('Error fetching existing group member records:', error);
    throw error;
  }

  const existingIds = new Set((data ?? []).map((row) => row.user_id));
  const inserts = members
    .filter((member) => !existingIds.has(member.uid))
    .map((member) => ({
      group_id: groupId,
      user_id: member.uid,
      user_name: member.name,
      budget_share: 0,
      total_paid: 0,
      total_owed: 0,
      balance: 0,
      wallet_balance: 0,
    }));

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from('group_members').insert(inserts);

    if (insertError) {
      console.error('Error creating group member records:', insertError);
      throw insertError;
    }
  }
}

export async function addGroupExpense(input: CreateExpenseInput): Promise<GroupExpenseRecord> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Check if the category is locked
  const budget = await getGroupBudget(input.groupId);
  if (budget?.lockedCategories && budget.lockedCategories.includes(input.category)) {
    throw new Error(`Category "${input.category}" is locked by the leader. Please contact the leader to unlock it before adding expenses.`);
  }

  const { data, error } = await supabase
    .from('group_expenses')
    .insert({
      id: input.expenseId,
      group_id: input.groupId,
      category: input.category,
      amount: input.amount,
      description: input.description ?? null,
      paid_by: input.paidByName,
      paid_by_id: input.paidById,
      split_between: input.splitBetween,
      date: input.date.toISOString(),
      receipt_url: input.receiptUrl ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding group expense:', error);
    throw error;
  }

  await recalculateGroupMemberBalances(input.groupId);

  return mapExpenseRecord(data);
}

export async function deleteGroupExpense(groupId: string, expenseId: string): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  const { error } = await supabase
    .from('group_expenses')
    .delete()
    .eq('id', expenseId)
    .eq('group_id', groupId);

  if (error) {
    console.error('Error deleting group expense:', error);
    throw error;
  }

  await recalculateGroupMemberBalances(groupId);
}

export async function uploadExpenseReceipt(
  groupId: string,
  expenseId: string,
  file: File
): Promise<string> {
  const supabase = await getAuthenticatedSupabaseClient();
  const extension = file.name.split('.').pop() || 'jpg';
  const path = `receipts/${groupId}/${expenseId}.${extension}`;

  const { error } = await supabase.storage.from('receipts').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });

  if (error) {
    console.error('Error uploading receipt:', error);
    throw error;
  }

  const { data } = supabase.storage.from('receipts').getPublicUrl(path);

  return data.publicUrl;
}

export async function recalculateGroupMemberBalances(
  groupId: string,
  memberDirectory?: Array<{ userId: string; userName: string }>
): Promise<void> {
  const supabase = await getAuthenticatedSupabaseClient();

  const [{ data: expensesData, error: expensesError }, { data: membersData, error: membersError }] =
    await Promise.all([
      supabase.from('group_expenses').select('*').eq('group_id', groupId),
      supabase.from('group_members').select('*').eq('group_id', groupId),
    ]);

  if (expensesError) {
    console.error('Error fetching expenses for recalculation:', expensesError);
    throw expensesError;
  }

  if (membersError) {
    console.error('Error fetching members for recalculation:', membersError);
    throw membersError;
  }

  const directoryMap = new Map<string, string>();

  (memberDirectory ?? []).forEach((entry) => {
    directoryMap.set(entry.userId, entry.userName);
  });

  (membersData ?? []).forEach((member) => {
    if (!directoryMap.has(member.user_id)) {
      directoryMap.set(member.user_id, member.user_name);
    }
  });

  const totals = new Map<
    string,
    {
      userName: string;
      totalPaid: number;
      totalOwed: number;
      personalExpenses: number; // Expenses where member is the only one in split_between
    }
  >();

  // Get budget shares from members data
  const budgetShares = new Map<string, number>();
  (membersData ?? []).forEach((member) => {
    budgetShares.set(member.user_id, numberify(member.budget_share));
  });

  directoryMap.forEach((name, userId) => {
    totals.set(userId, {
      userName: name,
      totalPaid: 0,
      totalOwed: 0,
      personalExpenses: 0,
    });
  });

  (expensesData ?? []).forEach((expense) => {
    const amount = numberify(expense.amount);
    const paidById = expense.paid_by_id as string;
    const paidByName =
      directoryMap.get(paidById) ?? (expense.paid_by as string) ?? 'Member';

    if (!totals.has(paidById)) {
      totals.set(paidById, {
        userName: paidByName,
        totalPaid: 0,
        totalOwed: 0,
        personalExpenses: 0,
      });
    }

    const payer = totals.get(paidById);
    if (payer) {
      payer.totalPaid += amount;
    }

    const splitBetween: string[] = (expense.split_between as string[]) ?? [];
    const share = splitBetween.length > 0 ? amount / splitBetween.length : 0;

    // Check if this is a personal expense (only one person in split_between and it's the payer)
    const isPersonalExpense = splitBetween.length === 1 && splitBetween[0] === paidById;
    
    if (isPersonalExpense && payer) {
      // This is a personal expense - deduct from wallet
      payer.personalExpenses += amount;
      // Personal expenses don't affect totalOwed (skip the splitBetween loop below)
    } else {
      // Only calculate totalOwed for shared expenses (not personal)
      splitBetween.forEach((userId) => {
        if (!totals.has(userId)) {
          totals.set(userId, {
            userName: directoryMap.get(userId) ?? 'Member',
            totalPaid: 0,
            totalOwed: 0,
            personalExpenses: 0,
          });
        }

        const memberTotals = totals.get(userId);
        if (memberTotals) {
          memberTotals.totalOwed += share;
        }
      });
    }
  });

  const updates = Array.from(totals.entries()).map(([userId, value]) => {
    const budgetShare = budgetShares.get(userId) || 0;
    const walletBalance = Math.max(0, Math.round((budgetShare - value.personalExpenses) * 100) / 100);
    
    return {
    group_id: groupId,
    user_id: userId,
    user_name: value.userName,
    total_paid: Math.round(value.totalPaid * 100) / 100,
    total_owed: Math.round(value.totalOwed * 100) / 100,
    balance: Math.round((value.totalPaid - value.totalOwed) * 100) / 100,
      wallet_balance: walletBalance,
    };
  });

  if (updates.length > 0) {
    const { error } = await supabase.from('group_members').upsert(updates, {
      onConflict: 'group_id,user_id',
    });

    if (error) {
      console.error('Error updating group member balances:', error);
      throw error;
    }
  }
}

export function subscribeToGroupBudget(
  groupId: string,
  callback: (budget: GroupBudgetRecord | null) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    const initialBudget = await getGroupBudget(groupId);
    callback(initialBudget);

    channel = supabase
      .channel(`group-budgets-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_budgets',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updated = await getGroupBudget(groupId);
          callback(updated);
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

export function subscribeToGroupExpenses(
  groupId: string,
  callback: (expenses: GroupExpenseRecord[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    const initialExpenses = await getGroupExpenses(groupId);
    callback(initialExpenses);

    channel = supabase
      .channel(`group-expenses-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_expenses',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updated = await getGroupExpenses(groupId);
          callback(updated);
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

export function subscribeToGroupMembers(
  groupId: string,
  callback: (members: GroupMemberSummary[]) => void
): () => void {
  let channel: RealtimeChannel | null = null;

  const setupSubscription = async () => {
    const supabase = await getAuthenticatedSupabaseClient();

    const initialMembers = await getGroupMembersSummary(groupId);
    callback(initialMembers);

    channel = supabase
      .channel(`group-members-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
          filter: `group_id=eq.${groupId}`,
        },
        async () => {
          const updated = await getGroupMembersSummary(groupId);
          callback(updated);
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

function mapBudgetRecord(row: any): GroupBudgetRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    totalBudget: numberify(row.total_budget),
    categoryAllocations: row.category_allocations,
    lockedCategories: row.locked_categories || [],
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function mapExpenseRecord(row: any): GroupExpenseRecord {
  return {
    id: row.id,
    groupId: row.group_id,
    category: row.category,
    amount: numberify(row.amount),
    description: row.description,
    paidBy: row.paid_by,
    paidById: row.paid_by_id,
    splitBetween: row.split_between ?? [],
    date: row.date,
    receiptUrl: row.receipt_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMemberSummary(row: any): GroupMemberSummary {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    userName: row.user_name,
    budgetShare: numberify(row.budget_share),
    totalPaid: numberify(row.total_paid),
    totalOwed: numberify(row.total_owed),
    balance: numberify(row.balance),
    walletBalance: numberify(row.wallet_balance ?? row.budget_share), // Default to budget_share if wallet_balance not set
    updatedAt: row.updated_at,
  };
}

function numberify(value: any): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Update member budget share (leader only)
 */
export async function updateMemberBudgetShare(
  groupId: string,
  userId: string,
  budgetShare: number
): Promise<GroupMemberSummary> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Get current member record to calculate new wallet balance
  const { data: currentMember } = await supabase
    .from('group_members')
    .select('wallet_balance, budget_share')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .single();

  // Calculate personal expenses from current wallet balance
  const currentWalletBalance = numberify(currentMember?.wallet_balance ?? currentMember?.budget_share ?? 0);
  const currentBudgetShare = numberify(currentMember?.budget_share ?? 0);
  const personalExpenses = currentBudgetShare - currentWalletBalance;
  
  // New wallet balance = new budget share - existing personal expenses
  const newWalletBalance = Math.max(0, budgetShare - personalExpenses);

  const { data, error } = await supabase
    .from('group_members')
    .update({ 
      budget_share: budgetShare,
      wallet_balance: newWalletBalance,
    })
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating member budget share:', error);
    throw error;
  }

  return mapMemberSummary(data);
}

/**
 * Update multiple member budget shares at once (leader only)
 */
export async function updateMemberBudgetShares(
  groupId: string,
  shares: Array<{ userId: string; budgetShare: number }>
): Promise<GroupMemberSummary[]> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Get current member records to calculate wallet balances
  const { data: currentMembers } = await supabase
    .from('group_members')
    .select('user_id, wallet_balance, budget_share')
    .eq('group_id', groupId)
    .in('user_id', shares.map(s => s.userId));

  const memberMap = new Map(
    (currentMembers ?? []).map((m) => [m.user_id, m])
  );

  // Update each member's budget share and wallet balance
  const updates = await Promise.all(
    shares.map((share) => {
      const currentMember = memberMap.get(share.userId);
      const currentWalletBalance = numberify(currentMember?.wallet_balance ?? currentMember?.budget_share ?? 0);
      const currentBudgetShare = numberify(currentMember?.budget_share ?? 0);
      const personalExpenses = currentBudgetShare - currentWalletBalance;
      const newWalletBalance = Math.max(0, share.budgetShare - personalExpenses);

      return supabase
        .from('group_members')
        .update({ 
          budget_share: share.budgetShare,
          wallet_balance: newWalletBalance,
        })
        .eq('group_id', groupId)
        .eq('user_id', share.userId)
        .select()
        .single();
    })
  );

  const errors = updates.filter((result) => result.error);
  if (errors.length > 0) {
    console.error('Error updating member budget shares:', errors);
    throw new Error(`Failed to update ${errors.length} member budget shares`);
  }

  return updates.map((result) => mapMemberSummary(result.data!));
}

/**
 * Lock a budget category (leader only)
 * Prevents expenses from being added to this category until unlocked
 */
export async function lockBudgetCategory(
  groupId: string,
  category: string,
  leaderId: string
): Promise<GroupBudgetRecord> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Verify user is leader
  const { data: groupData } = await supabase
    .from('groups')
    .select('leader_id')
    .eq('id', groupId)
    .single();

  if (!groupData || groupData.leader_id !== leaderId) {
    throw new Error('Only the group leader can lock budget categories');
  }

  // Get current budget
  const currentBudget = await getGroupBudget(groupId);
  if (!currentBudget) {
    throw new Error('Budget not found for this group');
  }

  const lockedCategories = currentBudget.lockedCategories || [];
  
  // Add category to locked list if not already locked
  if (!lockedCategories.includes(category)) {
    const updatedLockedCategories = [...lockedCategories, category];

    const { data, error } = await supabase
      .from('group_budgets')
      .update({ locked_categories: updatedLockedCategories })
      .eq('group_id', groupId)
      .select()
      .single();

    if (error) {
      console.error('Error locking budget category:', error);
      throw error;
    }

    return mapBudgetRecord(data);
  }

  return currentBudget;
}

/**
 * Unlock a budget category (leader only)
 */
export async function unlockBudgetCategory(
  groupId: string,
  category: string,
  leaderId: string
): Promise<GroupBudgetRecord> {
  const supabase = await getAuthenticatedSupabaseClient();

  // Verify user is leader
  const { data: groupData } = await supabase
    .from('groups')
    .select('leader_id')
    .eq('id', groupId)
    .single();

  if (!groupData || groupData.leader_id !== leaderId) {
    throw new Error('Only the group leader can unlock budget categories');
  }

  // Get current budget
  const currentBudget = await getGroupBudget(groupId);
  if (!currentBudget) {
    throw new Error('Budget not found for this group');
  }

  const lockedCategories = currentBudget.lockedCategories || [];
  
  // Remove category from locked list
  const updatedLockedCategories = lockedCategories.filter((cat) => cat !== category);

  const { data, error } = await supabase
    .from('group_budgets')
    .update({ locked_categories: updatedLockedCategories })
    .eq('group_id', groupId)
    .select()
    .single();

  if (error) {
    console.error('Error unlocking budget category:', error);
    throw error;
  }

  return mapBudgetRecord(data);
}

/**
 * Toggle lock status of a budget category (leader only)
 */
export async function toggleBudgetCategoryLock(
  groupId: string,
  category: string,
  leaderId: string
): Promise<GroupBudgetRecord> {
  const currentBudget = await getGroupBudget(groupId);
  if (!currentBudget) {
    throw new Error('Budget not found for this group');
  }

  const isLocked = currentBudget.lockedCategories?.includes(category) || false;

  if (isLocked) {
    return await unlockBudgetCategory(groupId, category, leaderId);
  } else {
    return await lockBudgetCategory(groupId, category, leaderId);
  }
}
