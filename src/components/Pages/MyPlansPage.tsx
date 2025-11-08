import React, { useEffect, useState } from 'react';
import { auth } from '../../config/firebase';
import { listUserPlans, SavedPlanRecord } from '../../services/planRepository';
import { planStore } from '../../services/planStore';

const MyPlansPage: React.FC = () => {
  const [plans, setPlans] = useState<SavedPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const u = auth.currentUser;
      if (!u) { setLoading(false); return; }
      try {
        const list = await listUserPlans(u.uid);
        setPlans(list);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openPlan = (rec: SavedPlanRecord) => {
    planStore.setPlan(rec.plan);
    const evt = new CustomEvent('navigate', { detail: { page: 'yourplan' } });
    window.dispatchEvent(evt as any);
  };

  return (
    <div className="min-h-screen p-6">
      <div className="content-container">
        <div className="mb-6">
          <div className="text-3xl font-bold text-primary">My Plans</div>
          <div className="text-secondary">Past trips: {plans.length}</div>
        </div>
        {loading ? (
          <div className="text-secondary">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((p) => (
              <button key={p.id} onClick={() => openPlan(p)} className="glass-card p-4 text-left hover:bg-white/10 transition-colors">
                <div className="text-lg font-semibold text-primary">{p.name}</div>
                <div className="text-sm text-secondary">
                  {p.createdAt instanceof Date 
                    ? p.createdAt.toLocaleString() 
                    : typeof p.createdAt === 'string' 
                      ? new Date(p.createdAt).toLocaleString() 
                      : ''}
                </div>
                <div className="text-sm text-secondary mt-1">{p.plan.overview.from} → {p.plan.overview.to} • {p.plan.overview.durationDays} Days</div>
              </button>
            ))}
            {plans.length === 0 && (
              <div className="text-secondary">No saved plans yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPlansPage;




