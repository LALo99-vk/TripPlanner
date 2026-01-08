import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, DollarSign, TrendingUp, PieChart, Download, Share, Wallet, MapPin, Calendar, Crown, Brain, Users, X, Lock, Unlock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { apiService } from '../../services/api';
import { jsPDF } from 'jspdf';
import { sendMessage } from '../../services/chatRepository';
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
  toggleBudgetCategoryLock,
  updateMemberBudgetShares,
  upsertGroupBudget,
  uploadExpenseReceipt,
} from '../../services/budgetRepository';
import { getGroup, getUserGroups, subscribeUserGroups, type Group } from '../../services/groupRepository';
import { getFinalizedPlan, subscribeToFinalizedPlan, type FinalizedPlan } from '../../services/planApprovalRepository';
import { getAuthenticatedSupabaseClient } from '../../config/supabase';

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
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [lockingCategory, setLockingCategory] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' }>>([]);
  const [showLockConfirm, setShowLockConfirm] = useState<{ category: string; action: 'lock' | 'unlock' } | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [editingCategories, setEditingCategories] = useState<Array<{ name: string; budget: string; color: string; description?: string }>>([]);
  const [savingCategories, setSavingCategories] = useState(false);
  const [showAiSyncConfirm, setShowAiSyncConfirm] = useState(false);
  const [editingSingleCategory, setEditingSingleCategory] = useState<{ category: string; budget: string; color: string; description?: string } | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
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
  const [aiBudget, setAiBudget] = useState<{
    total: number;
    categories: Record<string, { budgeted: number; color?: string }>;
  } | null>(null);

  // Fetch category budgets from plans table if missing in finalizedPlan
  useEffect(() => {
    const loadCategoryBudgets = async () => {
      if (!finalizedPlan) {
        setAiBudget(null);
        return;
      }

      let categoryBudgets = finalizedPlan.categoryBudgets || null;

      // If categoryBudgets is missing or empty, try to fetch from plans table
      if ((!categoryBudgets || Object.keys(categoryBudgets).length === 0) && finalizedPlan.planId) {
        try {
          const supabase = await getAuthenticatedSupabaseClient();
          const { data: planData } = await supabase
            .from('plans')
            .select('category_budgets, optimized_budget, total_estimated_budget, plan_data')
            .eq('id', finalizedPlan.planId)
            .single();

          if (planData) {
            // Try to get category_budgets from plans table
            let rawCategoryBudgets =
              planData.category_budgets ||
              (planData.plan_data as any)?.totals?.breakdown ||
              null;

            // If still no category budgets, try plan_data.totals.breakdown
            if (!rawCategoryBudgets && (planData.plan_data as any)?.totals) {
              const totals = (planData.plan_data as any).totals;
              if (totals.breakdown) {
                rawCategoryBudgets = totals.breakdown;
              }
            }

            // Normalize category budgets format
            if (rawCategoryBudgets) {
              // Check if it's already in the correct format { category: { budgeted: number, color?: string } }
              const firstKey = Object.keys(rawCategoryBudgets)[0];
              const firstValue = rawCategoryBudgets[firstKey];

              if (firstValue && typeof firstValue === 'object' && 'budgeted' in firstValue) {
                // Already in correct format
                categoryBudgets = rawCategoryBudgets;
              } else {
                // Convert from simple format { category: number } to { category: { budgeted: number } }
                const normalizedBudgets: Record<string, { budgeted: number; color: string }> = {};
                Object.entries(rawCategoryBudgets).forEach(([category, value], index) => {
                  const amount = typeof value === 'number' ? value : (value as any)?.budgeted || 0;
                  normalizedBudgets[category] = {
                    budgeted: amount,
                    color: colorPalette[index % colorPalette.length],
                  };
                });
                categoryBudgets = normalizedBudgets;
              }
            }
          }
        } catch (error) {
          console.error('Error fetching category budgets from plans table:', error);
        }
      }

      const finalCategoryBudgets = categoryBudgets || {};
      setAiBudget({
      total: finalizedPlan.totalEstimatedBudget || 0,
        categories: finalCategoryBudgets,
      });
    };

    loadCategoryBudgets();
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

  // Enhanced settlement calculation including contributions and personal expenses
  const settlementData = useMemo(() => {
    return members.map((member) => {
      // Calculate personal expenses (spent from wallet)
      const personalExpenses = member.budgetShare - member.walletBalance;
      
      // Calculate shared expenses (excluding personal expenses)
      // totalPaid includes all expenses, so we subtract personal expenses to get shared expenses paid
      const sharedExpensesPaid = member.totalPaid - personalExpenses;
      
      // Final settlement amount
      // Formula: Contribution - Personal Expenses - Shared Owed + Shared Paid
      // Simplified: budgetShare - personalExpenses - totalOwed + (totalPaid - personalExpenses)
      // = budgetShare + totalPaid - totalOwed - 2*personalExpenses
      // But we can simplify: budgetShare - personalExpenses - totalOwed + sharedExpensesPaid
      const finalSettlement = member.budgetShare - personalExpenses - member.totalOwed + sharedExpensesPaid;
      
      return {
        ...member,
        personalExpenses,
        sharedExpensesPaid,
        finalSettlement: Math.round(finalSettlement * 100) / 100,
      };
    });
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

  // Toast notification helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Export PDF Report
  const handleExportPDF = async () => {
    if (!group || !budget) {
      showToast('No group or budget data available to export', 'error');
      return;
    }

    setIsExportingPDF(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPos = 20;
      const margin = 15;
      const lineHeight = 7;
      const maxWidth = pageWidth - (margin * 2);

      // Helper function to add a new page if needed
      const checkNewPage = (requiredSpace: number) => {
        if (yPos + requiredSpace > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
        }
      };

      // Title
      doc.setFontSize(20);
      doc.setTextColor(255, 255, 255);
      doc.setFillColor(0, 0, 0);
      doc.rect(0, 0, pageWidth, 30, 'F');
      doc.text('Budget Report', margin, yPos + 10);
      yPos = 35;

      // Group Info
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      const groupNameLines = doc.splitTextToSize(`Group: ${group.groupName}`, maxWidth);
      doc.text(groupNameLines, margin, yPos);
      yPos += groupNameLines.length * lineHeight;
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, margin, yPos);
      yPos += lineHeight * 2;

      // Budget Summary
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Budget Summary', margin, yPos);
      yPos += lineHeight;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Total Budget: ₹${totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight;
      doc.text(`Total Spent: ₹${totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight;
      doc.text(`Remaining: ₹${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight * 2;

      // Category Breakdown
      if (categoryAggregates.length > 0) {
        checkNewPage(lineHeight * (categoryAggregates.length + 3));
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Category Breakdown', margin, yPos);
        yPos += lineHeight;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        categoryAggregates.forEach((cat) => {
          checkNewPage(lineHeight * 2);
          const percentage = cat.budgeted > 0 ? ((cat.spent / cat.budgeted) * 100).toFixed(1) : '0.0';
          const categoryText = `${cat.category}: ₹${cat.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / ₹${cat.budgeted.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${percentage}%)`;
          const lines = doc.splitTextToSize(categoryText, maxWidth);
          doc.text(lines, margin, yPos);
          yPos += lines.length * lineHeight;
        });
        yPos += lineHeight;
      }

      // Member Budget Shares
      if (memberBudgetShares.length > 0) {
        checkNewPage(lineHeight * (memberBudgetShares.length + 3));
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Member Budget Shares', margin, yPos);
        yPos += lineHeight;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        memberBudgetShares.forEach((member) => {
          checkNewPage(lineHeight * 2);
          const memberText = `${member.userName}: ₹${member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Spent: ₹${member.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}, Remaining: ₹${member.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`;
          const lines = doc.splitTextToSize(memberText, maxWidth);
          doc.text(lines, margin, yPos);
          yPos += lines.length * lineHeight;
        });
        yPos += lineHeight;
      }

      // Settlement Data
      if (settlementData.length > 0) {
        checkNewPage(lineHeight * (settlementData.length + 3));
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Settlement Summary', margin, yPos);
        yPos += lineHeight;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        settlementData.forEach((member) => {
          checkNewPage(lineHeight * 2);
          const settlementText = member.finalSettlement >= 0 ? 'receives' : 'pays';
          const settlementLine = `${member.userName}: ${settlementText} ₹${Math.abs(member.finalSettlement).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          const lines = doc.splitTextToSize(settlementLine, maxWidth);
          doc.text(lines, margin, yPos);
          yPos += lines.length * lineHeight;
        });
        yPos += lineHeight;
      }

      // Expenses List
      if (expenses.length > 0) {
        checkNewPage(lineHeight * (expenses.length + 3));
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Recent Expenses', margin, yPos);
        yPos += lineHeight;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        expenses.slice(0, 20).forEach((expense) => {
          checkNewPage(lineHeight * 3);
          const expenseText = `${expense.description} - ₹${expense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          const expenseLines = doc.splitTextToSize(expenseText, maxWidth);
          doc.text(expenseLines, margin, yPos);
          yPos += expenseLines.length * (lineHeight * 0.7);
          const categoryText = `Category: ${expense.category} | Paid by: ${expense.paidBy}`;
          const categoryLines = doc.splitTextToSize(categoryText, maxWidth);
          doc.text(categoryLines, margin, yPos);
          yPos += categoryLines.length * (lineHeight * 0.7);
          doc.text(`Date: ${new Date(expense.date).toLocaleDateString('en-IN')}`, margin, yPos);
          yPos += lineHeight;
        });
        if (expenses.length > 20) {
          doc.text(`... and ${expenses.length - 20} more expenses`, margin, yPos);
        }
      }

      // Save PDF
      const fileName = `${group.groupName.replace(/[^a-z0-9]/gi, '_')}_Budget_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      showToast('PDF report exported successfully!', 'success');
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      showToast(`Failed to export PDF: ${errorMessage}`, 'error');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Share with Group
  const handleShareWithGroup = async () => {
    if (!group || !budget || !user || !groupId) {
      showToast('No group or budget data available to share', 'error');
      return;
    }

    setIsSharing(true);
    try {
      // Format budget data as a message
      let message = `💰 *Budget Report for ${group.groupName}*\n\n`;
      
      // Budget Summary
      message += `📊 *Budget Summary*\n`;
      message += `Total Budget: ₹${totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
      message += `Total Spent: ₹${totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
      message += `Remaining: ₹${remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n`;

      // Category Breakdown
      if (categoryAggregates.length > 0) {
        message += `📋 *Category Breakdown*\n`;
        categoryAggregates.forEach((cat) => {
          const percentage = cat.budgeted > 0 ? ((cat.spent / cat.budgeted) * 100).toFixed(1) : '0.0';
          message += `${cat.category}: ₹${cat.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / ₹${cat.budgeted.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${percentage}%)\n`;
        });
        message += `\n`;
      }

      // Member Budget Shares
      if (memberBudgetShares.length > 0) {
        message += `👥 *Member Budget Shares*\n`;
        memberBudgetShares.forEach((member) => {
          message += `${member.userName}: ₹${member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Spent: ₹${member.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}, Remaining: ₹${member.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })})\n`;
        });
        message += `\n`;
      }

      // Settlement Summary
      if (settlementData.length > 0) {
        message += `💸 *Settlement Summary*\n`;
        settlementData.forEach((member) => {
          const settlementText = member.finalSettlement >= 0 ? 'receives' : 'pays';
          message += `${member.userName}: ${settlementText} ₹${Math.abs(member.finalSettlement).toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
        });
        message += `\n`;
      }

      // Recent Expenses
      if (expenses.length > 0) {
        message += `📝 *Recent Expenses*\n`;
        expenses.slice(0, 10).forEach((expense) => {
          message += `• ${expense.description} - ₹${expense.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${expense.category}, paid by ${expense.paidBy})\n`;
        });
        if (expenses.length > 10) {
          message += `... and ${expenses.length - 10} more expenses\n`;
        }
      }

      message += `\n_Generated on ${new Date().toLocaleString('en-IN')}_`;

      // Send message to group chat
      await sendMessage(groupId, user.uid, user.displayName || 'User', {
        text: message,
      });

      showToast('Budget report shared with group successfully!', 'success');
    } catch (error: any) {
      showToast('Failed to share budget report. Please try again.', 'error');
    } finally {
      setIsSharing(false);
    }
  };

  // Handle lock/unlock category with confirmation
  const handleLockToggle = async (category: string, action: 'lock' | 'unlock') => {
    if (!groupId || !user || !budget) return;

    setLockingCategory(category);
    
    // Optimistic update: immediately update budget state
    const currentLocked = budget.lockedCategories || [];
    const updatedLocked = action === 'lock'
      ? [...currentLocked, category]
      : currentLocked.filter(c => c !== category);
    
    setBudget({
      ...budget,
      lockedCategories: updatedLocked,
    });
    
    try {
      await toggleBudgetCategoryLock(groupId, category, user.uid);
      showToast(
        `Category "${category}" has been ${action === 'lock' ? 'locked' : 'unlocked'} successfully.`,
        'success'
      );
      // Budget will also update via subscription for consistency
    } catch (error: any) {
      console.error('Error toggling category lock:', error);
      // Revert optimistic update on error
      setBudget({
        ...budget,
        lockedCategories: currentLocked,
      });
      showToast(
        error.message || `Failed to ${action} category. Please try again.`,
        'error'
      );
    } finally {
      setLockingCategory(null);
      setShowLockConfirm(null);
    }
  };

  const handleAddExpense = async () => {
    if (!user || !groupId || !group) {
      return;
    }

    // Allow both leader and members to add expenses (members can add their own)

    if (!newExpense.category || !newExpense.amount || !newExpense.description) {
      showToast('Please fill all required fields.', 'error');
      return;
    }

    const amount = parseFloat(newExpense.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount greater than zero.', 'error');
      return;
    }

    // Validate category exists in budget categories (if categories are set)
    const validCategories = budget?.categoryAllocations ? Object.keys(budget.categoryAllocations) : [];
    if (validCategories.length > 0 && !validCategories.includes(newExpense.category)) {
      showToast(`Category "${newExpense.category}" does not exist. Please select a valid category from the list.`, 'error');
      return;
    }

    // Check if category is locked (for non-leaders)
    if (budget?.lockedCategories?.includes(newExpense.category) && !isLeader) {
      showToast(`Category "${newExpense.category}" is locked. Only the leader can add expenses to locked categories.`, 'error');
      return;
    }

    // Check category budget remaining (if category exists in budget)
    if (budget?.categoryAllocations?.[newExpense.category]) {
      const categoryAllocation = budget.categoryAllocations[newExpense.category];
      const categorySpent = expenses
        .filter(exp => exp.category === newExpense.category)
        .reduce((sum, exp) => sum + exp.amount, 0);
      const categoryRemaining = categoryAllocation.budgeted - categorySpent;

      // Check if adding this expense would exceed the category budget
      if (categoryRemaining < amount) {
        const wouldExceed = categoryRemaining < 0;
        if (wouldExceed) {
          showToast(
            `⚠️ Category "${newExpense.category}" is already over budget by ₹${Math.abs(categoryRemaining).toLocaleString('en-IN', { minimumFractionDigits: 2 })}. This expense will increase the overage.`,
            'error'
          );
          if (!confirm(`Category "${newExpense.category}" is already over budget. Do you still want to add this expense?`)) {
            return;
          }
        } else {
          showToast(
            `⚠️ Adding this expense (₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) will exceed the category budget. Remaining: ₹${categoryRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
            'error'
          );
          if (!confirm(`This will exceed the category budget. Do you still want to proceed?`)) {
            return;
          }
        }
      } else if (categoryRemaining - amount < categoryAllocation.budgeted * 0.1 && categoryRemaining - amount >= 0) {
        // Warning for low remaining budget (less than 10% after this expense)
        showToast(
          `⚠️ Low Budget Warning: Adding this expense will leave less than 10% remaining in "${newExpense.category}" category.`,
          'error'
        );
      }
    }

    if (!newExpense.paidById) {
      showToast('Please select who paid for this expense.', 'error');
      return;
    }

    if (newExpense.splitBetween.length === 0) {
      showToast('Please select at least one member to split this expense.', 'error');
      return;
    }

    const payer = group.members.find((member) => member.uid === newExpense.paidById);
    if (!payer) {
      showToast('Invalid payer selected. Please try again.', 'error');
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

      // Force refresh members to ensure settlement updates immediately
      if (groupId) {
        const updatedMembers = await getGroupMembersSummary(groupId);
        setMembers(updatedMembers);
      }

      showToast('Expense added successfully!', 'success');
      
      // Reset form
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
    } catch (err: any) {
      console.error('Error adding expense:', err);
      // Remove optimistic expense on error
      setExpenses((prev) => prev.filter((exp) => exp.id !== expenseId));
      showToast(
        err.message || 'Failed to add expense. Please try again.',
        'error'
      );
      
      // Check if error is about locked category
      if (err.message && err.message.includes('locked')) {
        alert(`❌ ${err.message}\n\nOnly the group leader can unlock categories.`);
      } else {
      alert('Failed to add expense. Please try again.');
      }
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
    <div className="min-h-screen p-3 sm:p-6 pb-safe">
      <div className="content-container">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-4xl font-bold text-primary mb-4">Budget Planner</h1>
          <p className="text-xl text-secondary">
            Track expenses and optimize your travel budget smartly
          </p>
        </div>

        {/* Group Selection Dropdown */}
        <div className="mb-10">
          <div className="glass-card p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="h-5 w-5 text-primary" />
              <label className="block text-lg font-semibold text-primary">Select Group</label>
          </div>

          {groupsLoading ? (
              <div className="text-secondary text-center py-4">
              Loading your travel groups...
            </div>
          ) : groupsError ? (
              <div className="text-red-400 text-center py-4">{groupsError}</div>
          ) : groups.length === 0 ? (
              <div className="text-secondary text-center py-4">
                You haven't joined any travel groups yet. Create or join a group to start shared budgeting.
            </div>
          ) : (
              <>
                <select
                  value={groupId || ''}
                  onChange={(e) => handleSelectGroup(e.target.value)}
                  className="w-full glass-input px-4 py-3 rounded-xl text-primary"
                  disabled={groupsLoading}
                >
                  <option value="">-- Select a group --</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.groupName} - {group.destination}
                      {group.leaderId === user?.uid ? ' (Leader)' : ''}
                    </option>
                  ))}
                </select>
                
                {selectedGroup && (
                  <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-semibold text-primary">{selectedGroup.groupName}</h3>
                          {selectedGroup.leaderId === user?.uid && (
                            <span className="flex items-center text-xs font-semibold text-orange-400 bg-orange-400/10 px-2 py-1 rounded-full">
                          <Crown className="h-3 w-3 mr-1" />
                          Leader
                        </span>
                      )}
                    </div>
                        <div className="flex items-center text-sm text-secondary mb-1">
                          <MapPin className="h-4 w-4 mr-1 text-primary/80" />
                          {selectedGroup.destination}
                        </div>
                        <div className="flex items-center text-xs text-secondary">
                      <Calendar className="h-3.5 w-3.5 mr-1 text-primary/80" />
                          {new Date(selectedGroup.startDate).toLocaleDateString('en-IN')} —{' '}
                          {new Date(selectedGroup.endDate).toLocaleDateString('en-IN')}
                    </div>
                        {selectedGroup.description && (
                          <p className="text-xs text-secondary/80 mt-2">{selectedGroup.description}</p>
                        )}
                    </div>
                    </div>
            </div>
                )}
              </>
          )}
          </div>
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
                {/* Locked Categories Summary (Leader Only) */}
                {isLeader && budget?.lockedCategories && budget.lockedCategories.length > 0 && (
                  <div className="glass-card p-6 mb-6 border-2 border-orange-400/30 bg-orange-400/5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-orange-400" />
                        <h3 className="text-lg font-bold text-primary">Locked Categories</h3>
                        <span className="text-xs text-orange-400 bg-orange-400/20 px-2 py-1 rounded-full">
                          {budget.lockedCategories.length} locked
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          // Bulk unlock all categories
                          const lockedCats = budget?.lockedCategories || [];
                          if (lockedCats.length === 0) return;
                          if (window.confirm(`Are you sure you want to unlock all ${lockedCats.length} locked categories?`)) {
                            Promise.all(
                              lockedCats.map(cat => 
                                toggleBudgetCategoryLock(groupId!, cat, user!.uid).catch(err => {
                                  showToast(`Failed to unlock ${cat}: ${err.message}`, 'error');
                                  return null;
                                })
                              )
                            ).then(() => {
                              showToast('All categories unlocked successfully!', 'success');
                            });
                          }
                        }}
                        className="text-xs text-orange-400 hover:text-orange-300 underline"
                        title="Unlock all categories"
                      >
                        Unlock All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {budget.lockedCategories.map((category) => (
                        <div
                          key={category}
                          className="flex items-center gap-2 bg-orange-400/10 border border-orange-400/30 px-3 py-2 rounded-lg"
                        >
                          <Lock className="h-3 w-3 text-orange-400" />
                          <span className="text-sm text-primary font-medium">{category}</span>
                          <button
                            onClick={() => setShowLockConfirm({ category, action: 'unlock' })}
                            className="ml-1 text-orange-400 hover:text-orange-300 transition-colors"
                            title={`Unlock ${category}`}
                            aria-label={`Unlock ${category} category`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-secondary mt-3">
                      💡 Locked categories prevent members from adding expenses. Only you (the leader) can add expenses to locked categories.
                    </p>
                  </div>
                )}

                {/* AI-Predicted Budget Plan */}
                {(aiBudget || finalizedPlan) && (
                  <div className="glass-card p-4 sm:p-6">
                    <h2 className="text-2xl font-bold text-primary mb-6 flex items-center">
                      <Brain className="h-6 w-6 mr-2 text-blue-400" />
                      AI-Predicted Budget Plan
                    </h2>
                    
                    <div className="mb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-secondary">Total AI Budget</p>
                          <p className="text-3xl font-bold text-blue-400">
                            ₹{(aiBudget?.total || finalizedPlan?.totalEstimatedBudget || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <Brain className="h-12 w-12 text-blue-400" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-primary mb-3">Category Breakdown</h3>
                      {(!aiBudget || !aiBudget.categories || Object.keys(aiBudget.categories).length === 0) ? (
                        <div className="text-secondary text-sm text-center py-6 bg-white/5 rounded-lg border border-white/10">
                          <p className="mb-2">No category breakdown available.</p>
                          <p className="text-xs">Category budgets will appear here once the AI plan includes category allocations.</p>
                          {finalizedPlan && !aiBudget && (
                            <p className="text-xs mt-2 text-blue-400">Loading category breakdown from plan...</p>
                          )}
                        </div>
                      ) : (
                        Object.entries(aiBudget.categories).map(([category, allocation], index) => {
                          const isCatLocked = budget?.lockedCategories?.includes(category) || false;
                          return (
                        <div
                          key={`${category}-${index}`}
                              className={`p-3 glass-card hover:bg-white/5 transition-all duration-300 ${
                                isCatLocked ? 'border-l-4 border-orange-400/50 bg-orange-400/5' : ''
                              }`}
                        >
                          <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                              <div
                                    className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: allocation.color || colorPalette[index % colorPalette.length] }}
                              ></div>
                              <span className="font-medium text-primary">{category}</span>
                                  {isCatLocked && (
                                    <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full">
                                      <Lock className="h-3 w-3" />
                                      Locked
                                    </span>
                                  )}
                            </div>
                            <span className="text-sm text-blue-300">
                              ₹{(allocation.budgeted || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 text-xs text-secondary bg-blue-400/10 px-3 py-2 rounded-lg">
                      This is the AI-predicted budget for your trip. Use it as a reference while planning your actual expenses.
                    </div>
                  </div>
                )}

                {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-card p-4 sm:p-6">
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

                <div className="glass-card p-4 sm:p-6">
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

                <div className="glass-card p-4 sm:p-6">
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

              {/* Budget Lock Feature Info (Leader Only) */}
              {isLeader && (
                <div className="mb-6 glass-card p-4 bg-gradient-to-r from-orange-400/10 to-red-400/10 border border-orange-400/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Lock className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-primary mb-1">🔒 Milestone Budget Lock</h3>
                      <p className="text-xs text-secondary">
                        Lock important budget categories (like hotel, travel) to prevent random spending from eating into critical funds. 
                        Click the lock icon next to any category to lock/unlock it. Only you (the leader) can manage locks.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Category Breakdown (User Actual vs Budget, with AI reference per category if available) */}
              <div className="glass-card p-4 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-primary">Category Breakdown (Actual vs Budget)</h2>
                  <div className="flex items-center gap-3">
                    {isLeader && (
                      <>
                        {aiBudget && aiBudget.categories && Object.keys(aiBudget.categories).length > 0 && (
                          <button
                            onClick={() => setShowAiSyncConfirm(true)}
                            className="text-xs premium-button-secondary flex items-center gap-1 px-3 py-1.5"
                            title="Sync categories from AI plan"
                          >
                            <Brain className="h-3 w-3" />
                            Sync from AI
                          </button>
                        )}
                        <button
                          onClick={() => {
                            // Initialize editing state with current categories
                            const currentCategories = budget?.categoryAllocations 
                              ? Object.entries(budget.categoryAllocations)
                                  .filter(([_, alloc]) => alloc && typeof alloc === 'object')
                                  .map(([name, alloc]) => ({
                                    name,
                                    budget: (alloc?.budgeted ?? 0).toString(),
                                    color: alloc?.color || colorPalette[0],
                                    description: (alloc as any)?.description || '',
                                  }))
                              : [];
                            // If no categories exist, add one empty category to start with
                            if (currentCategories.length === 0) {
                              currentCategories.push({
                                name: '',
                                budget: '0',
                                color: colorPalette[0],
                                description: '',
                              });
                            }
                            setEditingCategories(currentCategories);
                            setShowCategoryManager(true);
                          }}
                          className="text-xs premium-button-primary flex items-center gap-1 px-3 py-1.5"
                        >
                          <PlusCircle className="h-3 w-3" />
                          Manage Categories
                        </button>
                      </>
                    )}
                    {isLeader && (
                      <div className="flex items-center gap-2 text-xs text-secondary">
                        <Lock className="h-4 w-4" />
                        <span>Click lock icon to protect categories</span>
                      </div>
                    )}
                  </div>
                </div>
                {categoryAggregates.length === 0 ? (
                  <div className="text-secondary text-sm">
                    No budget categories set. Please finalize a plan to see category budgets.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categoryAggregates.map((category, index) => {
                      const percentage =
                        category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0;
                      const remainingForCategory = category.budgeted - category.spent;
                      const aiAllocation =
                        (aiBudget?.categories as any)?.[category.category] ?? null;
                      const aiBudgetAmount = aiAllocation?.budgeted ?? null;
                      const isLocked = budget?.lockedCategories?.includes(category.category) || false;
                      return (
                        <div
                          key={`${category.category}-${index}`}
                          className={`p-4 glass-card hover:bg-white/10 transition-all duration-300 ${
                            isLocked ? 'border-2 border-orange-400/50 bg-orange-400/5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: category.color }}
                              ></div>
                              <span className="font-semibold text-primary">{category.category}</span>
                              {isLocked && (
                                <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded-full">
                                  <Lock className="h-3 w-3" />
                                  Locked
                                </span>
                              )}
                              {isLeader && (
                                <>
                                  <button
                                    onClick={() => {
                                      setShowLockConfirm({ category: category.category, action: isLocked ? 'unlock' : 'lock' });
                                    }}
                                    disabled={lockingCategory === category.category}
                                    className="ml-2 p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={isLocked ? 'Unlock category' : 'Lock category'}
                                    aria-label={isLocked ? `Unlock ${category.category} category` : `Lock ${category.category} category`}
                                  >
                                    {lockingCategory === category.category ? (
                                      <Loader2 className="h-4 w-4 text-orange-400 animate-spin" />
                                    ) : isLocked ? (
                                      <Unlock className="h-4 w-4 text-orange-400" />
                                    ) : (
                                      <Lock className="h-4 w-4 text-secondary hover:text-orange-400" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Open modal to edit just this category
                                      const categoryAlloc = budget?.categoryAllocations?.[category.category];
                                      setEditingSingleCategory({
                                        category: category.category,
                                        budget: (categoryAlloc?.budgeted ?? category.budgeted).toString(),
                                        color: categoryAlloc?.color || category.color || colorPalette[0],
                                        description: (categoryAlloc as any)?.description || '',
                                      });
                                    }}
                                    className="ml-1 p-1.5 hover:bg-white/10 rounded transition-colors"
                                    title="Edit budget for this category"
                                    aria-label="Edit budget for this category"
                                  >
                                    <Wallet className="h-4 w-4 text-blue-400 hover:text-blue-300" />
                                  </button>
                                </>
                              )}
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
                            <span className={remainingForCategory < 0 ? 'text-red-400 font-semibold' : remainingForCategory < category.budgeted * 0.1 && category.budgeted > 0 ? 'text-orange-400' : ''}>
                              {remainingForCategory < 0 ? (
                                <>Exceeded by ₹{Math.abs(remainingForCategory).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</>
                              ) : (
                                <>₹{remainingForCategory.toLocaleString('en-IN', { minimumFractionDigits: 2 })} left</>
                              )}
                            </span>
                          </div>
                          {remainingForCategory < 0 && (
                            <div className="mt-2 text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded border border-red-400/30">
                              ⚠️ <strong>Budget Exceeded!</strong> This category is over budget by ₹{Math.abs(remainingForCategory).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.
                            </div>
                          )}
                          {remainingForCategory >= 0 && remainingForCategory < category.budgeted * 0.1 && category.budgeted > 0 && (
                            <div className="mt-2 text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded border border-orange-400/30">
                              ⚠️ <strong>Low Budget Warning:</strong> Less than 10% remaining (₹{remainingForCategory.toLocaleString('en-IN', { minimumFractionDigits: 2 })} left).
                            </div>
                          )}
                          {isLocked && (
                            <div className="mt-2 text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded">
                              🔒 This category is locked. Expenses cannot be added until unlocked by the leader.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Member Budget Share & Balances */}
              <div className="glass-card p-4 sm:p-6">
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
                      className="premium-button-secondary touch-manipulation touch-target active-scale flex items-center gap-2 text-sm"
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

              {/* Member Contribution & Personal Expense Log */}
              <div className="glass-card p-4 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-primary flex items-center">
                        <Wallet className="h-6 w-6 mr-2 text-primary" />
                        Member Contribution & Personal Expense Log
                      </h2>
                      <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/30 animate-pulse">
                        🔴 LIVE
                      </span>
                    </div>
                    <p className="text-xs text-secondary">
                      Tracks individual member contributions and personal expenses. Updates automatically when expenses are added.
                    </p>
                  </div>
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
                      className="premium-button-secondary touch-manipulation touch-target active-scale flex items-center gap-2 text-sm ml-4"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Manage Contributions
                    </button>
                  )}
                </div>

                {members.length === 0 ? (
                  <div className="text-secondary text-sm">
                    No members found. Add members to the group to track contributions.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Member Selection & Compare Controls */}
                    <div className="mb-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-primary">Individual Member Wallets</h3>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setCompareMode(!compareMode);
                              if (!compareMode) {
                                // When enabling compare mode, select first 2 members if none selected
                                if (selectedMemberIds.length === 0 && members.length >= 2) {
                                  setSelectedMemberIds([members[0].userId, members[1].userId]);
                                }
                              } else {
                                // When disabling compare mode, clear selections
                                setSelectedMemberIds([]);
                              }
                            }}
                            className={`premium-button-secondary flex items-center gap-2 text-sm ${
                              compareMode ? 'bg-orange-400/20 border-orange-400/50' : ''
                            }`}
                          >
                            <Users className="h-4 w-4" />
                            {compareMode ? 'Exit Compare' : 'Compare Members'}
                          </button>
                        </div>
                      </div>

                      {/* Member Selection Dropdown */}
                      <div className="flex items-center gap-3">
                        <select
                          value=""
                          onChange={(e) => {
                            const memberId = e.target.value;
                            if (memberId) {
                              if (compareMode) {
                                // In compare mode, allow multiple selections
                                if (!selectedMemberIds.includes(memberId)) {
                                  setSelectedMemberIds([...selectedMemberIds, memberId]);
                                }
                              } else {
                                // Single selection mode
                                setSelectedMemberIds([memberId]);
                              }
                            }
                            // Reset dropdown
                            e.target.value = '';
                          }}
                          className="flex-1 glass-input px-4 py-2 rounded-xl"
                        >
                          <option value="">
                            {compareMode 
                              ? 'Select members to compare...' 
                              : 'Select a member to view...'}
                          </option>
                          {members
                            .filter((member) => !selectedMemberIds.includes(member.userId))
                            .map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {member.userName} {member.userId === group?.leaderId ? '(Leader)' : ''}
                              </option>
                            ))}
                        </select>
                        {selectedMemberIds.length > 0 && (
                          <button
                            onClick={() => setSelectedMemberIds([])}
                            className="premium-button-secondary touch-manipulation touch-target active-scale flex items-center gap-2 text-sm"
                          >
                            <X className="h-4 w-4" />
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Compare Mode - Selected Members Chips */}
                      {compareMode && selectedMemberIds.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-secondary">Comparing:</span>
                          {selectedMemberIds.map((memberId) => {
                            const member = members.find((m) => m.userId === memberId);
                            if (!member) return null;
                            return (
                              <div
                                key={memberId}
                                className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full"
                              >
                                <span className="text-sm text-primary">{member.userName}</span>
                                <button
                                  onClick={() => {
                                    setSelectedMemberIds(selectedMemberIds.filter((id) => id !== memberId));
                                  }}
                                  className="text-secondary hover:text-primary"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                          {selectedMemberIds.length < 2 && (
                            <span className="text-xs text-secondary">Select at least 2 members to compare</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Member Wallet Cards */}
                    {selectedMemberIds.length === 0 ? (
                      <div className="glass-card p-8 text-center">
                        <Wallet className="h-12 w-12 text-secondary mx-auto mb-4 opacity-50" />
                        <p className="text-secondary">
                          Select a member from the dropdown above to view their wallet details
                        </p>
                      </div>
                    ) : compareMode && selectedMemberIds.length >= 2 ? (
                      // Compare Mode - Side by Side
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedMemberIds.map((memberId) => {
                          const member = members.find((m) => m.userId === memberId);
                          if (!member) return null;
                          return (
                            <div
                              key={member.userId}
                              className="glass-card p-4 hover:bg-white/5 transition-all duration-300 border border-white/10 rounded-xl"
                            >
                              <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-lg font-semibold text-primary">
                                    {member.userName}
                                  </h4>
                                  {member.userId === group?.leaderId && (
                                    <span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded-full">
                                      Leader
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-xs text-secondary mb-1">Contribution</p>
                                    <p className="text-xl font-bold text-blue-400">
                                      ₹{member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-secondary mb-1">Wallet Balance</p>
                                    <p className={`text-xl font-bold ${member.walletBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      ₹{member.walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-secondary mb-1">Personal Expenses</p>
                                    <p className="text-lg font-bold text-orange-400">
                                      ₹{(member.budgetShare - member.walletBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      // Single Member View
                      selectedMemberIds.map((memberId) => {
                        const member = members.find((m) => m.userId === memberId);
                        if (!member) return null;
                        return (
                          <div
                            key={member.userId}
                            className="glass-card p-4 hover:bg-white/5 transition-all duration-300 border border-white/10 rounded-xl"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <h4 className="text-lg font-semibold text-primary">
                                  {member.userName}
                                </h4>
                                {member.userId === group?.leaderId && (
                                  <span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded-full">
                                    Leader
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="text-right">
                                  <p className="text-xs text-secondary mb-1">Contribution</p>
                                  <p className="text-lg font-bold text-blue-400">
                                    ₹{member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-secondary mb-1">Wallet Balance</p>
                                  <p className={`text-lg font-bold ${member.walletBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ₹{member.walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Info Note */}
                    <div className="mt-6 p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg">
                      <p className="text-sm text-secondary mb-2">
                        <strong className="text-primary">💡 How It Works:</strong>
                      </p>
                      <ul className="text-xs text-secondary space-y-1 ml-4 list-disc">
                        <li><strong>Personal Expenses:</strong> Expenses where a member is the only one in the split. These automatically deduct from the member's wallet balance in real-time.</li>
                        <li><strong>Shared Expenses:</strong> Expenses split between multiple members do NOT affect individual wallet balances but are tracked in the overall budget.</li>
                        <li><strong>Real-Time Updates:</strong> Wallet balances update automatically whenever expenses are added, modified, or contributions change. No refresh needed!</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Expenses */}
              <div className="glass-card p-4 sm:p-6">
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

              {/* Settlement Calculator (Live Updates) */}
              <div className="glass-card p-4 sm:p-6">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
                      <Wallet className="h-6 w-6 text-green-400" />
                      Settlement Calculator
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/30 animate-pulse">
                        🔴 LIVE
                      </span>
                      <span className="text-xs text-secondary bg-blue-400/10 px-3 py-1 rounded-full border border-blue-400/30">
                        Updates in Real-Time
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-secondary">
                    Automatic "Who owes whom?" calculator. Updates instantly as expenses are added. Shows final settlement based on contributions, individual expenses, and shared expenses.
                  </p>
                </div>

                {members.length === 0 ? (
                  <div className="text-secondary text-sm text-center py-8">
                    Member balances will appear here once contributions and expenses are recorded.
                  </div>
                ) : (
                  <>
                    {/* How It Works Info Card */}
                    <div className="mb-6 p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg">
                      <h3 className="text-sm font-semibold text-primary mb-2 flex items-center gap-2">
                        <span className="text-blue-400">ℹ️</span> How Settlement Works
                      </h3>
                      <ul className="text-xs text-secondary space-y-1 ml-6 list-disc">
                        <li><strong>Contributions:</strong> Money each member brought for the trip</li>
                        <li><strong>Personal Expenses:</strong> Expenses paid by a member for themselves only (deducted from their wallet)</li>
                        <li><strong>Shared Expenses:</strong> Expenses split between multiple members</li>
                        <li><strong>Final Settlement:</strong> Net amount each member should pay or receive</li>
                      </ul>
                    </div>

                    {/* Detailed Settlement Table */}
                    <div className="overflow-x-auto mb-6">
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-wider text-secondary/70 bg-white/5">
                          <tr>
                            <th className="py-3 pr-4 font-medium text-left">Member</th>
                            <th className="py-3 px-4 font-medium text-right">Contribution</th>
                            <th className="py-3 px-4 font-medium text-right">Personal Expenses</th>
                            <th className="py-3 px-4 font-medium text-right">Shared Paid</th>
                            <th className="py-3 px-4 font-medium text-right">Shared Owed</th>
                            <th className="py-3 px-4 font-medium text-right">Final Settlement</th>
                          </tr>
                        </thead>
                        <tbody>
                          {settlementData.map((member) => (
                            <tr key={member.userId} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-primary">{member.userName}</span>
                                  {member.userId === group?.leaderId && (
                                    <Crown className="h-4 w-4 text-yellow-500" />
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-right text-secondary">
                                ₹{member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-4 px-4 text-right text-orange-400">
                                -₹{member.personalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-4 px-4 text-right text-blue-400">
                                +₹{member.sharedExpensesPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-4 px-4 text-right text-red-400">
                                -₹{member.totalOwed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td
                                className={`py-4 px-4 text-right font-bold text-lg ${
                                  member.finalSettlement >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}
                              >
                                {member.finalSettlement >= 0 ? '+' : ''}₹
                                {Math.abs(member.finalSettlement).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                                <span className="ml-2 text-xs font-normal text-secondary">
                                  {member.finalSettlement >= 0 ? '(receives)' : '(pays)'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Category Summary */}
                    {budget?.categoryAllocations && Object.keys(budget.categoryAllocations).length > 0 && (
                      <div className="mt-6 glass-card p-4 bg-white/5 border border-white/10 rounded-lg">
                        <h3 className="text-lg font-semibold text-primary mb-4">Category Spending Summary</h3>
                        <div className="space-y-2">
                          {Object.entries(budget.categoryAllocations)
                            .filter(([_, allocation]) => allocation && typeof allocation.budgeted === 'number')
                            .map(([category, allocation]) => {
                            const categorySpent = expenses
                              .filter(exp => exp.category === category)
                              .reduce((sum, exp) => sum + exp.amount, 0);
                            const budgeted = allocation.budgeted || 0;
                            const remaining = budgeted - categorySpent;
                            const percentage = budgeted > 0 ? (categorySpent / budgeted) * 100 : 0;
                            return (
                              <div key={category} className="flex items-center justify-between p-2 bg-white/5 rounded">
                                <div className="flex items-center gap-2 flex-1">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: allocation.color || colorPalette[0] }}
                                  ></div>
                                  <span className="text-sm text-primary font-medium">{category}</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs">
                                  <span className="text-secondary">
                                    ₹{categorySpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })} / ₹{budgeted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className={`font-semibold ${
                                    remaining < 0 ? 'text-red-400' : remaining < budgeted * 0.1 ? 'text-orange-400' : 'text-green-400'
                                  }`}>
                                    {remaining < 0 ? 'Exceeded' : `${percentage.toFixed(0)}%`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Summary Stats */}
                    <div className="mt-6 grid grid-cols-3 gap-4">
                      <div className="glass-card p-4 text-center">
                        <p className="text-xs text-secondary mb-1">Total Contributions</p>
                        <p className="text-lg font-bold text-primary">
                          ₹{settlementData.reduce((sum, m) => sum + m.budgetShare, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="glass-card p-4 text-center">
                        <p className="text-xs text-secondary mb-1">Total Personal Expenses</p>
                        <p className="text-lg font-bold text-orange-400">
                          ₹{settlementData.reduce((sum, m) => sum + m.personalExpenses, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="glass-card p-4 text-center">
                        <p className="text-xs text-secondary mb-1">Net Settlement</p>
                        <p className="text-lg font-bold text-green-400">
                          ₹{Math.abs(settlementData.reduce((sum, m) => sum + m.finalSettlement, 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                  </>
                )}
              </div>
            </div>

            {/* Add Expense Form */}
            <div className="space-y-6">
              <div className="glass-card p-4 sm:p-6">
                <h2 className="text-2xl font-bold text-primary mb-6 flex items-center">
                  <PlusCircle className="h-6 w-6 mr-2 text-green-400" />
                  Add Expense
                </h2>

                {!user && (
                  <div className="mb-4 text-sm text-secondary bg-white/5 px-3 py-2 rounded-lg">
                    Please log in to add expenses.
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      Category
                      {budget?.lockedCategories && budget.lockedCategories.length > 0 && (
                        <span className="ml-2 text-xs text-orange-400">
                          ({budget.lockedCategories.length} locked)
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      {budget?.categoryAllocations && Object.keys(budget.categoryAllocations).length > 0 ? (
                        <select
                          value={newExpense.category}
                          onChange={(event) => {
                            const category = event.target.value;
                            const isLocked = budget?.lockedCategories?.includes(category) || false;
                            if (isLocked && !isLeader) {
                              showToast(`Category "${category}" is locked by the leader. Please contact the leader to unlock it.`, 'error');
                              return;
                            }
                            setNewExpense((prev) => ({ ...prev, category }));
                          }}
                          className={`w-full px-4 py-3 glass-input rounded-xl ${
                            budget?.lockedCategories?.includes(newExpense.category)
                              ? 'border-2 border-orange-400/50 bg-orange-400/5'
                              : ''
                          }`}
                          disabled={!user || isSavingExpense}
                        >
                          <option value="">Select a category</option>
                          {Object.entries(budget.categoryAllocations).map(([category, allocation]) => {
                            const isCatLocked = budget?.lockedCategories?.includes(category) || false;
                            const categorySpent = expenses
                              .filter(exp => exp.category === category)
                              .reduce((sum, exp) => sum + exp.amount, 0);
                            const categoryRemaining = allocation.budgeted - categorySpent;
                            const isExceeded = categoryRemaining < 0;
                            const isLow = categoryRemaining >= 0 && categoryRemaining < allocation.budgeted * 0.1;
                            
                            return (
                              <option 
                                key={category} 
                                value={category}
                                disabled={isCatLocked && !isLeader}
                              >
                                {category}
                                {isCatLocked ? ' 🔒 (Locked)' : ''}
                                {isExceeded ? ' ⚠️ (Exceeded)' : isLow ? ' ⚠️ (Low)' : ''}
                                {` - ₹${categoryRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })} remaining`}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                    <input
                      type="text"
                      value={newExpense.category}
                          onChange={(event) => {
                            const category = event.target.value.trim();
                            setNewExpense((prev) => ({ ...prev, category }));
                          }}
                          placeholder="Enter category (create categories first)"
                      className="w-full px-4 py-3 glass-input rounded-xl"
                      disabled={!user || isSavingExpense}
                    />
                      )}
                      {budget?.lockedCategories?.includes(newExpense.category) && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-orange-400 pointer-events-none">
                          <Lock className="h-4 w-4" />
                          <span className="text-xs">Locked</span>
                        </div>
                      )}
                    </div>
                    {budget?.categoryAllocations && budget.categoryAllocations[newExpense.category] && (() => {
                      const categoryAllocation = budget.categoryAllocations[newExpense.category];
                      const categorySpent = expenses
                        .filter(exp => exp.category === newExpense.category)
                        .reduce((sum, exp) => sum + exp.amount, 0);
                      const categoryRemaining = categoryAllocation.budgeted - categorySpent;
                      const amount = parseFloat(newExpense.amount) || 0;
                      const willExceed = categoryRemaining < amount;
                      const isExceeded = categoryRemaining < 0;
                      const isLow = categoryRemaining >= 0 && categoryRemaining < categoryAllocation.budgeted * 0.1;
                      
                      return (
                        <div className={`mt-2 p-2 rounded-lg text-xs ${
                          isExceeded ? 'bg-red-400/10 border border-red-400/30 text-red-400' :
                          willExceed ? 'bg-orange-400/10 border border-orange-400/30 text-orange-400' :
                          isLow ? 'bg-yellow-400/10 border border-yellow-400/30 text-yellow-400' :
                          'bg-blue-400/10 border border-blue-400/30 text-blue-400'
                        }`}>
                          <p>
                            <strong>Category Budget:</strong> ₹{categoryAllocation.budgeted.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            {' | '}
                            <strong>Spent:</strong> ₹{categorySpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            {' | '}
                            <strong>Remaining:</strong> ₹{categoryRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                          {amount > 0 && (
                            <p className="mt-1">
                              {willExceed ? (
                                <>⚠️ Adding this expense will {isExceeded ? 'increase overage by' : 'exceed budget by'} ₹{Math.abs(categoryRemaining - amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</>
                              ) : (
                                <>After this expense: ₹{(categoryRemaining - amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} remaining</>
                              )}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {budget?.lockedCategories && budget.lockedCategories.length > 0 && (
                      <div className="mt-2 p-2 bg-orange-400/10 border border-orange-400/30 rounded-lg">
                        <p className="text-xs text-secondary">
                          <strong className="text-orange-400">🔒 Locked Categories:</strong>{' '}
                          {budget.lockedCategories.join(', ')}
                          {!isLeader && ' (Contact leader to unlock)'}
                        </p>
                      </div>
                    )}
                    {(!budget?.categoryAllocations || Object.keys(budget.categoryAllocations).length === 0) && isLeader && (
                      <div className="mt-2 p-2 bg-blue-400/10 border border-blue-400/30 rounded-lg">
                        <p className="text-xs text-secondary">
                          <strong className="text-blue-400">ℹ️ No categories set.</strong>{' '}
                          Click "Manage Categories" to create budget categories.
                        </p>
                      </div>
                    )}
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
                    disabled={
                      !user || 
                      isSavingExpense || 
                      uploadingReceipt ||
                      (budget?.lockedCategories?.includes(newExpense.category) && !isLeader)
                    }
                  >
                    {isSavingExpense ? 'Saving...' : uploadingReceipt ? 'Uploading receipt...' : 
                     budget?.lockedCategories?.includes(newExpense.category) && !isLeader
                       ? 'Category Locked' : 'Add Expense'}
                  </button>
                  {budget?.lockedCategories?.includes(newExpense.category) && !isLeader && (
                    <p className="text-xs text-orange-400 text-center mt-2">
                      This category is locked. Only the leader can add expenses to locked categories.
                    </p>
                  )}
                </div>
              </div>

              {/* Spending Distribution by Category */}
              <div className="glass-card p-4 sm:p-6">
                <h3 className="text-lg font-bold text-primary mb-4">Spending Distribution</h3>

                <div className="relative h-48 glass-card w-full overflow-hidden">
                  <div className="h-full overflow-y-auto px-4 py-2">
                    {categoryAggregates.length === 0 ? (
                      <div className="text-secondary text-sm text-center px-4 py-8">
                        Budget categories will appear here once a plan is finalized.
                      </div>
                    ) : (
                      <div className="w-full space-y-3">
                        {categoryAggregates.map((category, index) => (
                          <div key={`${category.category}-${index}`} className="mb-2">
                            <div className="flex items-center justify-between text-sm text-secondary mb-1">
                              <span className="truncate flex-1 mr-2">{category.category}</span>
                              <span className="flex-shrink-0">
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
                  )}
                  </div>
                </div>
              </div>

              {/* Export Options */}
              <div className="glass-card p-4 sm:p-6">
                <h3 className="text-lg font-bold text-primary mb-4">Export & Share</h3>
                <div className="space-y-3">
                  <button
                    onClick={handleExportPDF}
                    disabled={isExportingPDF || !group || !budget}
                    className="w-full flex items-center justify-center py-3 px-4 premium-button-secondary rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExportingPDF ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 text-secondary animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5 mr-2 text-secondary" />
                        Export PDF Report
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleShareWithGroup}
                    disabled={isSharing || !group || !budget || !groupId}
                    className="w-full flex items-center justify-center py-3 px-4 premium-button-secondary rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSharing ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 text-secondary animate-spin" />
                        Sharing...
                      </>
                    ) : (
                      <>
                        <Share className="h-5 w-5 mr-2 text-secondary" />
                        Share with Group
                      </>
                    )}
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
                    className="premium-button-primary touch-manipulation touch-target active-scale px-3 py-1 rounded-lg text-sm font-semibold disabled:opacity-50"
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

              {/* Budget Summary */}
              {(() => {
                const totalAssigned = Object.values(editingBudgetShares).reduce((sum, share) => {
                  return sum + (parseFloat(share as string) || 0);
                }, 0);
                const remainingBudget = totalBudget - totalAssigned;
                const exceedsBudget = totalAssigned > totalBudget;

                return (
                  <div className={`mb-4 p-4 rounded-lg border ${
                    exceedsBudget 
                      ? 'bg-red-400/10 border-red-400/30' 
                      : 'bg-blue-400/10 border-blue-400/30'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-primary">Total Budget:</span>
                      <span className="text-sm font-bold text-primary">
                        ₹{totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-primary">Total Assigned:</span>
                      <span className={`text-sm font-bold ${exceedsBudget ? 'text-red-400' : 'text-blue-400'}`}>
                        ₹{totalAssigned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-primary">Remaining:</span>
                      <span className={`text-sm font-bold ${remainingBudget < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        ₹{Math.abs(remainingBudget).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {exceedsBudget && (
                      <div className="mt-3 p-2 bg-red-400/20 border border-red-400/50 rounded text-sm text-red-400">
                        ⚠️ Warning: Total assigned contributions exceed the total budget by ₹
                        {(totalAssigned - totalBudget).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-4 mb-6">
                {memberBudgetShares.map((member) => {
                  const currentValue = parseFloat(editingBudgetShares[member.userId] || '0');
                  const otherMembersTotal = Object.entries(editingBudgetShares)
                    .filter(([userId]) => userId !== member.userId)
                    .reduce((sum, [, share]) => sum + (parseFloat(share as string) || 0), 0);
                  const maxAllowed = Math.max(0, totalBudget - otherMembersTotal);

                  return (
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
                              const newValue = e.target.value;
                            setEditingBudgetShares({
                              ...editingBudgetShares,
                                [member.userId]: newValue,
                            });
                          }}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                            max={maxAllowed}
                            className={`w-full pl-8 pr-4 py-2 glass-input rounded-lg ${
                              currentValue > maxAllowed ? 'border-red-400 border-2' : ''
                            }`}
                        />
                      </div>
                        {currentValue > maxAllowed && (
                          <p className="text-xs text-red-400 mt-1">
                            Maximum allowed: ₹{maxAllowed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                    </div>
                    <div className="text-sm text-secondary pt-6">
                      Current: ₹{member.budgetShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowBudgetShareModal(false)}
                  className="premium-button-secondary touch-manipulation touch-target active-scale"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!groupId) return;

                    // Calculate total assigned
                    const totalAssigned = Object.values(editingBudgetShares).reduce((sum, share) => {
                      return sum + (parseFloat(share as string) || 0);
                    }, 0);

                    // Check if exceeds budget
                    if (totalAssigned > totalBudget) {
                      const excess = totalAssigned - totalBudget;
                      if (!confirm(
                        `Warning: Total assigned contributions (₹${totalAssigned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) exceed the total budget (₹${totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) by ₹${excess.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.\n\nDo you still want to proceed?`
                      )) {
                        return;
                      }
                    }

                    setSavingBudgetShares(true);
                    
                    // Optimistic update: immediately update members state
                      const shares = Object.entries(editingBudgetShares).map(([userId, share]) => ({
                        userId,
                        budgetShare: parseFloat(share) || 0,
                      }));

                    const previousMembers = members;
                    setMembers(prev => prev.map(member => {
                      const shareUpdate = shares.find(s => s.userId === member.userId);
                      if (shareUpdate) {
                        return {
                          ...member,
                          budgetShare: shareUpdate.budgetShare,
                        };
                      }
                      return member;
                    }));
                    
                    try {
                      await updateMemberBudgetShares(groupId, shares);
                      setShowBudgetShareModal(false);
                      // Refresh members data to ensure consistency
                      const updatedMembers = await getGroupMembersSummary(groupId);
                      setMembers(updatedMembers);
                    } catch (error) {
                      console.error('Error updating budget shares:', error);
                      // Revert optimistic update on error
                      setMembers(previousMembers);
                      alert('Failed to update budget shares. Please try again.');
                    } finally {
                      setSavingBudgetShares(false);
                    }
                  }}
                  disabled={savingBudgetShares}
                  className="premium-button-primary touch-manipulation touch-target active-scale disabled:opacity-50"
                >
                  {savingBudgetShares ? 'Saving...' : 'Save Budget Shares'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lock/Unlock Confirmation Dialog */}
        {showLockConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="glass-card p-6 max-w-md w-full mx-4 rounded-2xl border border-white/20">
              <div className="flex items-center gap-3 mb-4">
                {showLockConfirm.action === 'lock' ? (
                  <Lock className="h-6 w-6 text-orange-400" />
                ) : (
                  <Unlock className="h-6 w-6 text-green-400" />
                )}
                <h3 className="text-xl font-bold text-primary">
                  {showLockConfirm.action === 'lock' ? 'Lock Category' : 'Unlock Category'}
                </h3>
              </div>
              <p className="text-secondary mb-6">
                Are you sure you want to {showLockConfirm.action} the category{' '}
                <strong className="text-primary">"{showLockConfirm.category}"</strong>?
                {showLockConfirm.action === 'lock' && (
                  <span className="block mt-2 text-sm text-orange-400">
                    This will prevent members from adding expenses to this category until you unlock it.
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLockConfirm(null)}
                  className="flex-1 premium-button-secondary"
                  disabled={lockingCategory === showLockConfirm.category}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleLockToggle(showLockConfirm.category, showLockConfirm.action)}
                  disabled={lockingCategory === showLockConfirm.category}
                  className={`flex-1 premium-button-primary disabled:opacity-50 ${
                    showLockConfirm.action === 'lock' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {lockingCategory === showLockConfirm.category ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {showLockConfirm.action === 'lock' ? 'Locking...' : 'Unlocking...'}
                    </span>
                  ) : (
                    showLockConfirm.action === 'lock' ? 'Lock Category' : 'Unlock Category'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category Management Modal */}
        {showCategoryManager && isLeader && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="glass-card p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-primary">Manage Category Budgets</h3>
                <button
                  onClick={() => setShowCategoryManager(false)}
                  className="text-secondary hover:text-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-4 p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg">
                <p className="text-sm text-secondary">
                  <strong className="text-primary">Total Budget:</strong> ₹{totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-secondary mt-1">
                  The sum of all category budgets must equal the total budget.
                </p>
              </div>

              {editingCategories.length === 0 && (
                <div className="mb-6 p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg text-center">
                  <p className="text-sm text-secondary">
                    No categories yet. Click "Add New Category" below to create your first category.
                  </p>
                </div>
              )}
              <div className="space-y-4 mb-6">
                {editingCategories.map((cat, index) => {
                  const categoryTotal = editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0);
                  const remaining = totalBudget - (categoryTotal - (parseFloat(cat.budget) || 0));
                  return (
                    <div key={index} className="glass-card p-4 border border-white/10">
                      <div className="grid grid-cols-12 gap-3 items-start">
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-secondary mb-1">Category Name</label>
                          <input
                            type="text"
                            value={cat.name}
                            onChange={(e) => {
                              const updated = [...editingCategories];
                              updated[index].name = e.target.value;
                              setEditingCategories(updated);
                            }}
                            className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                            placeholder="e.g., Food, Travel"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-secondary mb-1">Budget (₹)</label>
                          <input
                            type="number"
                            value={cat.budget}
                            onChange={(e) => {
                              const updated = [...editingCategories];
                              updated[index].budget = e.target.value;
                              setEditingCategories(updated);
                            }}
                            step="0.01"
                            min="0"
                            max={remaining + (parseFloat(cat.budget) || 0)}
                            className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-secondary mb-1">Color</label>
                          <div className="flex gap-1">
                            {colorPalette.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => {
                                  const updated = [...editingCategories];
                                  updated[index].color = color;
                                  setEditingCategories(updated);
                                }}
                                className={`w-8 h-8 rounded-full border-2 ${
                                  cat.color === color ? 'border-white' : 'border-transparent'
                                }`}
                                style={{ backgroundColor: color }}
                                title={color}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-secondary mb-1">Description (Optional)</label>
                          <input
                            type="text"
                            value={cat.description || ''}
                            onChange={(e) => {
                              const updated = [...editingCategories];
                              updated[index].description = e.target.value;
                              setEditingCategories(updated);
                            }}
                            className="w-full px-3 py-2 glass-input rounded-lg text-sm"
                            placeholder="Brief description"
                          />
                        </div>
                        <div className="col-span-1 flex items-end">
                          <button
                            onClick={() => {
                              setEditingCategories(editingCategories.filter((_, i) => i !== index));
                            }}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Remove category"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
      </div>
    </div>
  );
                })}
              </div>

              <div className="mb-4">
                <button
                  onClick={() => {
                    const newCategory = {
                      name: '',
                      budget: '0',
                      color: colorPalette[editingCategories.length % colorPalette.length],
                      description: '',
                    };
                    setEditingCategories([...editingCategories, newCategory]);
                  }}
                  className="text-sm premium-button-secondary flex items-center gap-2"
                  type="button"
                >
                  <PlusCircle className="h-4 w-4" />
                  Add New Category
                </button>
                {editingCategories.length === 0 && (
                  <p className="text-xs text-secondary mt-2">
                    Click "Add New Category" to create your first category.
                  </p>
                )}
              </div>

              <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-secondary">Total Allocated:</span>
                  <span className={`text-lg font-bold ${
                    editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) === totalBudget
                      ? 'text-green-400'
                      : editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) > totalBudget
                      ? 'text-red-400'
                      : 'text-orange-400'
                  }`}>
                    ₹{editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-medium text-secondary">Remaining:</span>
                  <span className={`text-lg font-bold ${
                    totalBudget - editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) === 0
                      ? 'text-green-400'
                      : 'text-secondary'
                  }`}>
                    ₹{(totalBudget - editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) !== totalBudget && (
                  <div className={`mt-3 p-2 rounded text-xs ${
                    editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) > totalBudget
                      ? 'bg-red-400/10 text-red-400 border border-red-400/30'
                      : 'bg-orange-400/10 text-orange-400 border border-orange-400/30'
                  }`}>
                    {editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) > totalBudget
                      ? `⚠️ Total exceeds budget by ₹${(editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0) - totalBudget).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                      : `⚠️ Total is ₹${(totalBudget - editingCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} less than total budget`}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCategoryManager(false)}
                  className="flex-1 premium-button-secondary"
                  disabled={savingCategories}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!groupId || !user) {
                      showToast('Missing group or user information. Please refresh the page.', 'error');
                      return;
                    }

                    // Filter out empty categories (categories with no name)
                    const validCategories = editingCategories.filter(c => c.name.trim());
                    if (validCategories.length === 0) {
                      showToast('Please add at least one category with a name.', 'error');
                      return;
                    }

                    // Check for duplicate names
                    const names = validCategories.map(c => c.name.trim().toLowerCase());
                    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
                    if (duplicates.length > 0) {
                      showToast('Category names must be unique.', 'error');
                      return;
                    }

                    // Recalculate total with only valid categories
                    const validCategoryTotal = validCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0);
                    const validDifference = Math.abs(validCategoryTotal - totalBudget);
                    
                    // Allow small floating point differences (less than 0.01)
                    if (validDifference > 0.01) {
                      showToast(`Category budgets (₹${validCategoryTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) must equal the total budget (₹${totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}). Please adjust the amounts.`, 'error');
                      return;
                    }

                    setSavingCategories(true);
                    
                    // Optimistic update: immediately update budget state
                    // Use only valid categories (with names)
                    const categoryAllocations: Record<string, { budgeted: number; color: string; description?: string }> = {};
                    validCategories.forEach(cat => {
                      const trimmedName = cat.name.trim();
                      if (trimmedName) {
                        categoryAllocations[trimmedName] = {
                          budgeted: parseFloat(cat.budget) || 0,
                          color: cat.color || colorPalette[0],
                          description: cat.description?.trim() || undefined,
                        };
                      }
                    });
                    
                    const previousBudget = budget;
                    if (budget) {
                      setBudget({
                        ...budget,
                        categoryAllocations,
                      });
                    }
                    
                    try {
                      const savedBudget = await upsertGroupBudget({
                        groupId,
                        totalBudget,
                        createdBy: user.uid,
                        categoryAllocations,
                        lockedCategories: budget?.lockedCategories || [],
                      });

                      // Update budget state with saved data from database
                      setBudget(savedBudget);
                      
                      showToast('Category budgets saved successfully!', 'success');
                      setShowCategoryManager(false);
                      // Budget will also update via subscription for consistency across all users
                    } catch (error: any) {
                      console.error('Error saving category budgets:', error);
                      // Revert optimistic update on error
                      if (previousBudget) {
                        setBudget(previousBudget);
                      }
                      const errorMessage = error?.message || error?.toString() || 'Failed to save category budgets. Please try again.';
                      showToast(errorMessage, 'error');
                    } finally {
                      setSavingCategories(false);
                    }
                  }}
                  disabled={
                    savingCategories || 
                    editingCategories.length === 0 ||
                    (() => {
                      const validCategories = editingCategories.filter(c => c.name.trim());
                      if (validCategories.length === 0) return true;
                      const validTotal = validCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0);
                      return Math.abs(validTotal - totalBudget) > 0.01;
                    })()
                  }
                  className="flex-1 premium-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  title={
                    editingCategories.length === 0
                      ? 'Add at least one category'
                      : (() => {
                          const validCategories = editingCategories.filter(c => c.name.trim());
                          if (validCategories.length === 0) return 'Fill in category names';
                          const validTotal = validCategories.reduce((sum, c) => sum + (parseFloat(c.budget) || 0), 0);
                          const diff = Math.abs(validTotal - totalBudget);
                          return diff > 0.01
                            ? `Category total (₹${validTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) must equal total budget (₹${totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`
                            : 'Save categories';
                        })()
                  }
                >
                  {savingCategories ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save Categories'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Sync Confirmation */}
        {showAiSyncConfirm && aiBudget && aiBudget.categories && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="glass-card p-6 max-w-md w-full mx-4 rounded-2xl border border-white/20">
              <div className="flex items-center gap-3 mb-4">
                <Brain className="h-6 w-6 text-blue-400" />
                <h3 className="text-xl font-bold text-primary">Sync from AI Plan</h3>
              </div>
              <p className="text-secondary mb-4">
                This will replace your current category budgets with the AI-suggested allocations from your finalized plan.
              </p>
              <div className="mb-4 p-3 bg-blue-400/10 border border-blue-400/30 rounded-lg">
                <p className="text-xs text-secondary mb-2">AI Suggested Categories:</p>
                <div className="space-y-1">
                  {Object.entries(aiBudget.categories).slice(0, 5).map(([cat, alloc]) => (
                    <div key={cat} className="flex items-center justify-between text-sm">
                      <span className="text-primary">{cat}</span>
                      <span className="text-blue-300">₹{(alloc.budgeted || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {Object.keys(aiBudget.categories).length > 5 && (
                    <p className="text-xs text-secondary mt-1">+ {Object.keys(aiBudget.categories).length - 5} more categories</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAiSyncConfirm(false)}
                  className="flex-1 premium-button-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!groupId || !user || !aiBudget || !budget) return;
                    setSavingCategories(true);
                    
                    // Optimistic update: immediately update budget state
                    const categoryAllocations: Record<string, { budgeted: number; color: string }> = {};
                    Object.entries(aiBudget.categories).forEach(([cat, alloc], index) => {
                      categoryAllocations[cat] = {
                        budgeted: alloc.budgeted || 0,
                        color: alloc.color || colorPalette[index % colorPalette.length],
                      };
                    });
                    
                    const previousBudget = budget;
                    setBudget({
                      ...budget,
                      categoryAllocations,
                      totalBudget: aiBudget.total,
                    });
                    
                    try {
                      await upsertGroupBudget({
                        groupId,
                        totalBudget: aiBudget.total,
                        createdBy: user.uid,
                        categoryAllocations,
                        lockedCategories: budget.lockedCategories || [],
                      });

                      showToast('Category budgets synced from AI plan successfully!', 'success');
                      setShowAiSyncConfirm(false);
                      // Budget will also update via subscription for consistency
                    } catch (error: any) {
                      console.error('Error syncing AI categories:', error);
                      // Revert optimistic update on error
                      if (previousBudget) {
                        setBudget(previousBudget);
                      }
                      showToast(error.message || 'Failed to sync categories.', 'error');
                    } finally {
                      setSavingCategories(false);
                    }
                  }}
                  className="flex-1 premium-button-primary"
                >
                  Sync Categories
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single Category Edit Modal */}
        {editingSingleCategory && isLeader && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="glass-card p-6 max-w-md w-full mx-4 rounded-2xl border border-white/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-primary">Edit Category Budget</h3>
                <button
                  onClick={() => setEditingSingleCategory(null)}
                  className="text-secondary hover:text-primary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Category Name</label>
                  <input
                    type="text"
                    value={editingSingleCategory.category}
                    onChange={(e) => setEditingSingleCategory({ ...editingSingleCategory, category: e.target.value })}
                    className="w-full px-4 py-2 glass-input rounded-lg"
                    placeholder="Category name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Budget (₹)</label>
                  <input
                    type="number"
                    value={editingSingleCategory.budget}
                    onChange={(e) => setEditingSingleCategory({ ...editingSingleCategory, budget: e.target.value })}
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-2 glass-input rounded-lg"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-secondary mt-1">
                    Current total: ₹{totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {budget?.categoryAllocations && (() => {
                      const currentTotal = Object.values(budget.categoryAllocations).reduce((sum, alloc) => sum + (alloc?.budgeted || 0), 0);
                      const currentCategoryBudget = budget.categoryAllocations[editingSingleCategory.category]?.budgeted || 0;
                      const newTotal = currentTotal - currentCategoryBudget + (parseFloat(editingSingleCategory.budget) || 0);
                      return (
                        <span className={newTotal === totalBudget ? ' text-green-400' : ' text-orange-400'}>
                          {' | '}New total: ₹{newTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          {newTotal !== totalBudget && ` (${newTotal > totalBudget ? '+' : ''}₹${(newTotal - totalBudget).toLocaleString('en-IN', { minimumFractionDigits: 2 })})`}
                        </span>
                      );
                    })()}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {colorPalette.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditingSingleCategory({ ...editingSingleCategory, color })}
                        className={`w-10 h-10 rounded-full border-2 ${
                          editingSingleCategory.color === color ? 'border-white' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">Description (Optional)</label>
                  <input
                    type="text"
                    value={editingSingleCategory.description || ''}
                    onChange={(e) => setEditingSingleCategory({ ...editingSingleCategory, description: e.target.value })}
                    className="w-full px-4 py-2 glass-input rounded-lg"
                    placeholder="Brief description"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingSingleCategory(null)}
                  className="flex-1 premium-button-secondary"
                  disabled={savingCategories}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!groupId || !user || !budget || !editingSingleCategory) return;

                    const categoryName = editingSingleCategory.category.trim();
                    if (!categoryName) {
                      showToast('Please provide a category name.', 'error');
                      return;
                    }

                    const newBudget = parseFloat(editingSingleCategory.budget) || 0;
                    if (newBudget < 0) {
                      showToast('Budget cannot be negative.', 'error');
                      return;
                    }

                    // Calculate new total
                    const currentAllocations = budget.categoryAllocations || {};
                    const currentTotal = Object.values(currentAllocations).reduce((sum, alloc) => sum + (alloc?.budgeted || 0), 0);
                    const oldCategoryBudget = currentAllocations[editingSingleCategory.category]?.budgeted || 0;
                    const newTotal = currentTotal - oldCategoryBudget + newBudget;

                    // Check if new total matches total budget
                    const difference = Math.abs(newTotal - totalBudget);
                    if (difference > 0.01) {
                      showToast(
                        `Updating this category would make total ₹${newTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}, but total budget is ₹${totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. Please adjust other categories first.`,
                        'error'
                      );
                      return;
                    }

                    setSavingCategories(true);
                    const previousBudget = budget;

                    // Update category allocations
                    const updatedAllocations: Record<string, { budgeted: number; color?: string; description?: string }> = { ...currentAllocations };
                    if (editingSingleCategory.category !== categoryName) {
                      // Category name changed - remove old, add new
                      delete updatedAllocations[editingSingleCategory.category];
                    }
                    updatedAllocations[categoryName] = {
                      budgeted: newBudget,
                      color: editingSingleCategory.color || colorPalette[0],
                      description: editingSingleCategory.description?.trim() || undefined,
                    };

                    // Optimistic update
                    setBudget({
                      ...budget,
                      categoryAllocations: updatedAllocations,
                    });

                    try {
                      const savedBudget = await upsertGroupBudget({
                        groupId,
                        totalBudget,
                        createdBy: user.uid,
                        categoryAllocations: updatedAllocations,
                        lockedCategories: budget.lockedCategories || [],
                      });

                      setBudget(savedBudget);
                      showToast('Category budget updated successfully!', 'success');
                      setEditingSingleCategory(null);
                    } catch (error: any) {
                      console.error('Error updating category budget:', error);
                      if (previousBudget) {
                        setBudget(previousBudget);
                      }
                      showToast(error?.message || 'Failed to update category budget. Please try again.', 'error');
                    } finally {
                      setSavingCategories(false);
                    }
                  }}
                  disabled={savingCategories}
                  className="flex-1 premium-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingCategories ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notifications */}
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`glass-card p-4 flex items-center gap-3 min-w-[300px] max-w-md shadow-lg ${
                toast.type === 'success' 
                  ? 'border-l-4 border-green-500 bg-green-500/10' 
                  : 'border-l-4 border-red-500 bg-red-500/10'
              }`}
            >
              <div className="flex-shrink-0">
                {toast.type === 'success' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-primary text-sm font-medium">{toast.message}</p>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="flex-shrink-0 text-secondary hover:text-primary transition-colors"
                aria-label="Close notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BudgetPage;

