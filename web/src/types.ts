export type GamePhase = "menu" | "playing" | "over";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Laser {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  color: string;
}
