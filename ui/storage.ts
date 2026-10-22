import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlotInput } from '../engine';

const KEY = 'gharplan.plans.v1';

export interface SavedPlan {
  id: string;
  name: string;
  savedAt: string;
  input: PlotInput;
}

// Storage can fail (private browsing, cleared data). Callers still work without it.
export async function loadPlans(): Promise<SavedPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedPlan[]) : [];
  } catch {
    return [];
  }
}

export async function savePlans(plans: SavedPlan[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(plans));
  } catch {
    // Not saved; the user can still view the plan this session.
  }
}
