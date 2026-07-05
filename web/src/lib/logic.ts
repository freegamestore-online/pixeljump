/** Pure game math — no React, no DOM. */

export const PLAYER_RADIUS = 18;
export const ENEMY_RADIUS = 22;
export const ENEMY_HEAD_RADIUS = 13;
export const LASER_RADIUS = 5;
export const LASER_SPEED = 420;
export const LASER_LIFETIME = 3.5;
export const LASER_COOLDOWN_START = 2.2; // seconds between shots at start
export const LASER_COOLDOWN_MIN = 0.6;   // minimum cooldown at high difficulty
export const ENEMY_SPEED_START = 130;
export const ENEMY_SPEED_MAX = 280;
export const PLAYER_SPEED = 220;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? v > hi ? hi : v : v;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalize(dx: number, dy: number): [number, number] {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [0, 0];
  return [dx / len, dy / len];
}

/** Returns the laser cooldown based on elapsed time (difficulty ramp). */
export function getLaserCooldown(elapsed: number): number {
  const t = Math.min(elapsed / 60, 1); // ramp over 60 seconds
  return LASER_COOLDOWN_START - t * (LASER_COOLDOWN_START - LASER_COOLDOWN_MIN);
}

/** Returns the enemy speed based on elapsed time. */
export function getEnemySpeed(elapsed: number): number {
  const t = Math.min(elapsed / 60, 1);
  return ENEMY_SPEED_START + t * (ENEMY_SPEED_MAX - ENEMY_SPEED_START);
}
