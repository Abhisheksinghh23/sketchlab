// Scene model: the explicit drawing grammar SketchLab understands.
// Everything is plain serialisable data so scenes can be saved, forked and compared.

export interface Vec {
  x: number;
  y: number;
}

export interface BodyTuning {
  friction: number; // 0..1 surface friction
  restitution: number; // 0..1 bounciness
  density: number; // mass per area, in sim units
}

export const DEFAULT_TUNING: BodyTuning = {
  friction: 0.1,
  restitution: 0.2,
  density: 0.001,
};

export interface BallObj {
  id: string;
  kind: 'ball';
  x: number;
  y: number;
  radius: number;
  tuning: BodyTuning;
}

export interface BoxObj {
  id: string;
  kind: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number; // radians
  isStatic: boolean;
  tuning: BodyTuning;
}

/** A static bar between two points. The ramp, shelf or wall of the drawing. */
export interface RampObj {
  id: string;
  kind: 'ramp';
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thickness: number;
  tuning: BodyTuning;
}

/** A bob on a rod hanging from an anchor point. */
export interface PendulumObj {
  id: string;
  kind: 'pendulum';
  anchorX: number;
  anchorY: number;
  bobX: number;
  bobY: number;
  radius: number;
  tuning: BodyTuning;
}

/** Pins the clicked point of a body to a fixed world point, so the body pivots around it. */
export interface PinObj {
  id: string;
  kind: 'pin';
  bodyId: string;
  x: number;
  y: number;
}

export type SceneObject = BallObj | BoxObj | RampObj | PendulumObj | PinObj;

export interface Scene {
  objects: SceneObject[];
}

export interface WorldParams {
  /** Multiplier of Earth gravity. 1 = Earth, 0 = off, 2 = double. */
  gravityScale: number;
}

export const DEFAULT_WORLD: WorldParams = { gravityScale: 1 };

export function cloneScene(scene: Scene): Scene {
  return JSON.parse(JSON.stringify(scene)) as Scene;
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Static geometry sets the potential-energy reference level (its lowest point). */
export function isStaticKind(obj: SceneObject): boolean {
  if (obj.kind === 'ramp') return true;
  if (obj.kind === 'box') return obj.isStatic;
  return false;
}
