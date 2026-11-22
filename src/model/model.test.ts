import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history';
import { sampleScene } from './samples';
import { cloneScene } from './types';
import type { Scene } from './types';
import { hitTest } from '../physics/sim';

describe('history', () => {
  it('pushes, undoes and redoes snapshots', () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    expect(h.present).toBe(3);
    expect(canUndo(h)).toBe(true);
    h = undoHistory(h);
    expect(h.present).toBe(2);
    h = undoHistory(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redoHistory(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
  });

  it('drops the redo branch on a new edit', () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = undoHistory(h);
    h = pushHistory(h, 5);
    expect(h.present).toBe(5);
    expect(canRedo(h)).toBe(false);
  });

  it('caps the past length', () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 20; i += 1) h = pushHistory(h, i);
    expect(h.past.length).toBeLessThanOrEqual(MAX_HISTORY);
  });
});

describe('scene cloning', () => {
  it('produces a deep independent copy (fork safety)', () => {
    const scene = sampleScene();
    const copy = cloneScene(scene);
    const ball = copy.objects.find((o) => o.id === 'ball-1');
    if (ball?.kind !== 'ball') throw new Error('missing ball');
    ball.x = 999;
    const original = scene.objects.find((o) => o.id === 'ball-1');
    if (original?.kind !== 'ball') throw new Error('missing ball');
    expect(original.x).toBe(150);
  });

  it('survives a JSON serialisation round trip', () => {
    const scene = sampleScene();
    const revived = JSON.parse(JSON.stringify(scene)) as Scene;
    expect(revived).toEqual(scene);
  });
});

describe('hit testing', () => {
  const scene = sampleScene();
  it('finds a ball by its centre', () => {
    expect(hitTest(scene, { x: 150, y: 120 })).toBe('ball-1');
  });
  it('finds a ramp near its segment', () => {
    expect(hitTest(scene, { x: 260, y: 245 })).toBe('ramp-1');
  });
  it('finds the pendulum bob and anchor', () => {
    expect(hitTest(scene, { x: 760, y: 250 })).toBe('pendulum-1');
    expect(hitTest(scene, { x: 660, y: 120 })).toBe('pendulum-1');
  });
  it('returns null on empty space', () => {
    expect(hitTest(scene, { x: 20, y: 20 })).toBeNull();
  });
});
