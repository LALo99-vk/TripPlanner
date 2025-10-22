import { AiTripPlanData } from './api';

type Listener = () => void;

class PlanStore {
  private currentPlan: AiTripPlanData | null = null;
  private listeners: Listener[] = [];

  getPlan(): AiTripPlanData | null {
    if (this.currentPlan) return this.currentPlan;
    const cached = localStorage.getItem('current_ai_plan');
    if (cached) {
      try { this.currentPlan = JSON.parse(cached); } catch {}
    }
    return this.currentPlan;
  }

  setPlan(plan: AiTripPlanData) {
    this.currentPlan = plan;
    localStorage.setItem('current_ai_plan', JSON.stringify(plan));
    this.emit();
  }

  savePlanToLibrary(name?: string): string {
    const plan = this.currentPlan;
    if (!plan) return '';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { id, name: name || `${plan.overview.to} (${plan.overview.durationDays}D)`, createdAt: new Date().toISOString(), plan };
    const allRaw = localStorage.getItem('saved_ai_plans');
    const all = allRaw ? JSON.parse(allRaw) : [];
    all.push(record);
    localStorage.setItem('saved_ai_plans', JSON.stringify(all));
    return id;
  }

  getSavedPlans(): Array<{ id: string; name: string; createdAt: string; plan: AiTripPlanData }> {
    const allRaw = localStorage.getItem('saved_ai_plans');
    return allRaw ? JSON.parse(allRaw) : [];
  }

  loadPlanById(id: string): AiTripPlanData | null {
    const all = this.getSavedPlans();
    const found = all.find((p) => p.id === id);
    if (found) {
      this.setPlan(found.plan);
      return found.plan;
    }
    return null;
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const planStore = new PlanStore();


