import { describe, expect, it } from "vitest";
import { clamp, dist, normalize, getLaserCooldown, getEnemySpeed } from "./logic";

describe("clamp", () => {
  it("bounds a value within the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("dist", () => {
  it("computes Euclidean distance", () => {
    expect(dist(0, 0, 3, 4)).toBeCloseTo(5);
    expect(dist(0, 0, 0, 0)).toBe(0);
  });
});

describe("normalize", () => {
  it("returns a unit vector", () => {
    const [nx, ny] = normalize(3, 4);
    expect(Math.sqrt(nx * nx + ny * ny)).toBeCloseTo(1);
  });
  it("handles zero vector", () => {
    expect(normalize(0, 0)).toEqual([0, 0]);
  });
});

describe("getLaserCooldown", () => {
  it("starts high and decreases over time", () => {
    const start = getLaserCooldown(0);
    const later = getLaserCooldown(60);
    expect(start).toBeGreaterThan(later);
  });
});

describe("getEnemySpeed", () => {
  it("increases over time", () => {
    const slow = getEnemySpeed(0);
    const fast = getEnemySpeed(60);
    expect(fast).toBeGreaterThan(slow);
  });
});
