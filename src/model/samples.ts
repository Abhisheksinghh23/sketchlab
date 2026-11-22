import { DEFAULT_TUNING } from './types';
import type { Scene } from './types';

/**
 * The first-run scene: a ball above a ramp, a swinging pendulum, and a plank
 * pinned at one end so all three behaviours are visible the moment you press Play.
 */
export function sampleScene(): Scene {
  return {
    objects: [
      {
        id: 'floor',
        kind: 'box',
        x: 500,
        y: 585,
        width: 1040,
        height: 40,
        angle: 0,
        isStatic: true,
        tuning: { ...DEFAULT_TUNING, friction: 0.4, restitution: 0 },
      },
      {
        id: 'ramp-1',
        kind: 'ramp',
        ax: 90,
        ay: 170,
        bx: 430,
        by: 320,
        thickness: 14,
        tuning: { ...DEFAULT_TUNING, friction: 0.05 },
      },
      {
        id: 'ball-1',
        kind: 'ball',
        x: 150,
        y: 120,
        radius: 26,
        tuning: { ...DEFAULT_TUNING, restitution: 0.35 },
      },
      {
        id: 'pendulum-1',
        kind: 'pendulum',
        anchorX: 660,
        anchorY: 120,
        bobX: 760,
        bobY: 250,
        radius: 24,
        tuning: { ...DEFAULT_TUNING },
      },
      {
        id: 'plank-1',
        kind: 'box',
        x: 620,
        y: 470,
        width: 190,
        height: 22,
        angle: 0,
        isStatic: false,
        tuning: { ...DEFAULT_TUNING, friction: 0.3 },
      },
      {
        id: 'pin-1',
        kind: 'pin',
        bodyId: 'plank-1',
        x: 535,
        y: 470,
      },
    ],
  };
}

export function emptyScene(): Scene {
  return {
    objects: [
      {
        id: 'floor',
        kind: 'box',
        x: 500,
        y: 585,
        width: 1040,
        height: 40,
        angle: 0,
        isStatic: true,
        tuning: { ...DEFAULT_TUNING, friction: 0.4, restitution: 0 },
      },
    ],
  };
}
