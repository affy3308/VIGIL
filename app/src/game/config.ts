/**
 * config.ts — global tuning. Input sensitivity and invert switches live here (sync verify-game.mjs when changing the mapping).
 */

export const INPUT_CONFIG = {
  /** Mouse/touch camera sensitivity (radians/pixel). */
  MOUSE_SENS_X: 0.0026,
  MOUSE_SENS_Y: 0.0022,
  /** Camera invert switches: default false = mouse right turns camera right, mouse up looks up (intuitive directions). */
  INVERT_X: false,
  INVERT_Y: false,
} as const;

export const QUALITY = {
  /** Degradation tier for insufficient performance: cut particles and effects instead of dropping frames. */
  PARTICLES_HIGH: 900,
  PARTICLES_LOW: 400,
  /** Auto-degrade when the frame rate stays below this for 2s. */
  DEGRADE_FPS: 45,
} as const;

export const COLORS = {
  background: 0x05060a,
  fog: 0x07080d,
  boltGold: 0xffd27a,
  blood: 0x8a1f1f,
  warpGreen: 0x9fff5a,
} as const;

/** Playable arena bounds (half extents, metres). */
export const ARENA = {
  HALF_W: 24,
  HALF_D: 16,
} as const;

export const PLAYER = {
  SPEED: 9,
  RADIUS: 0.85,
  MAX_HP: 100,
  DASH_TIME: 0.18,
  DASH_SPEED: 30,
  DASH_CD: 2.4,
  FIRE_INTERVAL: 0.17,
  BULLET_SPEED: 36,
  BULLET_DAMAGE: 26,
  BULLET_LIFE: 1.1,
  HIT_INVULN: 0.6,
} as const;

export const WAVES = {
  COUNT: 10,
  /** Seconds between individual spawns inside a wave. */
  SPAWN_INTERVAL: 0.75,
} as const;
