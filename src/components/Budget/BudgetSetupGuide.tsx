import React from 'react';
import { CheckCircle2, Circle, DollarSign, FolderPlus, Users, ChevronRight, Sparkles } from 'lucide-react';

interface SetupStep {
  id: string;
  title: string;
  description: string;
  isComplete: boolean;
  icon: React.ReactNode;
  action?: () => void;
  actionLabel?: string;
}

interface BudgetSetupGuideProps {
  totalBudget: number;
  hasCategories: boolean;
  hasMemberShares: boolean;
  memberCount: number;
  isLeader: boolean;
  onSetBudget: () => void;
  onManageCategories: () => void;
  onAssignShares: () => void;
  onApplyTemplate: () => void;
}

// Common category templates
export const CATEGORY_TEMPLATES = {
  standard: [
    { name: 'Accommodation', percentage: 35, color: '#3B82F6' },
    { name: 'Food & Dining', percentage: 25, color: '#10B981' },
    { name: 'Transport', percentage: 20, color: '#F59E0B' },
    { name: 'Activities', percentage: 10, color: '#8B5CF6' },
    { name: 'Shopping', percentage: 5, color: '#06B6D4' },
    { name: 'Emergency', percentage: 5, color: '#EF4444' },
  ],
  budget: [
    { name: 'Accommodation', percentage: 30, color: '#3B82F6' },
    { name: 'Food & Dining', percentage: 30, color: '#10B981' },
    { name: 'Transport', percentage: 25, color: '#F59E0B' },
    { name: 'Activities', percentage: 10, color: '#8B5CF6' },
    { name: 'Misc', percentage: 5, color: '#EF4444' },
  ],
  luxury: [
    { name: 'Luxury Stay', percentage: 40, color: '#3B82F6' },
    { name: 'Fine Dining', percentage: 20, color: '#10B981' },
    { name: 'Premium Transport', percentage: 15, color: '#F59E0B' },
    { name: 'Experiences', percentage: 15, color: '#8B5CF6' },
    { name: 'Shopping', percentage: 7, color: '#06B6D4' },
    { name: 'Emergency', percentage: 3, color: '#EF4444' },
  ],
  adventure: [
    { name: 'Activities & Tours', percentage: 35, color: '#8B5CF6' },
    { name: 'Accommodation', percentage: 25, color: '#3B82F6' },
    { name: 'Food', percentage: 20, color: '#10B981' },
    { name: 'Transport', percentage: 15, color: '#F59E0B' },
    { name: 'Emergency', percentage: 5, color: '#EF4444' },
  ],
};

const BudgetSetupGuide: React.FC<BudgetSetupGuideProps> = ({
  totalBudget,
  hasCategories,
  hasMemberShares,
  memberCount,
  isLeader,
  onSetBudget,
  onManageCategories,
  onAssignShares,
  onApplyTemplate,
}) => {
  // Only show for leaders
  if (!isLeader) return null;

  const steps: SetupStep[] = [
    {
      id: 'budget',
      title: 'Set Total Budget',
      description: totalBudget > 0 
        ? `Budget set: ₹${totalBudget.toLocaleString('en-IN')}`
        : 'Define the maximum budget for your trip',
      isComplete: totalBudget > 0,
      icon: <DollarSign className="h-5 w-5" />,
      action: onSetBudget,
      actionLabel: totalBudget > 0 ? 'Edit Budget' : 'Set Budget',
    },
    {
      id: 'categories',
      title: 'Allocate Categories',
      description: hasCategories 
        ? 'Category budgets configured'
        : 'Split budget into categories (Food, Travel, Stay...)',
      isComplete: hasCategories,
      icon: <FolderPlus className="h-5 w-5" />,
      action: onManageCategories,
      actionLabel: hasCategories ? 'Edit Categories' : 'Set Categories',
    },
    {
      id: 'members',
      title: 'Assign Member Shares',
      description: hasMemberShares 
        ? `${memberCount} members have assigned shares`
        : 'Define how much each member contributes',
      isComplete: hasMemberShares,
      icon: <Users className="h-5 w-5" />,
      action: onAssignShares,
      actionLabel: hasMemberShares ? 'Edit Shares' : 'Assign Shares',
    },
  ];

  const completedSteps = steps.filter(s => s.isComplete).length;
  const allComplete = completedSteps === steps.length;
  const progressPercentage = (completedSteps / steps.length) * 100;

  // Don't show if all steps are complete
  if (allComplete) {
    return null;
  }

  return (
    <div className="glass-card p-6 mb-6 border-2 border-blue-400/30 bg-gradient-to-br from-blue-400/10 to-purple-400/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-400/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-primary">Budget Setup Guide</h3>
            <p className="text-xs text-secondary">
              {completedSteps === 0 
                ? 'Get started by setting up your group budget'
                : `${completedSteps} of ${steps.length} steps complete`}
            </p>
          </div>
        </div>
        
        {/* Progress indicator */}
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-400">{Math.round(progressPercentage)}%</div>
          <div className="text-xs text-secondary">Complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/10 rounded-full h-2 mb-6">
        <div
          className="bg-gradient-to-r from-blue-400 to-purple-400 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => {
          const isCurrentStep = !step.isComplete && steps.slice(0, index).every(s => s.isComplete);
          
          return (
            <div
              key={step.id}
              className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                step.isComplete 
                  ? 'bg-green-400/10 border border-green-400/30' 
                  : isCurrentStep
                    ? 'bg-blue-400/10 border border-blue-400/30'
                    : 'bg-white/5 border border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  step.isComplete 
                    ? 'bg-green-400/20 text-green-400'
                    : isCurrentStep
                      ? 'bg-blue-400/20 text-blue-400'
                      : 'bg-white/10 text-secondary'
                }`}>
                  {step.isComplete ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-bold">{index + 1}</span>
                  )}
                </div>
                <div>
                  <div className={`font-medium ${step.isComplete ? 'text-green-400' : 'text-primary'}`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-secondary">{step.description}</div>
                </div>
              </div>
              
              {step.action && (
                <button
                  onClick={step.action}
                  className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-all ${
                    isCurrentStep
                      ? 'bg-blue-400 text-white hover:bg-blue-500'
                      : 'bg-white/10 text-secondary hover:bg-white/20 hover:text-primary'
                  }`}
                >
                  {step.actionLabel}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick template suggestion - only show if no categories */}
      {!hasCategories && totalBudget > 0 && (
        <div className="mt-4 p-3 bg-purple-400/10 border border-purple-400/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-primary">
                Quick Start: Use a category template
              </span>
            </div>
            <button
              onClick={onApplyTemplate}
              className="text-xs bg-purple-400/20 text-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-400/30 transition-colors"
            >
              Choose Template
            </button>
          </div>
        </div>
      )}

      {/* Tip */}
      <div className="mt-4 text-xs text-secondary bg-white/5 px-3 py-2 rounded-lg">
        💡 <strong>Tip:</strong> Complete these steps in order for the best experience. 
        You can always edit later, but setting up categories before inviting members helps with planning.
      </div>
    </div>
  );
};

export default BudgetSetupGuide;
