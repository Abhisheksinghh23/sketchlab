import type { Scene, WorldParams } from './types';

export interface SavedExperiment {
  id: string;
  name: string;
  scene: Scene;
  world: WorldParams;
}

export interface SavedState {
  version: 1;
  experiments: SavedExperiment[];
  activeId: string;
}

const STORAGE_KEY = 'sketchlab-v1';

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.experiments) ||
      parsed.experiments.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable: the session still works, just unsaved.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
