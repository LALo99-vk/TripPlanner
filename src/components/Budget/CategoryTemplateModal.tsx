import React, { useState } from 'react';
import { X, Sparkles, Check } from 'lucide-react';
import { CATEGORY_TEMPLATES } from './BudgetSetupGuide';

interface CategoryTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalBudget: number;
  onApplyTemplate: (categories: Array<{ name: string; budget: string; color: string }>) => void;
}

const CategoryTemplateModal: React.FC<CategoryTemplateModalProps> = ({
  isOpen,
  onClose,
  totalBudget,
  onApplyTemplate,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof CATEGORY_TEMPLATES | null>(null);

  if (!isOpen) return null;

  const templates = [
    {
      id: 'standard' as const,
      name: 'Standard Trip',
      description: 'Balanced allocation for most trips',
      emoji: '🌴',
    },
    {
      id: 'budget' as const,
      name: 'Budget Travel',
      description: 'Focus on essentials, maximize experiences',
      emoji: '💰',
    },
    {
      id: 'luxury' as const,
      name: 'Luxury Experience',
      description: 'Premium stays and fine dining',
      emoji: '✨',
    },
    {
      id: 'adventure' as const,
      name: 'Adventure Trip',
      description: 'More budget for activities and tours',
      emoji: '🏔️',
    },
  ];

  const handleApply = () => {
    if (!selectedTemplate) return;

    const templateCategories = CATEGORY_TEMPLATES[selectedTemplate];
    const categories = templateCategories.map(cat => ({
      name: cat.name,
      budget: ((cat.percentage / 100) * totalBudget).toFixed(2),
      color: cat.color,
    }));

    onApplyTemplate(categories);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="glass-card p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-400/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary">Choose Category Template</h3>
              <p className="text-sm text-secondary">
                Quick start with pre-defined category allocations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 p-3 bg-blue-400/10 border border-blue-400/30 rounded-lg">
          <p className="text-sm text-secondary">
            <strong className="text-primary">Total Budget:</strong> ₹{totalBudget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-secondary mt-1">
            Templates will automatically calculate amounts based on your total budget.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {templates.map((template) => {
            const isSelected = selectedTemplate === template.id;
            const templateCategories = CATEGORY_TEMPLATES[template.id];
            
            return (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template.id)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  isSelected
                    ? 'border-purple-400 bg-purple-400/10'
                    : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{template.emoji}</span>
                    <span className="font-semibold text-primary">{template.name}</span>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-purple-400 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-secondary mb-3">{template.description}</p>
                
                <div className="space-y-1">
                  {templateCategories.slice(0, 4).map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-secondary">{cat.name}</span>
                      </div>
                      <span className="text-primary">{cat.percentage}%</span>
                    </div>
                  ))}
                  {templateCategories.length > 4 && (
                    <div className="text-xs text-secondary">
                      +{templateCategories.length - 4} more categories
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Preview selected template */}
        {selectedTemplate && (
          <div className="mb-6 p-4 bg-white/5 rounded-lg border border-white/10">
            <h4 className="text-sm font-semibold text-primary mb-3">Preview: Category Allocations</h4>
            <div className="space-y-2">
              {CATEGORY_TEMPLATES[selectedTemplate].map((cat, idx) => {
                const amount = (cat.percentage / 100) * totalBudget;
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm text-primary">{cat.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-primary">
                        ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-secondary ml-2">
                        ({cat.percentage}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 premium-button-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedTemplate}
            className="flex-1 premium-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply Template
          </button>
        </div>
      </div>
    </div>
  );
};

export default CategoryTemplateModal;
