export type GamePhase = "menu" | "playing" | "paused" | "over";

export type PowerUpType = "speed" | "freeze" | "double" | "shield";

export interface Vec2 {
  x: number;
  y: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

export interface ParticleData {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  color: string;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  vy: number;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  life: number;
}

export interface GameStats {
  score: number;
  highScore: number;
  timeAlive: number;
  carrotsCollected: number;
  powerUpsCollected: number;
  won: boolean;
  maxCombo: number;
}
