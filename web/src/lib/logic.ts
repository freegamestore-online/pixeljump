/** Pure game math — no React, no DOM. */

export const CANVAS_W = 800;
export const CANVAS_H = 600;

export const PLAYER_RADIUS = 16;
export const ENEMY_RADIUS = 18;
export const CARROT_RADIUS = 12;
export const POWERUP_RADIUS = 14;

export const PLAYER_ACCEL = 1800;
export const PLAYER_FRICTION = 0.82;
export const PLAYER_MAX_SPEED = 320;

export const ENEMY_BASE_SPEED = 155;
export const ENEMY_SPEED_PER_10 = 18;
export const ENEMY_MAX_SPEED = 340;

export const ROUND_SECONDS = 60;
export const POWERUP_SPAWN_INTERVAL = 12; // seconds
export const COMBO_WINDOW = 3; // seconds

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalize(dx: number, dy: number): [number, number] {
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.0001) return [0, 0];
  return [dx / len, dy / len];
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randRange(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo: number, hi: number): number {
  return Math.floor(randRange(lo, hi + 1));
}

/** Enemy speed based on score (faster every 10 carrots). */
export function getEnemySpeed(score: number): number {
  const bonus = Math.floor(score / 10) * ENEMY_SPEED_PER_10;
  return Math.min(ENEMY_BASE_SPEED + bonus, ENEMY_MAX_SPEED);
}

/** Random position on canvas, margin from edges. */
export function randomPos(margin = 60, w = CANVAS_W, h = CANVAS_H): [number, number] {
  return [randRange(margin, w - margin), randRange(margin, h - margin)];
}

/** Random position far enough from a point. */
export function randomPosFarFrom(
  fx: number, fy: number,
  minDist = 120,
  margin = 60,
  w = CANVAS_W,
  h = CANVAS_H,
  maxTries = 30
): [number, number] {
  for (let i = 0; i < maxTries; i++) {
    const [x, y] = randomPos(margin, w, h);
    if (dist(x, y, fx, fy) >= minDist) return [x, y];
  }
  return randomPos(margin, w, h);
}
