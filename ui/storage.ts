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
/** Keeps only entries with the fields the app uses, so a damaged store cannot break the list. */
function isSavedPlan(x: unknown): x is SavedPlan {
  if (!x || typeof x !== 'object') return false;
  const p = x as Partial<SavedPlan> & { input?: Partial<PlotInput> };
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.savedAt === 'string' &&
    !!p.input &&
    typeof p.input.width === 'number' &&
    typeof p.input.depth === 'number' &&
    typeof p.input.facing === 'string' &&
    typeof p.input.bhk === 'number'
  );
}

export async function loadPlans(): Promise<SavedPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isSavedPlan) : [];
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
