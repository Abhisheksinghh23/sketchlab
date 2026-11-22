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

/**
 * 'empty'   - nothing stored (or storage unreadable); safe to start fresh and save.
 * 'ok'      - valid saved state.
 * 'corrupt' - something IS stored but unreadable; the raw bytes are left untouched
 *             and saving must stay paused until the user explicitly discards them,
 *             so a recoverable save is never silently overwritten.
 */
export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; state: SavedState }
  | { kind: 'corrupt' };

const STORAGE_KEY = 'sketchlab-v1';

export function loadState(): LoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kind: 'empty' };
    const parsed = JSON.parse(raw) as SavedState;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.experiments) ||
      parsed.experiments.length === 0
    ) {
      return { kind: 'corrupt' };
    }
    return { kind: 'ok', state: parsed };
  } catch (err) {
    // JSON.parse failure on existing data means corrupt; a getItem throw means
    // storage is unavailable, which the next saveState() will surface.
    if (err instanceof SyntaxError) return { kind: 'corrupt' };
    return { kind: 'empty' };
  }
}

/** Returns true when the state was written, false when storage failed. */
export function saveState(state: SavedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
