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

export const ENEMY_BASE_SPEED = 90;   // was 155 — noticeably slower start
export const ENEMY_SPEED_PER_10 = 12; // was 18 — gentler ramp per 10 carrots
export const ENEMY_MAX_SPEED = 210;   // was 340 — lower ceiling

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

/** Keep a point inside the canvas bounds with padding. */
export function clampToCanvas(x: number, y: number, pad = 0): [number, number] {
  return [clamp(x, pad, CANVAS_W - pad), clamp(y, pad, CANVAS_H - pad)];
}

/** Random position anywhere on the canvas with edge padding. */
export function randomPos(pad = 40): [number, number] {
  return [randRange(pad, CANVAS_W - pad), randRange(pad, CANVAS_H - pad)];
}

/** Random position at least minDist away from (ax, ay). */
export function randomPosFarFrom(ax: number, ay: number, minDist = 120, pad = 40): [number, number] {
  let x: number, y: number;
  let attempts = 0;
  do {
    x = randRange(pad, CANVAS_W - pad);
    y = randRange(pad, CANVAS_H - pad);
    attempts++;
  } while (dist(x, y, ax, ay) < minDist && attempts < 50);
  return [x, y];
}
