import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../model/types';
import type { Scene } from '../model/types';
import { Sim, calibrateGravityPxS2 } from './sim';
import { PX_PER_M, TICKS_PER_SECOND } from './units';

const floor = {
  id: 'floor',
  kind: 'box' as const,
  x: 500,
  y: 585,
  width: 1040,
  height: 40,
  angle: 0,
  isStatic: true,
  tuning: { ...DEFAULT_TUNING, friction: 0.4, restitution: 0 },
};

describe('gravity calibration', () => {
  it('measures an Earth-like acceleration at scale 1 and zero at scale 0', () => {
    const g1 = calibrateGravityPxS2(1);
    // nominal target is 981 px/s^2; accept a wide engine-dependent band
    expect(g1).toBeGreaterThan(500);
    expect(g1).toBeLessThan(1500);
    expect(calibrateGravityPxS2(0)).toBe(0);
    const g2 = calibrateGravityPxS2(2);
    expect(g2 / g1).toBeGreaterThan(1.8);
    expect(g2 / g1).toBeLessThan(2.2);
  });
});

describe('free fall', () => {
  it('gains kinetic energy roughly equal to lost potential energy', () => {
    const scene: Scene = {
      objects: [
        floor,
        {
          id: 'ball',
          kind: 'ball',
          x: 150,
          y: 120,
          radius: 26,
          tuning: { ...DEFAULT_TUNING, friction: 0, restitution: 0 },
        },
      ],
    };
    const sim = new Sim(scene, { gravityScale: 1 });
    const f0 = sim.frame();
    for (let i = 0; i < TICKS_PER_SECOND / 2; i += 1) sim.step();
    const f1 = sim.frame();
    const ball0 = f0.metrics.find((m) => m.id === 'ball')!;
    const ball1 = f1.metrics.find((m) => m.id === 'ball')!;
    expect(ball1.speed).toBeGreaterThan(1); // actually falling
    const keGain = ball1.ke - ball0.ke;
    const peLoss = ball0.pe - ball1.pe;
    expect(peLoss).toBeGreaterThan(0);
    // semi-implicit Euler loses/gains a little energy; require loose consistency
    expect(Math.abs(keGain - peLoss) / peLoss).toBeLessThan(0.25);
    sim.dispose();
  });
});

describe('pendulum', () => {
  it('keeps the bob at rod distance from its anchor', () => {
    const scene: Scene = {
      objects: [
        floor,
        {
          id: 'p',
          kind: 'pendulum',
          anchorX: 660,
          anchorY: 120,
          bobX: 760,
          bobY: 250,
          radius: 24,
          tuning: { ...DEFAULT_TUNING },
        },
      ],
    };
    const sim = new Sim(scene, { gravityScale: 1 });
    const rodLength = Math.hypot(760 - 660, 250 - 120);
    let maxDev = 0;
    for (let i = 0; i < TICKS_PER_SECOND * 3; i += 1) {
      sim.step();
      const bob = sim.bodyById.get('p')!;
      const d = Math.hypot(bob.position.x - 660, bob.position.y - 120);
      maxDev = Math.max(maxDev, Math.abs(d - rodLength));
    }
    expect(maxDev / rodLength).toBeLessThan(0.08);
    sim.dispose();
  });

  it('actually swings back up (energy moves between PE and KE)', () => {
    const scene: Scene = {
      objects: [
        floor,
        {
          id: 'p',
          kind: 'pendulum',
          anchorX: 660,
          anchorY: 120,
          bobX: 760,
          bobY: 250,
          radius: 24,
          tuning: { ...DEFAULT_TUNING },
        },
      ],
    };
    const sim = new Sim(scene, { gravityScale: 1 });
    let minSpeed = Infinity;
    let maxSpeed = 0;
    for (let i = 0; i < TICKS_PER_SECOND * 2; i += 1) {
      sim.step();
      const f = sim.frame();
      const m = f.metrics.find((mm) => mm.id === 'p')!;
      minSpeed = Math.min(minSpeed, m.speed);
      maxSpeed = Math.max(maxSpeed, m.speed);
    }
    expect(maxSpeed).toBeGreaterThan(1);
    expect(minSpeed).toBeLessThan(maxSpeed * 0.5);
    sim.dispose();
  });
});

describe('pin', () => {
  it('holds the pinned point in place while the body swings', () => {
    const scene: Scene = {
      objects: [
        floor,
        {
          id: 'plank',
          kind: 'box',
          x: 620,
          y: 470,
          width: 190,
          height: 22,
          angle: 0,
          isStatic: false,
          tuning: { ...DEFAULT_TUNING },
        },
        { id: 'pin', kind: 'pin', bodyId: 'plank', x: 535, y: 470 },
      ],
    };
    const sim = new Sim(scene, { gravityScale: 1 });
    for (let i = 0; i < TICKS_PER_SECOND; i += 1) sim.step();
    const plank = sim.bodyById.get('plank')!;
    // the plank rotates around the pin: its centre stays within one body-length of the pin
    const d = Math.hypot(plank.position.x - 535, plank.position.y - 470);
    expect(d).toBeLessThan(110);
    expect(Math.abs(plank.angle)).toBeGreaterThan(0.05); // it swung
    sim.dispose();
  });
});

describe('ramp', () => {
  it('lets a ball roll downhill', () => {
    const scene: Scene = {
      objects: [
        floor,
        {
          id: 'ramp',
          kind: 'ramp',
          ax: 90,
          ay: 170,
          bx: 430,
          by: 320,
          thickness: 14,
          tuning: { ...DEFAULT_TUNING, friction: 0.02 },
        },
        {
          id: 'ball',
          kind: 'ball',
          x: 150,
          y: 120,
          radius: 26,
          tuning: { ...DEFAULT_TUNING, friction: 0.05, restitution: 0 },
        },
      ],
    };
    const sim = new Sim(scene, { gravityScale: 1 });
    for (let i = 0; i < TICKS_PER_SECOND * 2; i += 1) sim.step();
    const ball = sim.bodyById.get('ball')!;
    // the ramp descends toward +x: the ball must end up lower and further right
    expect(ball.position.x).toBeGreaterThan(170);
    expect(ball.position.y).toBeGreaterThan(130);
    sim.dispose();
  });
});

describe('restoreFrame', () => {
  it('rewinds the simulation to a recorded state', () => {
    const scene: Scene = {
      objects: [
        floor,
        {
          id: 'ball',
          kind: 'ball',
          x: 150,
          y: 120,
          radius: 26,
          tuning: { ...DEFAULT_TUNING },
        },
      ],
    };
    const sim = new Sim(scene, { gravityScale: 1 });
    for (let i = 0; i < 30; i += 1) sim.step();
    const mid = sim.frame();
    for (let i = 0; i < 30; i += 1) sim.step();
    sim.restoreFrame(mid);
    const f = sim.frame();
    const a = mid.bodies.find((b) => b.id === 'ball')!;
    const b = f.bodies.find((bb) => bb.id === 'ball')!;
    expect(b.x).toBeCloseTo(a.x, 3);
    expect(b.y).toBeCloseTo(a.y, 3);
    expect(b.vy).toBeCloseTo(a.vy, 3);
    expect(sim.time).toBeCloseTo(mid.t, 3);
    sim.dispose();
  });
});

describe('energy reference', () => {
  it('uses the static floor level as PE zero', () => {
    const scene: Scene = { objects: [floor] };
    const sim = new Sim(scene, { gravityScale: 1 });
    expect(sim.refY).toBeCloseTo(605, 0);
    sim.dispose();
  });

  it('respects pixel-per-metre scaling for displayed units', () => {
    expect(PX_PER_M).toBe(100);
  });
});
