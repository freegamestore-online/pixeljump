import { describe, expect, it } from "vitest";
import { clamp, dist, normalize, lerp, randRange, getEnemySpeed, ENEMY_BASE_SPEED, ENEMY_MAX_SPEED } from "./logic";

describe("clamp", () => {
  it("clamps within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe("dist", () => {
  it("computes Euclidean distance", () => {
    expect(dist(0, 0, 3, 4)).toBeCloseTo(5);
    expect(dist(1, 1, 1, 1)).toBe(0);
  });
});

describe("normalize", () => {
  it("returns unit vector", () => {
    const [nx, ny] = normalize(3, 4);
    expect(Math.sqrt(nx * nx + ny * ny)).toBeCloseTo(1);
  });
  it("handles zero vector", () => {
    expect(normalize(0, 0)).toEqual([0, 0]);
  });
});

describe("lerp", () => {
  it("interpolates correctly", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe("randRange", () => {
  it("stays within bounds", () => {
    for (let i = 0; i < 100; i++) {
      const v = randRange(5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
});

describe("getEnemySpeed", () => {
  it("starts at base speed", () => {
    expect(getEnemySpeed(0)).toBe(ENEMY_BASE_SPEED);
  });
  it("increases with score", () => {
    expect(getEnemySpeed(10)).toBeGreaterThan(getEnemySpeed(0));
  });
  it("caps at max speed", () => {
    expect(getEnemySpeed(10000)).toBe(ENEMY_MAX_SPEED);
  });
});
