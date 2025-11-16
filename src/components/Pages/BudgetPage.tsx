import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, DollarSign, TrendingUp, PieChart, Download, Share, Wallet, MapPin, Calendar, Crown, Brain } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiService } from '../../services/api';
import {
  addGroupExpense,
  ensureGroupMemberRecords,
  getGroupBudget,
  getGroupExpenses,
  getGroupMembersSummary,
  GroupBudgetRecord,
  GroupExpenseRecord,
  GroupMemberSummary,
  subscribeToGroupBudget,
  subscribeToGroupExpenses,
  subscribeToGroupMembers,
  updateMemberBudgetShares,
  upsertGroupBudget,
  uploadExpenseReceipt,
} from '../../services/budgetRepository';
import { getGroup, getUserGroups, subscribeUserGroups, type Group } from '../../services/groupRepository';
import { getFinalizedPlan, subscribeToFinalizedPlan, type FinalizedPlan } from '../../services/planApprovalRepository';

type ChartView = 'category' | 'member';

interface NewExpenseFormState {
  category: string;
  amount: string;
  description: string;
  paidById: string;
  splitBetween: string[];
  date: string;
  receiptFile: File | null;
}

const colorPalette = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#14B8A6'];

const extractReceiptData = async (_file: File) => {
  // Placeholder for future OCR / AI enrichment
  return null;
};

const BudgetPage: React.FC = () => {
  const { user } = useAuth();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [budget, setBudget] = useState<GroupBudgetRecord | null>(null);
  const [expenses, setExpenses] = useState<GroupExpenseRecord[]>([]);
  const [members, setMembers] = useState<GroupMemberSummary[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [chartView, setChartView] = useState<ChartView>('category');
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [finalizedPlan, setFinalizedPlan] = useState<FinalizedPlan | null>(null);
  const [showBudgetShareModal, setShowBudgetShareModal] = useState(false);
  const [editingBudgetShares, setEditingBudgetShares] = useState<Record<string, string>>({});
  const [savingBudgetShares, setSavingBudgetShares] = useState(false);
  const [newExpense, setNewExpense] = useState<NewExpenseFormState>({
    category: '',
    amount: '',
    description: '',
    paidById: '',
    splitBetween: [],
    date: new Date().toISOString().split('T')[0],
    receiptFile: null,
  });

  useEffect(() => {
    const storedGroupId = localStorage.getItem('selectedGroupId');
    if (storedGroupId) {
      setGroupId(storedGroupId);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setGroupsLoading(false);
      setGroupsError(null);
      setGroupId(null);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    setGroupsLoading(true);
    setGroupsError(null);

    const loadGroups = async () => {
      try {
        const list = await getUserGroups(user.uid);
        setGroups(list);
        setGroupsLoading(false);
      } catch (err) {
        console.error('Failed to load groups for budget planner:', err);
        setGroupsError('Unable to load your travel groups. Please try again later.');
        setGroupsLoading(false);
      }
    };

    loadGroups();

    unsubscribe = subscribeUserGroups(user.uid, (updated) => {
      setGroups(updated);
      setGroupsLoading(false);
      setGroupsError(null);
    });

    return () => {
      unsubscribe?.();
    };
  }, [user]);

  useEffect(() => {
    if (groups.length === 0) {
      if (groupId) {
        setGroupId(null);
        localStorage.removeItem('selectedGroupId');
      }
      return;
    }

    if (groupId && groups.some((groupEntry) => groupEntry.id === groupId)) {
      return;
    }

    const storedId = localStorage.getItem('selectedGroupId');
    if (storedId && groups.some((groupEntry) => groupEntry.id === storedId)) {
      setGroupId(storedId);
      return;
    }

    const firstId = groups[0].id;
    setGroupId(firstId);
    localStorage.setItem('selectedGroupId', firstId);
  }, [groups, groupId]);

  useEffect(() => {
    if (!groupId || !user) {
      return;
    }

    let unsubscribeBudget: (() => void) | null = null;
    let unsubscribeExpenses: (() => void) | null = null;
    let unsubscribeMembers: (() => void) | null = null;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const groupData = await getGroup(groupId);

        if (!groupData) {
          setError('Unable to find the selected group. Please choose a group again.');
          setLoading(false);
          return;
        }

        setGroup(groupData);
        setIsLeader(groupData.leaderId === user.uid);

        await ensureGroupMemberRecords(groupId, groupData.members);

        const [budgetData, expensesData, membersData, finalizedPlanData] = await Promise.all([
          getGroupBudget(groupId),
          getGroupExpenses(groupId),
          getGroupMembersSummary(groupId),
          getFinalizedPlan(groupId),
        ]);

        // Use finalized plan budget if available, otherwise use existing budget
        let finalBudget: GroupBudgetRecord | null = budgetData;
        if (finalizedPlanData) {
          if (!budgetData) {
            // Create budget from finalized plan
            finalBudget = await upsertGroupBudget({
              groupId: groupId,
              totalBudget: finalizedPlanData.totalEstimatedBudget,
              createdBy: user.uid,
              categoryAllocations: finalizedPlanData.categoryBudgets || {},
            });
          } else if (budgetData.totalBudget !== finalizedPlanData.totalEstimatedBudget) {
            // Update existing budget to match finalized plan
            finalBudget = await upsertGroupBudget({
              groupId: groupId,
              totalBudget: finalizedPlanData.totalEstimatedBudget,
              createdBy: user.uid,
              categoryAllocations: finalizedPlanData.categoryBudgets || {},
            });
          }
        }

        setBudget(finalBudget);
        setExpenses(expensesData);
        setMembers(membersData);
        setFinalizedPlan(finalizedPlanData);

        setNewExpense((prev) => ({
          ...prev,
          paidById: prev.paidById || groupData.leaderId,
          splitBetween:
            prev.splitBetween.length > 0
              ? prev.splitBetween
              : groupData.members.map((member) => member.uid),
        }));

        unsubscribeBudget = subscribeToGroupBudget(groupId, (updatedBudget) => {
          setBudget(updatedBudget);
        });

        unsubscribeExpenses = subscribeToGroupExpenses(groupId, (updatedExpenses) => {
          setExpenses(updatedExpenses);
        });

        unsubscribeMembers = subscribeToGroupMembers(groupId, (updatedMembers) => {
          setMembers(updatedMembers);
        });

        // Load finalized plan
        // Note: finalizedPlanData is already fetched from Promise.all above
      } catch (err) {
        console.error('Failed to load budget data:', err);
        setError('Failed to load budget data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to finalized plan changes
    let unsubscribePlan: (() => void) | null = null;
    if (groupId) {
      unsubscribePlan = subscribeToFinalizedPlan(groupId, async (plan) => {
        setFinalizedPlan(plan);
        // If there's a finalized plan, sync the budget
        if (plan) {
          const currentBudget = await getGroupBudget(groupId);
          if (!currentBudget || currentBudget.totalBudget !== plan.totalEstimatedBudget) {
            // Create or update budget to match finalized plan
            const newBudget = await upsertGroupBudget({
              groupId: groupId,
              totalBudget: plan.totalEstimatedBudget,
              createdBy: user.uid,
              categoryAllocations: plan.categoryBudgets || {},
            });
            setBudget(newBudget);
          }
        }
      });
    }

    return () => {
      unsubscribeBudget?.();
      unsubscribeExpenses?.();
      unsubscribeMembers?.();
      unsubscribePlan?.();
    };
  }, [groupId, user]);

  useEffect(() => {
    if (!groupId) {
      setGroup(null);
      setBudget(null);
      setExpenses([]);
      setMembers([]);
      setIsLeader(false);
      setLoading(false);
      setError(null);
    }
  }, [groupId]);

  const memberDirectory = useMemo(() => {
    if (!group) return [];
    return group.members.map((member) => ({
      userId: member.uid,
      userName: member.name,
    }));
  }, [group]);

  // AI Budget from finalized plan (reference only)
  const aiBudget = useMemo(() => {
    if (!finalizedPlan) return null;
    
    return {
      total: finalizedPlan.totalEstimatedBudget || 0,
      categories: finalizedPlan.categoryBudgets || {},
    };
  }, [finalizedPlan]);

  // User's actual budget and expenses
  const totalBudget = finalizedPlan?.totalEstimatedBudget ?? budget?.totalBudget ?? 0;
  const totalSpent = useMemo(
    () => expenses.reduce((sum, expense) => sum + expense.amount, 0),
    [expenses]
  );
  const remaining = totalBudget - totalSpent;

  const categoryAggregates = useMemo(() => {
    const aggregates = new Map<
      string,
      {
        spent: number;
        budgeted: number;
        color: string;
      }
    >();

    // First, add all budget categories from the user's budget (if available)
    if (budget?.categoryAllocations) {
      Object.entries(budget.categoryAllocations).forEach(([category, allocation]) => {
        aggregates.set(category, {
          spent: 0,
          budgeted: allocation.budgeted || 0,
          color: allocation.color || colorPalette[0],
        });
      });
    }

    // Then, add or update with actual expenses
    expenses.forEach((expense) => {
      const existing = aggregates.get(expense.category);
      const color =
        budget?.categoryAllocations?.[expense.category]?.color ||
        (existing?.color) ||
        colorPalette[aggregates.size % colorPalette.length];
      const budgeted =
        budget?.categoryAllocations?.[expense.category]?.budgeted ?? 
        (existing?.budgeted ?? 0); // No fallback to totalBudget
      
      if (existing) {
        aggregates.set(expense.category, {
          spent: existing.spent + expense.amount,
          budgeted: existing.budgeted,
          color: existing.color,
        });
      } else {
        aggregates.set(expense.category, {
          spent: expense.amount,
          budgeted,
          color,
        });
      }
    });

    return Array.from(aggregates.entries()).map(([category, value]) => ({
      category,
      spent: value.spent,
      budgeted: value.budgeted,
      color: value.color,
    }));
  }, [expenses, budget]);

  const memberSpending = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) => {
      map.set(expense.paidBy, (map.get(expense.paidBy) ?? 0) + expense.amount);
    });
    return Array.from(map.entries()).map(([name, amount]) => ({
      name,
      amount,
    }));
  }, [expenses]);

  // Calculate member budget shares and balances
  const memberBudgetShares = useMemo(() => {
    if (!group) return [];

    // Get budget shares from members table (or use equal split if not set)
    const memberCount = group.members.length;
    const totalAssignedShare = members.reduce((sum, m) => sum + m.budgetShare, 0);
    const equalShare = totalBudget > 0 && totalAssignedShare === 0 ? totalBudget / memberCount : 0;

    // Calculate spent per member from expenses
    const spentByMember = new Map<string, number>();
    expenses.forEach((expense) => {
      const sharePerPerson = expense.amount / expense.splitBetween.length;
      expense.splitBetween.forEach((memberId) => {
        const member = group.members.find((m) => m.uid === memberId);
        if (member) {
          spentByMember.set(
            member.uid,
            (spentByMember.get(member.uid) || 0) + sharePerPerson
          );
        }
      });
    });

    return group.members.map((member) => {
      // Use assigned budget share from database, or equal share if not assigned
      const memberRecord = members.find((m) => m.userId === member.uid);
      const budgetShare = memberRecord?.budgetShare || equalShare;
      const spent = spentByMember.get(member.uid) || 0;
      const remaining = budgetShare - spent;
      const spentPercentage = budgetShare > 0 ? (spent / budgetShare) * 100 : 0;

      // Determine color based on spending percentage
      let progressColor = '#10B981'; // Green < 70%
      if (spentPercentage >= 90) {
        progressColor = '#EF4444'; // Red > 90%
      } else if (spentPercentage >= 70) {
        progressColor = '#F59E0B'; // Yellow 70-90%
      }

      return {
        userId: member.uid,
        userName: member.name,
        budgetShare,
        spent,
        remaining,
        spentPercentage,
        progressColor,
      };
    });
  }, [group, totalBudget, expenses, members]);

  // Find top spender and most saver
  const topSpender = useMemo(() => {
    if (memberBudgetShares.length === 0) return null;
    return memberBudgetShares.reduce((max, member) =>
      member.spent > max.spent ? member : max
    );
  }, [memberBudgetShares]);

  const mostSaver = useMemo(() => {
    if (memberBudgetShares.length === 0) return null;
    return memberBudgetShares.reduce((max, member) =>
      member.remaining > max.remaining ? member : max
    );
  }, [memberBudgetShares]);

  const settlementSummary = useMemo(() => {
    const creditors = members
      .filter((member) => member.balance > 0)
      .map((member) => ({ ...member }));
    const debtors = members
      .filter((member) => member.balance < 0)
      .map((member) => ({ ...member }));

    const instructions: string[] = [];

    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];

      const amount = Math.min(creditor.balance, Math.abs(debtor.balance));

      if (amount > 0) {
        instructions.push(
          `${debtor.userName} should pay ₹${amount.toFixed(2)} to ${creditor.userName}`
        );
      }

      creditor.balance = parseFloat((creditor.balance - amount).toFixed(2));
      debtor.balance = parseFloat((debtor.balance + amount).toFixed(2));

      if (Math.abs(creditor.balance) < 0.01) {
        creditorIndex += 1;
      }
      if (Math.abs(debtor.balance) < 0.01) {
        debtorIndex += 1;
      }
    }

    return instructions;
  }, [members]);

  const selectedGroup = groupId ? groups.find((candidate) => candidate.id === groupId) : null;

  const handleSelectGroup = (id: string) => {
    if (id === groupId) {
      return;
    }
    setLoading(true);
    setGroupId(id);
    localStorage.setItem('selectedGroupId', id);
  };

  const handleSplitBetweenToggle = (userId: string) => {
    setNewExpense((prev) => {
      const exists = prev.splitBetween.includes(userId);
      return {
        ...prev,
        splitBetween: exists
          ? prev.splitBetween.filter((id) => id !== userId)
          : [...prev.splitBetween, userId],
      };
    });
  };

  const handleReceiptChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setNewExpense((prev) => ({
      ...prev,
      receiptFile: file ?? null,
    }));

    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setReceiptPreviewUrl(previewUrl);
    } else {
      setReceiptPreviewUrl(null);
    }
  };

  const handleAddExpense = async () => {
    if (!user || !groupId || !group) {
      return;
    }

    // Allow both leader and members to add expenses (members can add their own)

    if (!newExpense.category || !newExpense.amount || !newExpense.description) {
      alert('Please fill all fields.');
      return;
    }

    if (!newExpense.paidById) {
      alert('Select who paid for this expense.');
      return;
    }

    if (newExpense.splitBetween.length === 0) {
      alert('Select at least one member to split this expense.');
      return;
    }

    const amount = parseFloat(newExpense.amount);

    if (Number.isNaN(amount) || amount <= 0) {
      alert('Enter a valid amount.');
      return;
    }

    const payer = group.members.find((member) => member.uid === newExpense.paidById);
    if (!payer) {
      alert('Invalid payer selected.');
      return;
    }

    setIsSavingExpense(true);

    const expenseId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `expense_${Date.now()}`;

    // Optimistic UI: Add expense immediately
    const expenseDate = new Date(newExpense.date).toISOString();
    const optimisticExpense: GroupExpenseRecord = {
      id: expenseId,
      groupId,
      category: newExpense.category,
      amount,
      description: newExpense.description,
      paidBy: payer.name,
      paidById: payer.uid,
      splitBetween: newExpense.splitBetween,
      date: expenseDate,
      receiptUrl: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setExpenses((prev) => [optimisticExpense, ...prev]);

    try {
      let receiptUrl: string | undefined;

      if (newExpense.receiptFile) {
        setUploadingReceipt(true);
        await extractReceiptData(newExpense.receiptFile);
        receiptUrl = await uploadExpenseReceipt(groupId, expenseId, newExpense.receiptFile);
        setUploadingReceipt(false);
      }

      const savedExpense = await addGroupExpense({
        expenseId,
        groupId,
        category: newExpense.category,
        amount,
        description: newExpense.description,
        paidById: payer.uid,
        paidByName: payer.name,
        splitBetween: newExpense.splitBetween,
        date: new Date(newExpense.date),
        receiptUrl,
      });

      // Replace optimistic expense with real one
      setExpenses((prev) =>
        prev.map((exp) => (exp.id === expenseId ? savedExpense : exp))
      );

      setNewExpense({
        category: '',
        amount: '',
        description: '',
        paidById: payer.uid,
        splitBetween: group.members.map((member) => member.uid),
        date: new Date().toISOString().split('T')[0],
        receiptFile: null,
      });
      setReceiptPreviewUrl(null);
    } catch (err) {
      console.error('Error adding expense:', err);
      // Remove optimistic expense on error
      setExpenses((prev) => prev.filter((exp) => exp.id !== expenseId));
      alert('Failed to add expense. Please try again.');
    } finally {
      setIsSavingExpense(false);
      setUploadingReceipt(false);
    }
  };

  const getAIBudgetAnalysis = async () => {
    if (!group) {
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await apiService.analyzeBudget({
        groupId: group.id,
        groupName: group.groupName,
        destination: group.destination,
        totalBudget,
        duration: Math.max(
          1,
          Math.ceil(
            (new Date(group.endDate).getTime() - new Date(group.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        ),
        expenses: expenses.map((expense) => ({
          id: expense.id,
          category: expense.category,
          amount: expense.amount,
          description: expense.description,
          paidBy: expense.paidBy,
          splitBetween: expense.splitBetween,
          date: expense.date,
        })),
        memberSummary: members.map((member) => ({
          userId: member.userId,
          userName: member.userName,
          totalPaid: member.totalPaid,
          totalOwed: member.totalOwed,
          balance: member.balance,
        })),
      });
      setAiAnalysis(response.analysis);
    } catch (err) {
      console.error('Failed to get budget analysis:', err);
      setAiAnalysis('Unable to analyze budget at the moment. Please try again later.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">Budget Planner</h1>
          <p className="text-xl text-secondary">
            Track expenses and optimize your travel budget smartly
          </p>
        </div>

        {/* Wallet-like view of all groups */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-primary flex items-center">
              <Wallet className="h-6 w-6 mr-2 text-primary" />
              Group Travel Wallet
            </h2>
            {selectedGroup && (
              <span className="text-sm text-secondary bg-white/5 px-3 py-1 rounded-lg">
                Viewing: {selectedGroup.groupName}
              </span>
            )}
          </div>

          {groupsLoading ? (
            <div className="glass-card p-6 text-secondary text-center">
              Loading your travel groups...
            </div>
          ) : groupsError ? (
            <div className="glass-card p-6 text-red-400 text-center">{groupsError}</div>
          ) : groups.length === 0 ? (
            <div className="glass-card p-6 text-secondary text-center">
              You haven’t joined any travel groups yet. Create or join a group to start shared budgeting.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {groups.map((walletGroup) => {
                const isActive = walletGroup.id === groupId;
                const isLeaderBadge = walletGroup.leaderId === user?.uid;
                return (
                  <button
                    key={walletGroup.id}
                    type="button"
                    onClick={() => handleSelectGroup(walletGroup.id)}
                    className={`glass-card p-5 text-left rounded-2xl border transition-all duration-300 ${
                      isActive ? 'border-primary/60 bg-white/10 shadow-lg shadow-primary/20' : 'border-transparent hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-primary">{walletGroup.groupName}</h3>
                        <p className="text-sm text-secondary flex items-center mt-1">
                          <MapPin className="h-4 w-4 mr-1 text-primary/80" />
                          {walletGroup.destination}
                        </p>
                      </div>
                      {isLeaderBadge && (
                        <span className="flex items-center text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
                          <Crown className="h-3 w-3 mr-1" />
                          Leader
                        </span>
                      )}
                    </div>
                    <div className="flex items-center text-xs text-secondary mb-3">
                      <Calendar className="h-3.5 w-3.5 mr-1 text-primary/80" />
                      {new Date(walletGroup.startDate).toLocaleDateString('en-IN')} —{' '}
                      {new Date(walletGroup.endDate).toLocaleDateString('en-IN')}
                    </div>
                    <div className="text-xs text-secondary/80">
                      {walletGroup.description ? walletGroup.description : 'Shared trip budgeting and expense tracking.'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!groupId ? (
          <div className="flex justify-center items-center py-12">
            <div className="glass-card px-8 py-6 text-secondary text-center max-w-xl">
              {groups.length === 0
                ? 'Create or join a travel group from the Group Travel page to start a shared budget.'
                : 'Select a travel group from your wallet above to view and manage its shared budget.'}
            </div>
          </div>
        ) : loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="glass-card px-8 py-6 text-secondary">Loading group budget data...</div>
          </div>
        ) : error ? (
          <div className="flex justify-center items-center py-20">
            <div className="glass-card px-8 py-6 text-red-400">{error}</div>
          </div>
        ) : (
          <>
            {/* Budget Sync Banner */}
            {finalizedPlan?.syncedToBudget && finalizedPlan.syncedAt && (
              <div className="mb-6 glass-card p-4 bg-green-400/10 border border-green-400/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-green-400/20 flex items-center justify-center">
                      <span className="text-xl">💡</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-400">
                      Budget synced from approved trip plan: {finalizedPlan.planName || 'Group Trip Plan'}
                    </p>
                    <p className="text-xs text-secondary mt-1">
                      Synced on {new Date(finalizedPlan.syncedAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Budget Overview */}
              <div className="lg:col-span-2 space-y-6">
                {/* AI-Predicted Budget Plan */}
                {aiBudget && (
                  <div className="glass-card p-6">
                    <h2 className="text-2xl font-bold text-primary mb-6 flex items-center">
                      <Brain className="h-6 w-6 mr-2 text-blue-400" />
                      AI-Predicted Budget Plan
                    </h2>
                    
                    <div className="mb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-secondary">Total AI Budget</p>
                          <p className="text-3xl font-bold text-blue-400">
                            ₹{aiBudget.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <Brain className="h-12 w-12 text-blue-400" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-primary mb-3">Category Breakdown</h3>
                      {Object.entries(aiBudget.categories).map(([category, allocation], index) => (
                        <div
                          key={`${category}-${index}`}
                          className="p-3 glass-card hover:bg-white/5 transition-all duration-300"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div
                                className="w-4 h-4 rounded-full mr-3"
                                style={{ backgroundColor: allocation.color || colorPalette[index % colorPalette.length] }}
                              ></div>
                              <span className="font-medium text-primary">{category}</span>
                            </div>
                            <span className="text-sm text-blue-300">
                              ₹{(allocation.budgeted || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 text-xs text-secondary bg-blue-400/10 px-3 py-2 rounded-lg">
                      This is the AI-predicted budget for your trip. Use it as a reference while planning your actual expenses.
                    </div>
                  </div>
                )}

                {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary">Total Budget</p>
                      <p className="text-3xl font-bold text-primary">
                        ₹{totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <DollarSign className="h-12 w-12 text-primary" />
                  </div>
                </div>

                <div className="glass-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary">Total Spent</p>
                      <p className="text-3xl font-bold text-red-400">
                        ₹{totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <TrendingUp className="h-12 w-12 text-red-400" />
                  </div>
                  <div className="mt-2">
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-red-400 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: totalBudget > 0 ? `${Math.min((totalSpent / totalBudget) * 100, 100)}%` : '0%',
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-secondary">Remaining</p>
                      <p
                        className={`text-3xl font-bold ${
                          remaining >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        ₹{Math.abs(remaining).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <PieChart
                      className={`h-12 w-12 ${remaining >= 0 ? 'text-green-400' : 'text-red-400'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Category Breakdown (User Actual vs Budget, with AI reference per category if available) */}
              <div className="glass-card p-6">
                <h2 className="text-2xl font-bold text-primary mb-6">Category Breakdown (Actual vs Budget)</h2>
                {categoryAggregates.length === 0 ? (
                  <div className="text-secondary text-sm">
                    No budget categories set. Please finalize a plan to see category budgets.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categoryAggregates.map((category, index) => {
                      const percentage =
                        category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0;
                      const remainingForCategory = Math.max(category.budgeted - category.spent, 0);
                      const aiAllocation =
                        (aiBudget?.categories as any)?.[category.category] ?? null;
                      const aiBudgetAmount = aiAllocation?.budgeted ?? null;
                      return (
                        <div
                          key={`${category.category}-${index}`}
                          className="p-4 glass-card hover:bg-white/10 transition-all duration-300"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <div
                                className="w-4 h-4 rounded-full mr-3"
                                style={{ backgroundColor: category.color }}
                              ></div>
                              <span className="font-semibold text-primary">{category.category}</span>
                            </div>
                            <div className="text-right text-xs text-secondary space-y-1">
                              {aiBudgetAmount !== null && (
                                <div>
                                  <span className="font-medium text-blue-300">AI Budget</span>{' '}
                                  <span>
                                    ₹{aiBudgetAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-primary">Actual</span>{' '}
                                <span>
                                  ₹{category.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                                  / ₹{category.budgeted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-3">
                            <div
                              className="h-3 rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(percentage, 100)}%`,
                                backgroundColor: category.color,
                              }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-sm text-secondary mt-1">
                            <span>{percentage.toFixed(1)}% used</span>
                            <span>
                              ₹{remainingForCategory.toLocaleString('en-IN', { minimumFractionDigits: 2 })} left
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Member Budget Share & Balances */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-primary">
                    💸 Member Budget Share & Balances
                  </h2>
                  {isLeader && (
                    <button
                      onClick={() => {
                        // Initialize editing state with current budget shares
                        const initialShares: Record<string, string> = {};
                        memberBudgetShares.forEach((member) => {
                          initialShares[member.userId] = member.budgetShare.toFixed(2);
                        });
                        setEditingBudgetShares(initialShares);
                        setShowBudgetShareModal(true);
                      }}
                      className="premium-button-secondary flex items-center gap-2 text-sm"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Assign Budget Shares
                    </button>
                  )}
                </div>

                {memberBudgetShares.length === 0 ? (
                  <div className="text-secondary text-sm">
                    No members found. Add members to the group to see budget shares.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Leaderboard Cards */}
                    {(topSpender || mostSaver) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {topSpender && (
                          <div className="glass-card p-4 bg-orange-400/10 border border-orange-400/30 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-2xl">🏆</span>
                              <h3 className="text-sm font-semibold text-orange-400">Top Spender</h3>
                            </div>
                            <p className="text-sm text-primary">
                              {topSpender.userName} spent the most (₹
                              {topSpender.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                            </p>
                          </div>
                        )}
                        {mostSaver && mostSaver.remaining > 0 && (
                          <div className="glass-card p-4 bg-green-400/10 border border-green-400/30 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-2xl">💰</span>
                              <h3 className="text-sm font-semibold text-green-400">Most Saver</h3>
                            </div>
                            <p className="text-sm text-primary">
                              {mostSaver.userName} saved the most (₹
                              {mostSaver.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })} remaining)
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Member Budget Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-primary">
                              Member
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-primary">
                              Budget Share
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-primary">
                              Spent
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-primary">
                              Remaining
                            </th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-primary">
                              Progress
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberBudgetShares.map((member) => (
                            <tr
                              key={member.userId}
                              className="border-b border-white/5 hover:bg-white/5 transition-colors"
                            >
                              <td className="py-4 px-4">
                                <span className="font-medium text-primary">{member.userName}</span>
                                {member.userId === group?.leaderId && (
                                  <span className="ml-2 text-xs text-orange-400">(Leader)</span>
                                )}
                              </td>
                              <td className="py-4 px-4 text-right text-primary">
                                ₹{member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-4 px-4 text-right text-red-400">
                                ₹{member.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td
                                className={`py-4 px-4 text-right ${
                                  member.remaining >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                ₹{Math.abs(member.remaining).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 bg-white/10 rounded-full h-2 min-w-[100px]">
                                    <div
                                      className="h-2 rounded-full transition-all duration-300"
                                      style={{
                                        width: `${Math.min(member.spentPercentage, 100)}%`,
                                        backgroundColor: member.progressColor,
                                      }}
                                    ></div>
                                  </div>
                                  <span className="text-xs text-secondary min-w-[40px] text-right">
                                    {member.spentPercentage.toFixed(0)}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Member Spending Bar Chart */}
                    <div className="mt-6">
                      <h3 className="text-lg font-bold text-primary mb-4">
                        Group Spending Distribution by Member
                      </h3>
                      <div className="space-y-3">
                        {memberBudgetShares
                          .sort((a, b) => b.spent - a.spent)
                          .map((member) => {
                            const maxSpent = Math.max(
                              ...memberBudgetShares.map((m) => m.spent),
                              1
                            );
                            const barWidth = (member.spent / maxSpent) * 100;

                            return (
                              <div key={member.userId} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-primary font-medium">{member.userName}</span>
                                  <span className="text-secondary">
                                    ₹{member.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="w-full bg-white/10 rounded-full h-4">
                                  <div
                                    className="h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                                    style={{
                                      width: `${barWidth}%`,
                                      backgroundColor: member.progressColor,
                                    }}
                                  >
                                    {barWidth > 15 && (
                                      <span className="text-xs text-white font-medium">
                                        {member.spentPercentage.toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Expenses */}
              <div className="glass-card p-6">
                <h2 className="text-2xl font-bold text-primary mb-6">Recent Expenses</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {expenses.length === 0 ? (
                    <div className="text-secondary text-sm">
                      No expenses added yet. Leaders can add expenses using the form on the right.
                    </div>
                  ) : (
                    expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="flex items-start justify-between p-4 glass-card hover:bg-white/10 transition-all duration-300"
                      >
                        <div className="flex-grow space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-primary">{expense.description}</h3>
                            <span className="text-lg font-bold text-red-400">
                              -₹{expense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center text-sm text-secondary gap-2">
                            <span className="bg-white/10 px-2 py-1 rounded-full">{expense.category}</span>
                            <span>
                              {new Date(expense.date).toLocaleDateString('en-IN', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span>Paid by {expense.paidBy}</span>
                            {expense.splitBetween.length > 0 && (
                              <span>
                                Split between{' '}
                                {expense.splitBetween
                                  .map(
                                    (memberId) =>
                                      memberDirectory.find((member) => member.userId === memberId)?.userName ||
                                      'Member'
                                  )
                                  .join(', ')}
                              </span>
                            )}
                          </div>
                          {expense.receiptUrl && (
                            <a
                              href={expense.receiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-sm text-primary underline"
                            >
                              View Receipt
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Member Settlement Summary */}
              <div className="glass-card p-6">
                <h2 className="text-2xl font-bold text-primary mb-6">Member Settlement Summary</h2>
                {members.length === 0 ? (
                  <div className="text-secondary text-sm">
                    Member balances will appear here once expenses are recorded.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm text-secondary">
                        <thead className="text-xs uppercase tracking-wider text-secondary/70">
                          <tr>
                            <th className="py-3 pr-4 font-medium">Member</th>
                            <th className="py-3 px-4 font-medium">Total Paid</th>
                            <th className="py-3 px-4 font-medium">Total Owed</th>
                            <th className="py-3 px-4 font-medium">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map((member) => (
                            <tr key={member.userId} className="border-t border-white/5">
                              <td className="py-3 pr-4 text-primary font-medium">{member.userName}</td>
                              <td className="py-3 px-4">
                                ₹{member.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-4">
                                ₹{member.totalOwed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td
                                className={`py-3 px-4 font-semibold ${
                                  member.balance >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                {member.balance >= 0 ? '+' : '-'}₹
                                {Math.abs(member.balance).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {settlementSummary.length > 0 && (
                      <div className="mt-4 space-y-2 text-sm text-secondary">
                        {settlementSummary.map((instruction, index) => (
                          <p key={index}>{instruction}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Add Expense Form */}
            <div className="space-y-6">
              <div className="glass-card p-6">
                <h2 className="text-2xl font-bold text-primary mb-6 flex items-center">
                  <PlusCircle className="h-6 w-6 mr-2 text-green-400" />
                  Add Expense
                </h2>

                {!user && (
                  <div className="mb-4 text-sm text-secondary bg-white/5 px-3 py-2 rounded-lg">
                    Please log in to add expenses.
                  </div>
                )}
                {user && (
                  <div className="mb-4 text-sm text-secondary bg-white/5 px-3 py-2 rounded-lg">
                    {isLeader
                      ? 'As the leader, you can add expenses for any member. Members can add their own expenses too.'
                      : 'You can add your own expenses. Select yourself as "Paid By" to track your spending.'}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Category</label>
                    <input
                      type="text"
                      value={newExpense.category}
                      onChange={(event) =>
                        setNewExpense((prev) => ({ ...prev, category: event.target.value }))
                      }
                      placeholder="Enter category"
                      className="w-full px-4 py-3 glass-input rounded-xl"
                      disabled={!user || isSavingExpense}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Amount (₹)</label>
                    <input
                      type="number"
                      value={newExpense.amount}
                      onChange={(event) =>
                        setNewExpense((prev) => ({ ...prev, amount: event.target.value }))
                      }
                      placeholder="Enter amount"
                      className="w-full px-4 py-3 glass-input rounded-xl"
                      disabled={!user || isSavingExpense}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Description</label>
                    <input
                      type="text"
                      value={newExpense.description}
                      onChange={(event) =>
                        setNewExpense((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="What did you spend on?"
                      className="w-full px-4 py-3 glass-input rounded-xl"
                      disabled={!user || isSavingExpense}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Date</label>
                    <input
                      type="date"
                      value={newExpense.date}
                      onChange={(event) =>
                        setNewExpense((prev) => ({ ...prev, date: event.target.value }))
                      }
                      className="w-full px-4 py-3 glass-input rounded-xl"
                      disabled={!user || isSavingExpense}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Paid By</label>
                    <select
                      value={newExpense.paidById}
                      onChange={(event) =>
                        setNewExpense((prev) => ({ ...prev, paidById: event.target.value }))
                      }
                      className="w-full px-4 py-3 glass-input rounded-xl"
                      disabled={!user || isSavingExpense}
                    >
                      <option value="">Select member</option>
                      {group?.members.map((member) => (
                        <option key={member.uid} value={member.uid}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Split Between</label>
                    <div className="grid grid-cols-1 gap-2">
                      {group?.members.map((member) => {
                        const checked = newExpense.splitBetween.includes(member.uid);
                        return (
                          <label
                            key={member.uid}
                            className="flex items-center text-sm text-secondary space-x-3"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-white/30 bg-transparent"
                              checked={checked}
                              onChange={() => handleSplitBetweenToggle(member.uid)}
                              disabled={!user || isSavingExpense}
                            />
                            <span>{member.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      Upload Receipt (optional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptChange}
                      className="w-full text-sm text-secondary"
                      disabled={!user || isSavingExpense}
                    />
                    {receiptPreviewUrl && (
                      <div className="mt-3">
                        <img
                          src={receiptPreviewUrl}
                          alt="Receipt preview"
                          className="h-32 w-full object-cover rounded-lg border border-white/10"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleAddExpense}
                    className="w-full premium-button-primary py-3 px-6 rounded-xl font-semibold disabled:opacity-50"
                    disabled={!user || isSavingExpense || uploadingReceipt}
                  >
                    {isSavingExpense ? 'Saving...' : uploadingReceipt ? 'Uploading receipt...' : 'Add Expense'}
                  </button>
                </div>
              </div>

              {/* Visual Chart Placeholder */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">Spending Distribution</h3>
                  <div className="flex items-center space-x-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setChartView('category')}
                      className={`px-3 py-1 rounded-lg ${
                        chartView === 'category' ? 'premium-button-primary' : 'glass-input'
                      }`}
                    >
                      By Category
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartView('member')}
                      className={`px-3 py-1 rounded-lg ${
                        chartView === 'member' ? 'premium-button-primary' : 'glass-input'
                      }`}
                    >
                      By Member
                    </button>
                  </div>
                </div>

                <div className="relative h-48 glass-card flex items-center justify-center w-full">
                  {chartView === 'category' ? (
                    categoryAggregates.length === 0 ? (
                      <div className="text-secondary text-sm text-center px-8">
                        Budget categories will appear here once a plan is finalized.
                      </div>
                    ) : (
                      <div className="w-full px-4">
                        {categoryAggregates.map((category, index) => (
                          <div key={`${category.category}-${index}`} className="mb-2">
                            <div className="flex items-center justify-between text-sm text-secondary">
                              <span>{category.category}</span>
                              <span>
                                ₹{category.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="w-full bg-white/10 rounded-full h-2">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: totalSpent > 0 ? `${(category.spent / totalSpent) * 100}%` : '0%',
                                  backgroundColor: category.color,
                                }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : memberSpending.length === 0 ? (
                    <div className="text-secondary text-sm text-center px-8">
                      Member spending will appear once expenses are added.
                    </div>
                  ) : (
                    <div className="w-full px-4">
                      {memberSpending.map((member, index) => (
                        <div key={`${member.name}-${index}`} className="mb-2">
                          <div className="flex items-center justify-between text-sm text-secondary">
                            <span>{member.name}</span>
                            <span>
                              ₹{member.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-primary/70"
                              style={{
                                width: totalSpent > 0 ? `${(member.amount / totalSpent) * 100}%` : '0%',
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Export Options */}
              <div className="glass-card p-6">
                <h3 className="text-lg font-bold text-primary mb-4">Export & Share</h3>
                <div className="space-y-3">
                  <button className="w-full flex items-center justify-center py-3 px-4 premium-button-secondary rounded-xl">
                    <Download className="h-5 w-5 mr-2 text-secondary" />
                    Export PDF Report
                  </button>
                  <button className="w-full flex items-center justify-center py-3 px-4 premium-button-secondary rounded-xl">
                    <Share className="h-5 w-5 mr-2 text-secondary" />
                    Share with Group
                  </button>
                </div>
              </div>

              {/* AI Suggestions */}
              <div className="glass-card p-6 border border-orange-500/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-primary">🤖 AI Budget Analysis</h3>
                  <button
                    onClick={getAIBudgetAnalysis}
                    disabled={isAnalyzing}
                    className="premium-button-primary px-3 py-1 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Get AI Tips'}
                  </button>
                </div>
                {aiAnalysis ? (
                  <div className="text-sm text-secondary whitespace-pre-wrap">{aiAnalysis}</div>
                ) : (
                  <div className="space-y-2 text-sm text-secondary">
                    <p>• Click "Get AI Tips" for personalized budget analysis</p>
                    <p>• AI will analyze your spending patterns</p>
                    <p>• Get recommendations for cost optimization</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          </>
        )}

        {/* Budget Share Assignment Modal */}
        {showBudgetShareModal && isLeader && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="glass-card p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-primary">Assign Budget Shares</h3>
                <button
                  onClick={() => setShowBudgetShareModal(false)}
                  className="text-secondary hover:text-primary"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-secondary mb-6">
                Assign how much money each member has brought/contributed to the group budget.
              </p>

              <div className="space-y-4 mb-6">
                {memberBudgetShares.map((member) => (
                  <div key={member.userId} className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-primary mb-2">
                        {member.userName}
                        {member.userId === group?.leaderId && (
                          <span className="ml-2 text-xs text-orange-400">(Leader)</span>
                        )}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">₹</span>
                        <input
                          type="number"
                          value={editingBudgetShares[member.userId] || '0'}
                          onChange={(e) => {
                            setEditingBudgetShares({
                              ...editingBudgetShares,
                              [member.userId]: e.target.value,
                            });
                          }}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="w-full pl-8 pr-4 py-2 glass-input rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="text-sm text-secondary pt-6">
                      Current: ₹{member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowBudgetShareModal(false)}
                  className="premium-button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!groupId) return;

                    setSavingBudgetShares(true);
                    try {
                      const shares = Object.entries(editingBudgetShares).map(([userId, share]) => ({
                        userId,
                        budgetShare: parseFloat(share) || 0,
                      }));

                      await updateMemberBudgetShares(groupId, shares);
                      setShowBudgetShareModal(false);
                      // Refresh members data
                      const updatedMembers = await getGroupMembersSummary(groupId);
                      setMembers(updatedMembers);
                    } catch (error) {
                      console.error('Error updating budget shares:', error);
                      alert('Failed to update budget shares. Please try again.');
                    } finally {
                      setSavingBudgetShares(false);
                    }
                  }}
                  disabled={savingBudgetShares}
                  className="premium-button-primary disabled:opacity-50"
                >
                  {savingBudgetShares ? 'Saving...' : 'Save Budget Shares'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BudgetPage;

