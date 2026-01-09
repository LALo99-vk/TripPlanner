import { AiTripPlanData } from './api';

type Listener = () => void;

interface GenerationState {
  isGenerating: boolean;
  startTime: number;
  destination: string;
  error?: string;
}

class PlanStore {
  private currentPlan: AiTripPlanData | null = null;
  private listeners: Listener[] = [];
  private generationState: GenerationState = {
    isGenerating: false,
    startTime: 0,
    destination: '',
  };

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
    // Clear generation state when plan is set
    this.setGenerating(false, '');
    this.emit();
  }

  // Generation state management
  getGenerationState(): GenerationState {
    // First check memory
    if (this.generationState.isGenerating) {
      return this.generationState;
    }
    // Then check localStorage
    const cached = localStorage.getItem('plan_generation_state');
    if (cached) {
      try {
        const state = JSON.parse(cached);
        // Check if generation is stale (more than 5 minutes old)
        if (state.isGenerating && Date.now() - state.startTime > 5 * 60 * 1000) {
          // Clear stale generation state
          this.setGenerating(false, '');
          return { isGenerating: false, startTime: 0, destination: '' };
        }
        this.generationState = state;
        return state;
      } catch {}
    }
    return { isGenerating: false, startTime: 0, destination: '' };
  }

  setGenerating(isGenerating: boolean, destination: string, error?: string) {
    this.generationState = {
      isGenerating,
      startTime: isGenerating ? Date.now() : 0,
      destination,
      error,
    };
    if (isGenerating) {
      localStorage.setItem('plan_generation_state', JSON.stringify(this.generationState));
    } else {
      localStorage.removeItem('plan_generation_state');
    }
    this.emit();
  }

  setGenerationError(error: string) {
    this.generationState.error = error;
    this.generationState.isGenerating = false;
    localStorage.removeItem('plan_generation_state');
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


