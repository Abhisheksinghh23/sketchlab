import Matter from 'matter-js';
import type {
  BallObj,
  BoxObj,
  PendulumObj,
  PinObj,
  RampObj,
  Scene,
  SceneObject,
  WorldParams,
} from '../model/types';
import { DT_MS, PX_PER_M, TICKS_PER_SECOND, pxToM } from './units';

export interface BodyFrame {
  id: string;
  x: number;
  y: number;
  angle: number;
  /** velocity in px/s */
  vx: number;
  vy: number;
  /** angular velocity in rad/s */
  w: number;
  isStatic: boolean;
}

export interface FrameMetrics {
  id: string;
  /** speed in m/s (100 px = 1 m) */
  speed: number;
  /** height above the static reference level, in m */
  heightM: number;
  ke: number;
  pe: number;
}

export interface Frame {
  /** seconds since the run started */
  t: number;
  bodies: BodyFrame[];
  metrics: FrameMetrics[];
  totalKe: number;
  totalPe: number;
}

const bodyOptions = (tuning: {
  friction: number;
  restitution: number;
  density: number;
}): Matter.IBodyDefinition => ({
  friction: tuning.friction,
  restitution: tuning.restitution,
  density: tuning.density,
});

function buildBall(obj: BallObj): Matter.Body {
  return Matter.Bodies.circle(obj.x, obj.y, obj.radius, bodyOptions(obj.tuning));
}

function buildBox(obj: BoxObj): Matter.Body {
  return Matter.Bodies.rectangle(obj.x, obj.y, obj.width, obj.height, {
    friction: obj.tuning.friction,
    restitution: obj.tuning.restitution,
    density: obj.tuning.density,
    angle: obj.angle,
    isStatic: obj.isStatic,
  });
}

function buildRamp(obj: RampObj): Matter.Body {
  const cx = (obj.ax + obj.bx) / 2;
  const cy = (obj.ay + obj.by) / 2;
  const length = Math.hypot(obj.bx - obj.ax, obj.by - obj.ay);
  const angle = Math.atan2(obj.by - obj.ay, obj.bx - obj.ax);
  return Matter.Bodies.rectangle(cx, cy, length, obj.thickness, {
    friction: obj.tuning.friction,
    restitution: obj.tuning.restitution,
    density: obj.tuning.density,
    angle,
    isStatic: true,
  });
}

function buildPendulum(
  obj: PendulumObj,
  bodies: Map<string, Matter.Body>,
  constraints: Matter.Constraint[],
): void {
  const bob = Matter.Bodies.circle(obj.bobX, obj.bobY, obj.radius, bodyOptions(obj.tuning));
  const length = Math.max(
    10,
    Math.hypot(obj.bobX - obj.anchorX, obj.bobY - obj.anchorY),
  );
  const rod = Matter.Constraint.create({
    pointA: { x: obj.anchorX, y: obj.anchorY },
    bodyB: bob,
    pointB: { x: 0, y: 0 },
    length,
    stiffness: 1,
    damping: 0,
  });
  bodies.set(obj.id, bob);
  constraints.push(rod);
}

function buildPin(
  obj: PinObj,
  bodies: Map<string, Matter.Body>,
  objects: Map<string, SceneObject>,
  constraints: Matter.Constraint[],
): void {
  const body = bodies.get(obj.bodyId);
  const target = objects.get(obj.bodyId);
  if (!body || !target) return;
  // Pin the exact clicked point of the body: keep the local offset, zero length.
  const offset = Matter.Vector.sub({ x: obj.x, y: obj.y }, body.position);
  const local = Matter.Vector.rotate(offset, -body.angle);
  constraints.push(
    Matter.Constraint.create({
      pointA: { x: obj.x, y: obj.y },
      bodyB: body,
      pointB: local,
      length: 0,
      stiffness: 1,
      damping: 0,
    }),
  );
}

/**
 * Measure the engine's actual gravitational acceleration for a given gravity
 * scale instead of trusting a documented constant, so the energy numbers stay
 * consistent with the motion on screen across matter-js versions.
 */
export function calibrateGravityPxS2(gravityScale: number): number {
  const engine = Matter.Engine.create();
  engine.gravity.y = gravityScale;
  const probe = Matter.Bodies.circle(0, 0, 10, {
    frictionAir: 0,
    friction: 0,
    restitution: 0,
  });
  Matter.Composite.add(engine.world, probe);
  const steps = TICKS_PER_SECOND; // one second
  for (let i = 0; i < steps; i += 1) {
    Matter.Engine.update(engine, DT_MS);
  }
  const vPxPerTick = probe.velocity.y;
  const vPxS = vPxPerTick * TICKS_PER_SECOND;
  Matter.Composite.clear(engine.world, false, true);
  Matter.Engine.clear(engine);
  return vPxS / 1; // px/s^2 after exactly one simulated second
}

export class Sim {
  readonly engine: Matter.Engine;
  readonly bodyById = new Map<string, Matter.Body>();
  readonly objById = new Map<string, SceneObject>();
  readonly worldParams: WorldParams;
  /** y-coordinate of the lowest static geometry: the PE zero level. */
  readonly refY: number;
  /** Measured gravity in px/s^2 for this world's gravity scale. */
  readonly gPxS2: number;
  steps = 0;

  constructor(scene: Scene, world: WorldParams) {
    this.worldParams = { ...world };
    this.engine = Matter.Engine.create();
    this.engine.gravity.y = world.gravityScale;
    this.engine.positionIterations = 8;
    this.engine.velocityIterations = 6;
    this.engine.constraintIterations = 4;

    const constraints: Matter.Constraint[] = [];
    for (const obj of scene.objects) {
      this.objById.set(obj.id, obj);
      if (obj.kind === 'ball') this.bodyById.set(obj.id, buildBall(obj));
      else if (obj.kind === 'box') this.bodyById.set(obj.id, buildBox(obj));
      else if (obj.kind === 'ramp') this.bodyById.set(obj.id, buildRamp(obj));
      else if (obj.kind === 'pendulum') buildPendulum(obj, this.bodyById, constraints);
    }
    for (const obj of scene.objects) {
      if (obj.kind === 'pin') buildPin(obj, this.bodyById, this.objById, constraints);
    }

    Matter.Composite.add(this.engine.world, [...this.bodyById.values(), ...constraints]);

    // PE reference: lowest point of static geometry, else lowest initial body.
    let ref = -Infinity;
    for (const obj of scene.objects) {
      if (obj.kind === 'ramp') ref = Math.max(ref, obj.ay, obj.by);
      else if (obj.kind === 'box' && obj.isStatic) ref = Math.max(ref, obj.y + obj.height / 2);
    }
    if (!Number.isFinite(ref)) {
      for (const body of this.bodyById.values()) ref = Math.max(ref, body.position.y);
    }
    this.refY = Number.isFinite(ref) ? ref : 0;
    this.gPxS2 = calibrateGravityPxS2(world.gravityScale);
  }

  get time(): number {
    return this.steps / TICKS_PER_SECOND;
  }

  step(): void {
    Matter.Engine.update(this.engine, DT_MS);
    this.steps += 1;
  }

  frame(): Frame {
    const bodies: BodyFrame[] = [];
    const metrics: FrameMetrics[] = [];
    let totalKe = 0;
    let totalPe = 0;
    for (const [id, body] of this.bodyById) {
      const vx = body.velocity.x * TICKS_PER_SECOND;
      const vy = body.velocity.y * TICKS_PER_SECOND;
      const w = body.angularVelocity * TICKS_PER_SECOND;
      bodies.push({
        id,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        vx,
        vy,
        w,
        isStatic: body.isStatic,
      });
      const speedMS = Math.hypot(pxToM(vx), pxToM(vy));
      const inertiaM2 = body.inertia / (PX_PER_M * PX_PER_M);
      const ke = 0.5 * body.mass * speedMS * speedMS + 0.5 * inertiaM2 * w * w;
      const gMS2 = this.gPxS2 / PX_PER_M;
      const heightM = (this.refY - body.position.y) / PX_PER_M;
      const pe = body.isStatic ? 0 : body.mass * gMS2 * heightM;
      metrics.push({ id, speed: speedMS, heightM, ke, pe });
      if (!body.isStatic) {
        totalKe += ke;
        totalPe += pe;
      }
    }
    return { t: this.time, bodies, metrics, totalKe, totalPe };
  }

  /** Restore all dynamic bodies to a recorded frame, so a run can resume from any scrubbed point. */
  restoreFrame(frame: Frame): void {
    for (const bf of frame.bodies) {
      const body = this.bodyById.get(bf.id);
      if (!body || body.isStatic) continue;
      Matter.Body.setPosition(body, { x: bf.x, y: bf.y });
      Matter.Body.setAngle(body, bf.angle);
      Matter.Body.setVelocity(body, {
        x: bf.vx / TICKS_PER_SECOND,
        y: bf.vy / TICKS_PER_SECOND,
      });
      Matter.Body.setAngularVelocity(body, bf.w / TICKS_PER_SECOND);
    }
    this.steps = Math.round(frame.t * TICKS_PER_SECOND);
  }

  dispose(): void {
    Matter.Composite.clear(this.engine.world, false, true);
    Matter.Engine.clear(this.engine);
  }
}

/** Point-in-shape hit test against the scene model, for select/pin/erase tools. */
export function hitTest(scene: Scene, p: { x: number; y: number }): string | null {
  for (let i = scene.objects.length - 1; i >= 0; i -= 1) {
    const obj = scene.objects[i];
    if (obj.kind === 'ball') {
      if (Math.hypot(p.x - obj.x, p.y - obj.y) <= obj.radius + 4) return obj.id;
    } else if (obj.kind === 'box') {
      const dx = p.x - obj.x;
      const dy = p.y - obj.y;
      const c = Math.cos(-obj.angle);
      const s = Math.sin(-obj.angle);
      const lx = dx * c - dy * s;
      const ly = dx * s + dy * c;
      if (Math.abs(lx) <= obj.width / 2 + 3 && Math.abs(ly) <= obj.height / 2 + 3) return obj.id;
    } else if (obj.kind === 'ramp') {
      if (distToSegment(p, { x: obj.ax, y: obj.ay }, { x: obj.bx, y: obj.by }) <= obj.thickness / 2 + 5) {
        return obj.id;
      }
    } else if (obj.kind === 'pendulum') {
      if (Math.hypot(p.x - obj.bobX, p.y - obj.bobY) <= obj.radius + 4) return obj.id;
      if (Math.hypot(p.x - obj.anchorX, p.y - obj.anchorY) <= 10) return obj.id;
    } else if (obj.kind === 'pin') {
      if (Math.hypot(p.x - obj.x, p.y - obj.y) <= 10) return obj.id;
    }
  }
  return null;
}

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}
