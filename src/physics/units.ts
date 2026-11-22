// Unit conventions for the simulation.
// Distances are authored in pixels on a 1000x600 design canvas.
// For display quantities (energy, speed) 100 px = 1 m, so a ball falling
// under gravity scale 1 accelerates about as fast as a real object on Earth
// if you read the canvas in metres.

export const PX_PER_M = 100;
export const EARTH_G_M_S2 = 9.81;
export const TICKS_PER_SECOND = 60;
export const DT_MS = 1000 / TICKS_PER_SECOND;

export const pxToM = (px: number): number => px / PX_PER_M;

/** Nominal pixel gravity for a gravity scale, before engine calibration. */
export const nominalGravityPxS2 = (gravityScale: number): number =>
  gravityScale * EARTH_G_M_S2 * PX_PER_M;
