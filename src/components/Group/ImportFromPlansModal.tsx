import React, { useState, useEffect } from 'react';
import { X, Download, MapPin, Calendar } from 'lucide-react';
import { listUserPlans, SavedPlanRecord } from '../../services/planRepository';
import { useAuth } from '../../hooks/useAuth';

interface ImportFromPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (plan: SavedPlanRecord) => Promise<void>;
}

const ImportFromPlansModal: React.FC<ImportFromPlansModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<SavedPlanRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingPlanId, setImportingPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadPlans();
    }
  }, [isOpen, user]);

  const loadPlans = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userPlans = await listUserPlans(user.uid);
      setPlans(userPlans);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (plan: SavedPlanRecord) => {
    setImportingPlanId(plan.id);
    try {
      await onImport(plan);
      onClose();
    } catch (error) {
      console.error('Error importing plan:', error);
    } finally {
      setImportingPlanId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="glass-card p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-primary">Import Trip Itineraries</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="h-12 w-12 text-muted mx-auto mb-4" />
            <p className="text-muted">No saved plans found</p>
            <p className="text-muted text-sm mt-2">
              Create a plan first from the Trip Planner page
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="glass-card p-4 hover:bg-white/10 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-primary mb-2">{plan.name}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-secondary">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{plan.plan.overview.to}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{plan.plan.overview.durationDays} days</span>
                      </div>
                      <div className="text-xs text-muted">
                        {plan.plan.days.length} days of activities
                      </div>
                    </div>
                    {plan.plan.overview.summary && (
                      <p className="text-sm text-muted mt-2 line-clamp-2">
                        {plan.plan.overview.summary}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleImport(plan)}
                    disabled={importingPlanId === plan.id}
                    className="ml-4 premium-button-secondary flex items-center gap-2 text-sm disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {importingPlanId === plan.id ? 'Importing...' : 'Import'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full premium-button-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportFromPlansModal;

