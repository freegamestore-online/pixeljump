import { useRef, useEffect, useCallback, useState } from "react";
import type { GamePhase, ParticleData, FloatingText, Achievement, GameStats, PowerUpType, TrailPoint } from "../types";
import {
  CANVAS_W, CANVAS_H,
  PLAYER_RADIUS, ENEMY_RADIUS, CARROT_RADIUS, POWERUP_RADIUS,
  PLAYER_ACCEL, PLAYER_FRICTION, PLAYER_MAX_SPEED,
  ROUND_SECONDS, POWERUP_SPAWN_INTERVAL, COMBO_WINDOW,
  clamp, dist, normalize, lerp, randRange, randomPos, randomPosFarFrom,
  getEnemySpeed,
} from "../lib/logic";
import { AudioManager } from "../lib/audio";

// ─── Constants ────────────────────────────────────────────────────────────────
const TRAIL_MAX = 18;
const PARTICLE_POOL = 300;
const FLOAT_LIFETIME = 1.4;
const ACHIEVEMENT_LIFETIME = 3.5;
const SHAKE_DECAY = 0.85;
const GRID_SIZE = 60;

const POWERUP_COLORS: Record<PowerUpType, string> = {
  speed: "#00ffaa",
  freeze: "#00ccff",
  double: "#ffcc00",
  shield: "#cc44ff",
};
const POWERUP_LABELS: Record<PowerUpType, string> = {
  speed: "⚡ SPEED",
  freeze: "❄ FREEZE",
  double: "✕2 DOUBLE",
  shield: "🛡 SHIELD",
};
const POWERUP_DURATIONS: Record<PowerUpType, number> = {
  speed: 5,
  freeze: 3,
  double: 10,
  shield: 0, // consumed on hit
};
const POWERUP_TYPES: PowerUpType[] = ["speed", "freeze", "double", "shield"];

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface PlayerState {
  x: number; y: number;
  vx: number; vy: number;
  trail: TrailPoint[];
  activeEffects: Partial<Record<PowerUpType, number>>; // remaining seconds
  hasShield: boolean;
}

interface EnemyState {
  x: number; y: number;
  vx: number; vy: number;
  trail: TrailPoint[];
  frozen: number; // remaining freeze time
}

interface CarrotState {
  x: number; y: number;
  pulse: number; // animation phase
}

interface PowerUpState {
  x: number; y: number;
  type: PowerUpType;
  pulse: number;
  id: number;
}

interface GameState {
  phase: GamePhase;
  score: number;
  highScore: number;
  timeLeft: number;
  elapsed: number;
  lastSecondTick: number;
  player: PlayerState;
  enemy: EnemyState;
  carrot: CarrotState;
  powerUp: PowerUpState | null;
  powerUpTimer: number;
  particles: ParticleData[];
  floats: FloatingText[];
  achievements: Achievement[];
  shakeX: number;
  shakeY: number;
  shakeMag: number;
  comboCount: number;
  comboTimer: number;
  maxCombo: number;
  carrotsCollected: number;
  powerUpsCollected: number;
  bgHue: number;
  bgHueTarget: number;
  bgHueTimer: number;
  particleIdCounter: number;
  floatIdCounter: number;
  fps: number;
  fpsFrames: number;
  fpsTimer: number;
  won: boolean;
  stats: GameStats | null;
  fadeAlpha: number;
  fadingIn: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface GameComponentProps {
  audio: AudioManager;
  onPhaseChange: (p: GamePhase) => void;
  onScore: (s: number) => void;
  onHighScore: (s: number) => void;
  initialHighScore: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeParticle(
  id: number,
  x: number, y: number,
  color: string,
  count = 1,
  speedMult = 1
): ParticleData[] {
  const out: ParticleData[] = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(60, 220) * speedMult;
    out.push({
      id: id + i,
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: randRange(0.4, 0.9),
      r: randRange(3, 8),
      color,
    });
  }
  return out;
}

function makeFloat(id: number, x: number, y: number, text: string, color: string): FloatingText {
  return { id, x, y, text, color, life: FLOAT_LIFETIME, maxLife: FLOAT_LIFETIME, vy: -55 };
}

function initPlayer(hs: number): GameState {
  const [px, py] = [CANVAS_W / 2, CANVAS_H / 2];
  const [ex, ey] = randomPosFarFrom(px, py, 200);
  const [cx, cy] = randomPosFarFrom(px, py, 100);
  return {
    phase: "playing",
    score: 0,
    highScore: hs,
    timeLeft: ROUND_SECONDS,
    elapsed: 0,
    lastSecondTick: 0,
    player: {
      x: px, y: py, vx: 0, vy: 0,
      trail: [],
      activeEffects: {},
      hasShield: false,
    },
    enemy: {
      x: ex, y: ey, vx: 0, vy: 0,
      trail: [],
      frozen: 0,
    },
    carrot: { x: cx, y: cy, pulse: 0 },
    powerUp: null,
    powerUpTimer: POWERUP_SPAWN_INTERVAL,
    particles: [],
    floats: [],
    achievements: [],
    shakeX: 0, shakeY: 0, shakeMag: 0,
    comboCount: 0,
    comboTimer: 0,
    maxCombo: 0,
    carrotsCollected: 0,
    powerUpsCollected: 0,
    bgHue: 220,
    bgHueTarget: 220,
    bgHueTimer: 0,
    particleIdCounter: 0,
    floatIdCounter: 0,
    fps: 60,
    fpsFrames: 0,
    fpsTimer: 0,
    won: false,
    stats: null,
    fadeAlpha: 1,
    fadingIn: true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GameComponent({ audio, onPhaseChange, onScore, onHighScore, initialHighScore }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(initPlayer(initialHighScore));
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [uiPhase, setUiPhase] = useState<GamePhase>("playing");

  // Touch joystick
  const joystickRef = useRef({ active: false, baseX: 0, baseY: 0, tipX: 0, tipY: 0, dx: 0, dy: 0 });

  // ── Input ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.type === "keydown") {
        keysRef.current.add(e.key);
        if (e.key === "p" || e.key === "P" || e.key === "Escape") {
          togglePause();
        }
      } else {
        keysRef.current.delete(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  });

  // ── Touch joystick ─────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = CANVAS_W / rect.width;
    const bx = (t.clientX - rect.left) * scale;
    const by = (t.clientY - rect.top) * scale;
    joystickRef.current = { active: true, baseX: bx, baseY: by, tipX: bx, tipY: by, dx: 0, dy: 0 };
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = CANVAS_W / rect.width;
    const tx = (t.clientX - rect.left) * scale;
    const ty = (t.clientY - rect.top) * scale;
    const j = joystickRef.current;
    const ddx = tx - j.baseX;
    const ddy = ty - j.baseY;
    const len = Math.sqrt(ddx * ddx + ddy * ddy);
    const maxR = 60;
    const clamped = Math.min(len, maxR);
    const [nx, ny] = len > 0 ? [ddx / len, ddy / len] : [0, 0];
    joystickRef.current = {
      ...j,
      tipX: j.baseX + nx * clamped,
      tipY: j.baseY + ny * clamped,
      dx: nx * (clamped / maxR),
      dy: ny * (clamped / maxR),
    };
  }, []);

  const onTouchEnd = useCallback(() => {
    joystickRef.current = { active: false, baseX: 0, baseY: 0, tipX: 0, tipY: 0, dx: 0, dy: 0 };
  }, []);

  // ── Pause toggle ───────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "playing") {
      s.phase = "paused";
      setUiPhase("paused");
      onPhaseChange("paused");
    } else if (s.phase === "paused") {
      s.phase = "playing";
      setUiPhase("playing");
      onPhaseChange("playing");
      lastTimeRef.current = performance.now();
    }
  }, [onPhaseChange]);

  const restart = useCallback(() => {
    audio.buttonClick();
    const hs = stateRef.current.highScore;
    stateRef.current = initPlayer(hs);
    setUiPhase("playing");
    onPhaseChange("playing");
    lastTimeRef.current = performance.now();
  }, [audio, onPhaseChange]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const rawDt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const dt = Math.min(rawDt, 0.05);

      const s = stateRef.current;

      // FPS
      s.fpsFrames++;
      s.fpsTimer += dt;
      if (s.fpsTimer >= 0.5) {
        s.fps = Math.round(s.fpsFrames / s.fpsTimer);
        s.fpsFrames = 0;
        s.fpsTimer = 0;
      }

      // Fade in
      if (s.fadingIn) {
        s.fadeAlpha = Math.max(0, s.fadeAlpha - dt * 2);
        if (s.fadeAlpha <= 0) s.fadingIn = false;
      }

      if (s.phase === "playing") {
        update(s, dt, keysRef.current, joystickRef.current, audio, onScore, onHighScore, setUiPhase, onPhaseChange);
      }

      render(ctx, s, joystickRef.current);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audio, onScore, onHighScore, onPhaseChange]);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="block max-w-full max-h-full"
        style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* Pause overlay */}
      {uiPhase === "paused" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="text-5xl font-black" style={{ fontFamily: "Fraunces, serif", color: "#fff", textShadow: "0 0 30px #f55" }}>
            PAUSED
          </div>
          <button
            className="px-8 py-3 rounded-xl text-xl font-bold text-white"
            style={{ background: "linear-gradient(135deg,#e53e3e,#c53030)", boxShadow: "0 0 20px #e53e3e88" }}
            onClick={() => { audio.buttonClick(); togglePause(); }}
          >▶ Resume</button>
          <button
            className="px-8 py-3 rounded-xl text-xl font-bold text-white"
            style={{ background: "linear-gradient(135deg,#2d3748,#1a202c)", boxShadow: "0 0 20px #44444488" }}
            onClick={restart}
          >↺ Restart</button>
        </div>
      )}

      {/* Game Over overlay */}
      {uiPhase === "over" && (
        <GameOverScreen
          stats={stateRef.current.stats}
          audio={audio}
          onRestart={restart}
        />
      )}
    </div>
  );
}

// ─── Game Over Screen ─────────────────────────────────────────────────────────
function GameOverScreen({ stats, audio, onRestart }: {
  stats: GameStats | null;
  audio: AudioManager;
  onRestart: () => void;
}) {
  if (!stats) return null;
  const won = stats.won;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
      <div className="text-5xl font-black" style={{ fontFamily: "Fraunces, serif", color: won ? "#00ffaa" : "#ff4444", textShadow: `0 0 40px ${won ? "#00ffaa" : "#ff4444"}` }}>
        {won ? "YOU ESCAPED!" : "CAUGHT!"}
      </div>
      <div className="text-xl" style={{ color: won ? "#aaffcc" : "#ffaaaa" }}>
        {won ? "You survived the full 60 seconds!" : "The Blue Dot caught you!"}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-2 text-center">
        {[
          ["Score", stats.score],
          ["High Score", stats.highScore],
          ["Time Alive", `${stats.timeAlive.toFixed(1)}s`],
          ["Carrots", stats.carrotsCollected],
          ["Power-Ups", stats.powerUpsCollected],
          ["Max Combo", `x${stats.maxCombo}`],
        ].map(([label, val]) => (
          <div key={label} className="px-5 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="text-xs uppercase tracking-widest" style={{ color: "#888" }}>{label}</div>
            <div className="text-2xl font-bold text-white">{val}</div>
          </div>
        ))}
      </div>
      <button
        className="mt-4 px-10 py-3 rounded-xl text-xl font-bold text-white"
        style={{ background: "linear-gradient(135deg,#e53e3e,#c53030)", boxShadow: "0 0 24px #e53e3e88" }}
        onClick={() => { audio.buttonClick(); onRestart(); }}
      >↺ Play Again</button>
    </div>
  );
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(
  s: GameState,
  dt: number,
  keys: Set<string>,
  joystick: { active: boolean; dx: number; dy: number },
  audio: AudioManager,
  onScore: (n: number) => void,
  onHighScore: (n: number) => void,
  setUiPhase: (p: GamePhase) => void,
  onPhaseChange: (p: GamePhase) => void,
) {
  s.elapsed += dt;

  // ── Background hue animation ─────────────────────────────────────────────
  s.bgHueTimer -= dt;
  if (s.bgHueTimer <= 0) {
    s.bgHueTarget = randRange(180, 280);
    s.bgHueTimer = randRange(8, 16);
  }
  s.bgHue = lerp(s.bgHue, s.bgHueTarget, dt * 0.3);

  // ── Timer ────────────────────────────────────────────────────────────────
  const prevSecond = Math.ceil(s.timeLeft);
  s.timeLeft = Math.max(0, s.timeLeft - dt);
  const newSecond = Math.ceil(s.timeLeft);
  if (newSecond < prevSecond && s.timeLeft <= 10 && s.timeLeft > 0) {
    audio.countdownWarning();
  }

  // ── Win condition ─────────────────────────────────────────────────────────
  if (s.timeLeft <= 0) {
    endGame(s, true, audio, onHighScore, setUiPhase, onPhaseChange);
    return;
  }

  // ── Combo timer ──────────────────────────────────────────────────────────
  if (s.comboTimer > 0) {
    s.comboTimer -= dt;
    if (s.comboTimer <= 0) s.comboCount = 0;
  }

  // ── Active effects ────────────────────────────────────────────────────────
  for (const key of Object.keys(s.player.activeEffects) as PowerUpType[]) {
    const rem = (s.player.activeEffects[key] ?? 0) - dt;
    if (rem <= 0) {
      delete s.player.activeEffects[key];
    } else {
      s.player.activeEffects[key] = rem;
    }
  }

  // ── Enemy freeze ─────────────────────────────────────────────────────────
  if (s.enemy.frozen > 0) s.enemy.frozen -= dt;

  // ── Player movement ───────────────────────────────────────────────────────
  let inputX = 0;
  let inputY = 0;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) inputX -= 1;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) inputX += 1;
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) inputY -= 1;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) inputY += 1;
  if (joystick.active) { inputX = joystick.dx; inputY = joystick.dy; }

  const len = Math.sqrt(inputX * inputX + inputY * inputY);
  if (len > 1) { inputX /= len; inputY /= len; }

  const speedMult = s.player.activeEffects.speed ? 1.55 : 1;
  s.player.vx += inputX * PLAYER_ACCEL * dt;
  s.player.vy += inputY * PLAYER_ACCEL * dt;
  s.player.vx *= Math.pow(PLAYER_FRICTION, dt * 60);
  s.player.vy *= Math.pow(PLAYER_FRICTION, dt * 60);

  const maxSpd = PLAYER_MAX_SPEED * speedMult;
  const spd = Math.sqrt(s.player.vx * s.player.vx + s.player.vy * s.player.vy);
  if (spd > maxSpd) {
    s.player.vx = (s.player.vx / spd) * maxSpd;
    s.player.vy = (s.player.vy / spd) * maxSpd;
  }

  s.player.x = clamp(s.player.x + s.player.vx * dt, PLAYER_RADIUS, CANVAS_W - PLAYER_RADIUS);
  s.player.y = clamp(s.player.y + s.player.vy * dt, PLAYER_RADIUS, CANVAS_H - PLAYER_RADIUS);

  // Player trail
  s.player.trail.unshift({ x: s.player.x, y: s.player.y, age: 0 });
  if (s.player.trail.length > TRAIL_MAX) s.player.trail.pop();
  for (const t of s.player.trail) t.age += dt;

  // ── Enemy movement ────────────────────────────────────────────────────────
  if (s.enemy.frozen <= 0) {
    const [ndx, ndy] = normalize(s.player.x - s.enemy.x, s.player.y - s.enemy.y);
    const eSpd = getEnemySpeed(s.score);
    s.enemy.vx = lerp(s.enemy.vx, ndx * eSpd, dt * 3);
    s.enemy.vy = lerp(s.enemy.vy, ndy * eSpd, dt * 3);
    s.enemy.x = clamp(s.enemy.x + s.enemy.vx * dt, ENEMY_RADIUS, CANVAS_W - ENEMY_RADIUS);
    s.enemy.y = clamp(s.enemy.y + s.enemy.vy * dt, ENEMY_RADIUS, CANVAS_H - ENEMY_RADIUS);
  }

  // Enemy trail
  s.enemy.trail.unshift({ x: s.enemy.x, y: s.enemy.y, age: 0 });
  if (s.enemy.trail.length > TRAIL_MAX) s.enemy.trail.pop();
  for (const t of s.enemy.trail) t.age += dt;

  // ── Carrot pulse ──────────────────────────────────────────────────────────
  s.carrot.pulse += dt * 3;

  // ── Carrot collection ─────────────────────────────────────────────────────
  if (dist(s.player.x, s.player.y, s.carrot.x, s.carrot.y) < PLAYER_RADIUS + CARROT_RADIUS) {
    audio.collectCarrot();
    s.comboTimer = COMBO_WINDOW;
    s.comboCount++;
    if (s.comboCount > s.maxCombo) s.maxCombo = s.comboCount;
    const multiplier = s.player.activeEffects.double ? 2 : 1;
    const pts = multiplier * (s.comboCount >= 3 ? 2 : 1);
    s.score += pts;
    s.carrotsCollected++;
    onScore(s.score);

    // Particles
    const pid = s.particleIdCounter;
    s.particleIdCounter += 14;
    s.particles.push(...makeParticle(pid, s.carrot.x, s.carrot.y, "#ff8800", 8));
    s.particles.push(...makeParticle(pid + 8, s.carrot.x, s.carrot.y, "#ffcc00", 6));

    // Float text
    const fid = s.floatIdCounter++;
    const label = s.comboCount >= 3 ? `COMBO x${s.comboCount}! +${pts}` : `+${pts}`;
    const col = s.comboCount >= 3 ? "#ffcc00" : "#ffffff";
    s.floats.push(makeFloat(fid, s.carrot.x, s.carrot.y - 20, label, col));

    // Achievements
    if (s.carrotsCollected === 5) spawnAchievement(s, "🥕 Carrot Lover", "Collect 5 carrots");
    if (s.comboCount === 5) spawnAchievement(s, "🔥 Combo Master", "5-carrot combo!");

    // New carrot
    const [cx, cy] = randomPosFarFrom(s.player.x, s.player.y, 80 + s.score * 2);
    s.carrot = { x: cx, y: cy, pulse: 0 };
  }

  // ── Power-up spawn ────────────────────────────────────────────────────────
  s.powerUpTimer -= dt;
  if (s.powerUpTimer <= 0 && !s.powerUp) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)] ?? "speed";
    const [px, py] = randomPosFarFrom(s.player.x, s.player.y, 100);
    s.powerUp = { x: px, y: py, type, pulse: 0, id: s.particleIdCounter++ };
    s.powerUpTimer = POWERUP_SPAWN_INTERVAL;
  }

  // ── Power-up collection ───────────────────────────────────────────────────
  if (s.powerUp) {
    s.powerUp.pulse += dt * 4;
    if (dist(s.player.x, s.player.y, s.powerUp.x, s.powerUp.y) < PLAYER_RADIUS + POWERUP_RADIUS) {
      audio.collectPowerUp();
      const type = s.powerUp.type;
      s.powerUpsCollected++;

      if (type === "shield") {
        s.player.hasShield = true;
      } else if (type === "freeze") {
        s.enemy.frozen = POWERUP_DURATIONS.freeze;
      } else {
        s.player.activeEffects[type] = POWERUP_DURATIONS[type];
      }

      // Particles
      const col = POWERUP_COLORS[type];
      const pid = s.particleIdCounter;
      s.particleIdCounter += 16;
      s.particles.push(...makeParticle(pid, s.powerUp.x, s.powerUp.y, col, 16, 1.3));

      const fid = s.floatIdCounter++;
      s.floats.push(makeFloat(fid, s.powerUp.x, s.powerUp.y - 20, POWERUP_LABELS[type], col));
      spawnAchievement(s, "⚡ Power Up!", `Collected ${POWERUP_LABELS[type]}`);

      s.powerUp = null;
    }
  }

  // ── Enemy collision ───────────────────────────────────────────────────────
  if (dist(s.player.x, s.player.y, s.enemy.x, s.enemy.y) < PLAYER_RADIUS + ENEMY_RADIUS) {
    if (s.player.hasShield) {
      s.player.hasShield = false;
      audio.shieldHit();
      s.shakeMag = 12;
      const fid = s.floatIdCounter++;
      s.floats.push(makeFloat(fid, s.player.x, s.player.y - 30, "🛡 SHIELD!", "#cc44ff"));
      // Push enemy back
      const [ndx, ndy] = normalize(s.enemy.x - s.player.x, s.enemy.y - s.player.y);
      s.enemy.x += ndx * 80;
      s.enemy.y += ndy * 80;
      s.enemy.vx = ndx * 200;
      s.enemy.vy = ndy * 200;
    } else {
      s.shakeMag = 28;
      endGame(s, false, audio, onHighScore, setUiPhase, onPhaseChange);
      return;
    }
  }

  // ── Camera shake ──────────────────────────────────────────────────────────
  if (s.shakeMag > 0.5) {
    s.shakeX = (Math.random() - 0.5) * s.shakeMag * 2;
    s.shakeY = (Math.random() - 0.5) * s.shakeMag * 2;
    s.shakeMag *= SHAKE_DECAY;
  } else {
    s.shakeX = 0; s.shakeY = 0; s.shakeMag = 0;
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  for (const p of s.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 3;
    p.vy *= 1 - dt * 3;
    p.life -= dt / p.maxLife;
  }
  if (s.particles.length > PARTICLE_POOL) s.particles.splice(0, s.particles.length - PARTICLE_POOL);
  s.particles = s.particles.filter(p => p.life > 0);

  // ── Floating texts ────────────────────────────────────────────────────────
  for (const f of s.floats) {
    f.y += f.vy * dt;
    f.life -= dt;
  }
  s.floats = s.floats.filter(f => f.life > 0);

  // ── Achievements ──────────────────────────────────────────────────────────
  for (const a of s.achievements) a.life -= dt;
  s.achievements = s.achievements.filter(a => a.life > 0);
}

function spawnAchievement(s: GameState, title: string, desc: string) {
  if (s.achievements.some(a => a.id === title)) return;
  s.achievements.push({ id: title, title, desc, life: ACHIEVEMENT_LIFETIME });
}

function endGame(
  s: GameState,
  won: boolean,
  audio: AudioManager,
  onHighScore: (n: number) => void,
  setUiPhase: (p: GamePhase) => void,
  onPhaseChange: (p: GamePhase) => void,
) {
  s.phase = "over";
  s.won = won;
  if (s.score > s.highScore) {
    s.highScore = s.score;
    onHighScore(s.score);
  }
  if (won) audio.victory(); else audio.gameOver();
  s.stats = {
    score: s.score,
    highScore: s.highScore,
    timeAlive: ROUND_SECONDS - s.timeLeft,
    carrotsCollected: s.carrotsCollected,
    powerUpsCollected: s.powerUpsCollected,
    won,
    maxCombo: s.maxCombo,
  };
  setUiPhase("over");
  onPhaseChange("over");
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(ctx: CanvasRenderingContext2D, s: GameState, joystick: { active: boolean; baseX: number; baseY: number; tipX: number; tipY: number }) {
  ctx.save();
  ctx.translate(s.shakeX, s.shakeY);

  // Background
  const bg = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 0, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.8);
  bg.addColorStop(0, `hsl(${s.bgHue},30%,10%)`);
  bg.addColorStop(1, `hsl(${s.bgHue},20%,4%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Grid
  ctx.save();
  ctx.strokeStyle = `hsla(${s.bgHue},40%,60%,0.06)`;
  ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_W; x += GRID_SIZE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_H; y += GRID_SIZE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }
  ctx.restore();

  // Trails
  drawTrail(ctx, s.player.trail, "#ff4444", PLAYER_RADIUS);
  drawTrail(ctx, s.enemy.trail, "#4488ff", ENEMY_RADIUS);

  // Carrot
  drawCarrot(ctx, s.carrot);

  // Power-up
  if (s.powerUp) drawPowerUp(ctx, s.powerUp);

  // Particles
  for (const p of s.particles) {
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Enemy
  drawEnemy(ctx, s.enemy);

  // Player
  drawPlayer(ctx, s.player);

  // Floating texts
  for (const f of s.floats) {
    const alpha = Math.min(1, f.life / f.maxLife * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "bold 18px Manrope, sans-serif";
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 12;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }

  // HUD
  drawHUD(ctx, s);

  // Achievements
  drawAchievements(ctx, s.achievements);

  // Touch joystick
  if (joystick.active) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(joystick.baseX, joystick.baseY, 55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(joystick.tipX, joystick.tipY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Fade
  if (s.fadeAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = s.fadeAlpha;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  ctx.restore();
}

function drawTrail(ctx: CanvasRenderingContext2D, trail: TrailPoint[], color: string, maxR: number) {
  for (let i = 0; i < trail.length; i++) {
    const t = trail[i];
    if (!t) continue;
    const alpha = (1 - i / trail.length) * 0.25;
    const r = maxR * (1 - i / trail.length) * 0.7;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerState) {
  const x = p.x, y = p.y, r = PLAYER_RADIUS;

  // Shield ring
  if (p.hasShield) {
    ctx.save();
    ctx.strokeStyle = "#cc44ff";
    ctx.shadowColor = "#cc44ff";
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() / 200);
    ctx.beginPath();
    ctx.arc(x, y, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Speed ring
  if (p.activeEffects.speed) {
    ctx.save();
    ctx.strokeStyle = "#00ffaa";
    ctx.shadowColor = "#00ffaa";
    ctx.shadowBlur = 15;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Glow
  ctx.save();
  ctx.shadowColor = "#ff4444";
  ctx.shadowBlur = 28;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, "#ff8888");
  g.addColorStop(0.6, "#ff2222");
  g.addColorStop(1, "#cc0000");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Shine
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyState) {
  const x = e.x, y = e.y, r = ENEMY_RADIUS;
  const frozen = e.frozen > 0;

  ctx.save();
  ctx.shadowColor = frozen ? "#00ccff" : "#4488ff";
  ctx.shadowBlur = 32;

  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  if (frozen) {
    g.addColorStop(0, "#aaeeff");
    g.addColorStop(0.6, "#00ccff");
    g.addColorStop(1, "#0066cc");
  } else {
    g.addColorStop(0, "#88aaff");
    g.addColorStop(0.6, "#2255ff");
    g.addColorStop(1, "#0022cc");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Shine
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Frozen snowflake indicator
  if (frozen) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#ffffff";
    ctx.font = `${r}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❄", x, y);
  }

  ctx.restore();
}

function drawCarrot(ctx: CanvasRenderingContext2D, c: CarrotState) {
  const x = c.x, y = c.y;
  const bob = Math.sin(c.pulse) * 3;
  const scale = 1 + Math.sin(c.pulse * 1.5) * 0.08;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);
  ctx.shadowColor = "#ff8800";
  ctx.shadowBlur = 20;

  // Body
  ctx.fillStyle = "#ff8800";
  ctx.beginPath();
  ctx.ellipse(0, 3, CARROT_RADIUS * 0.7, CARROT_RADIUS, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Top
  ctx.fillStyle = "#44cc44";
  ctx.beginPath();
  ctx.ellipse(-2, -CARROT_RADIUS + 2, 4, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(2, -CARROT_RADIUS, 3, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUpState) {
  const x = pu.x, y = pu.y, r = POWERUP_RADIUS;
  const col = POWERUP_COLORS[pu.type];
  const bob = Math.sin(pu.pulse) * 4;
  const pulse = 1 + Math.sin(pu.pulse * 2) * 0.12;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.shadowColor = col;
  ctx.shadowBlur = 25 + 10 * Math.sin(pu.pulse * 2);

  // Outer ring
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5 + 0.3 * Math.sin(pu.pulse * 2);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  // Inner fill
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.4, col);
  g.addColorStop(1, col + "88");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Icon
  ctx.fillStyle = "#000";
  ctx.font = `${r}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const icons: Record<PowerUpType, string> = { speed: "⚡", freeze: "❄", double: "✕", shield: "🛡" };
  ctx.fillText(icons[pu.type], 0, 1);

  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, s: GameState) {
  // Top bar background
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, CANVAS_W, 44);

  // Score
  ctx.font = "bold 18px Manrope, sans-serif";
  ctx.fillStyle = "#ff8888";
  ctx.shadowColor = "#ff4444";
  ctx.shadowBlur = 8;
  ctx.textAlign = "left";
  ctx.fillText(`🥕 ${s.score}`, 12, 28);

  // High score
  ctx.fillStyle = "#ffcc44";
  ctx.shadowColor = "#ffaa00";
  ctx.textAlign = "center";
  ctx.fillText(`⭐ ${s.highScore}`, CANVAS_W / 2, 28);

  // Timer
  const urgent = s.timeLeft <= 10;
  ctx.fillStyle = urgent ? "#ff4444" : "#aaffcc";
  ctx.shadowColor = urgent ? "#ff0000" : "#00ff88";
  ctx.shadowBlur = urgent ? 16 : 6;
  ctx.textAlign = "right";
  ctx.fillText(`⏱ ${Math.ceil(s.timeLeft)}s`, CANVAS_W - 12, 28);

  // FPS
  ctx.font = "11px Manrope, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.fillText(`${s.fps} FPS`, 12, CANVAS_H - 8);

  // Combo
  if (s.comboCount >= 2 && s.comboTimer > 0) {
    ctx.font = "bold 22px Fraunces, serif";
    ctx.fillStyle = "#ffcc00";
    ctx.shadowColor = "#ffaa00";
    ctx.shadowBlur = 16;
    ctx.textAlign = "center";
    ctx.fillText(`🔥 COMBO x${s.comboCount}`, CANVAS_W / 2, CANVAS_H - 20);
  }

  // Active effects bar
  let ex = 12;
  const effectY = 56;
  for (const [key, rem] of Object.entries(s.player.activeEffects) as [PowerUpType, number][]) {
    const col = POWERUP_COLORS[key];
    ctx.fillStyle = col + "33";
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(ex, effectY, 90, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = "bold 11px Manrope, sans-serif";
    ctx.textAlign = "left";
    ctx.shadowBlur = 0;
    ctx.fillText(`${POWERUP_LABELS[key]} ${rem.toFixed(1)}s`, ex + 5, effectY + 13);
    ex += 96;
  }
  if (s.player.hasShield) {
    const col = POWERUP_COLORS.shield;
    ctx.fillStyle = col + "33";
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.roundRect(ex, effectY, 80, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = "bold 11px Manrope, sans-serif";
    ctx.textAlign = "left";
    ctx.shadowBlur = 0;
    ctx.fillText("🛡 SHIELD", ex + 5, effectY + 13);
  }

  ctx.restore();
}

function drawAchievements(ctx: CanvasRenderingContext2D, achievements: Achievement[]) {
  achievements.forEach((a, i) => {
    const alpha = Math.min(1, a.life / ACHIEVEMENT_LIFETIME * 3, (ACHIEVEMENT_LIFETIME - a.life) * 4 / ACHIEVEMENT_LIFETIME * 3);
    const y = CANVAS_H - 80 - i * 56;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.roundRect(CANVAS_W - 210, y, 198, 46, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffcc00";
    ctx.font = "bold 13px Manrope, sans-serif";
    ctx.textAlign = "left";
    ctx.shadowBlur = 0;
    ctx.fillText(a.title, CANVAS_W - 200, y + 17);
    ctx.fillStyle = "#aaaaaa";
    ctx.font = "11px Manrope, sans-serif";
    ctx.fillText(a.desc, CANVAS_W - 200, y + 34);
    ctx.restore();
  });
}
