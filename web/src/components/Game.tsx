import { useRef, useEffect, useCallback } from "react";
import type { Laser, Particle } from "../types";
import {
  PLAYER_RADIUS,
  ENEMY_RADIUS,
  ENEMY_HEAD_RADIUS,
  LASER_RADIUS,
  LASER_SPEED,
  LASER_LIFETIME,
  PLAYER_SPEED,
  clamp,
  dist,
  normalize,
  getLaserCooldown,
  getEnemySpeed,
} from "../lib/logic";

export interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
}

// ── Input state (ref-based, no re-renders) ────────────────────────────────────
interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  touchX: number | null;
  touchY: number | null;
}

export function Game({ onScore, onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<InputState>({
    left: false, right: false, up: false, down: false,
    touchX: null, touchY: null,
  });
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // ── Game state (all in refs so loop is cheap) ─────────────────────────────
  const playerRef = useRef({ x: 0, y: 0 });
  const enemyRef  = useRef({ x: 0, y: 0, shootTimer: 2.0 });
  const lasersRef = useRef<Laser[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const elapsedRef  = useRef(0);
  const scoreRef    = useRef(0);
  const laserIdRef  = useRef(0);
  const aliveRef    = useRef(true);
  // Joystick refs
  const joyActiveRef   = useRef(false);
  const joyStartRef    = useRef({ x: 0, y: 0 });
  const joyCurrentRef  = useRef({ x: 0, y: 0 });

  const spawnParticles = useCallback(
    (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 200;
        particlesRef.current.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.4 + Math.random() * 0.4,
          maxLife: 0.8,
          r: 3 + Math.random() * 5,
          color,
        });
      }
    },
    []
  );

  // ── Main game loop ────────────────────────────────────────────────────────
  const loop = useCallback(
    (now: number) => {
      if (!aliveRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      elapsedRef.current += dt;

      const W = canvas.width;
      const H = canvas.height;
      const inp = inputRef.current;
      const player = playerRef.current;
      const enemy  = enemyRef.current;

      // ── Player movement ─────────────────────────────────────────────────
      let dx = 0;
      let dy = 0;

      if (joyActiveRef.current) {
        const jdx = joyCurrentRef.current.x - joyStartRef.current.x;
        const jdy = joyCurrentRef.current.y - joyStartRef.current.y;
        const jlen = Math.sqrt(jdx * jdx + jdy * jdy);
        if (jlen > 10) {
          dx = jdx / jlen;
          dy = jdy / jlen;
        }
      } else {
        if (inp.left)  dx -= 1;
        if (inp.right) dx += 1;
        if (inp.up)    dy -= 1;
        if (inp.down)  dy += 1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) { dx /= len; dy /= len; }
      }

      player.x = clamp(player.x + dx * PLAYER_SPEED * dt, PLAYER_RADIUS, W - PLAYER_RADIUS);
      player.y = clamp(player.y + dy * PLAYER_SPEED * dt, PLAYER_RADIUS, H - PLAYER_RADIUS);

      // ── Enemy chases player ─────────────────────────────────────────────
      const speed = getEnemySpeed(elapsedRef.current);
      const [ex, ey] = normalize(player.x - enemy.x, player.y - enemy.y);
      enemy.x = clamp(enemy.x + ex * speed * dt, ENEMY_RADIUS, W - ENEMY_RADIUS);
      enemy.y = clamp(enemy.y + ey * speed * dt, ENEMY_RADIUS, H - ENEMY_RADIUS);

      // ── Enemy shoots laser ──────────────────────────────────────────────
      const cooldown = getLaserCooldown(elapsedRef.current);
      enemy.shootTimer -= dt;
      if (enemy.shootTimer <= 0) {
        enemy.shootTimer = cooldown;
        // Aim at player with slight prediction
        const predX = player.x + dx * 40;
        const predY = player.y + dy * 40;
        const [lvx, lvy] = normalize(predX - enemy.x, predY - enemy.y);
        lasersRef.current.push({
          id: laserIdRef.current++,
          x: enemy.x + lvx * (ENEMY_RADIUS + 4),
          y: enemy.y + lvy * (ENEMY_RADIUS + 4),
          vx: lvx * LASER_SPEED,
          vy: lvy * LASER_SPEED,
          age: 0,
        });
        // Muzzle flash particles
        spawnParticles(enemy.x, enemy.y, "#ff4444", 6);
      }

      // ── Update lasers ───────────────────────────────────────────────────
      lasersRef.current = lasersRef.current.filter((l) => {
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.age += dt;
        // Hit player?
        if (dist(l.x, l.y, player.x, player.y) < PLAYER_RADIUS + LASER_RADIUS) {
          spawnParticles(player.x, player.y, "#60a5fa", 20);
          aliveRef.current = false;
          onGameOver();
          return false;
        }
        return l.age < LASER_LIFETIME &&
          l.x > -20 && l.x < W + 20 &&
          l.y > -20 && l.y < H + 20;
      });

      // ── Enemy body collision ────────────────────────────────────────────
      if (dist(enemy.x, enemy.y, player.x, player.y) < ENEMY_RADIUS + PLAYER_RADIUS - 4) {
        spawnParticles(player.x, player.y, "#60a5fa", 20);
        aliveRef.current = false;
        onGameOver();
        return;
      }

      // ── Update particles ────────────────────────────────────────────────
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.88;
        p.vy *= 0.88;
        p.life -= dt;
        return p.life > 0;
      });

      // ── Score (time survived) ───────────────────────────────────────────
      const newScore = Math.floor(elapsedRef.current * 10);
      if (newScore !== scoreRef.current) {
        scoreRef.current = newScore;
        onScore(newScore);
      }

      // ── DRAW ────────────────────────────────────────────────────────────
      // Background
      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const gridSize = 48;
      for (let gx = 0; gx < W; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // Danger zone pulse when enemy is close
      const enemyDist = dist(enemy.x, enemy.y, player.x, player.y);
      if (enemyDist < 120) {
        const pulse = 0.15 * (1 - enemyDist / 120) * (0.5 + 0.5 * Math.sin(now / 80));
        ctx.fillStyle = `rgba(255,50,50,${pulse})`;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Draw lasers ─────────────────────────────────────────────────────
      for (const l of lasersRef.current) {
        const fadeIn = Math.min(l.age / 0.05, 1);
        const alpha = fadeIn * (1 - l.age / LASER_LIFETIME);

        // Glow
        const grad = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 18);
        grad.addColorStop(0, `rgba(255,80,80,${alpha * 0.8})`);
        grad.addColorStop(1, `rgba(255,0,0,0)`);
        ctx.beginPath();
        ctx.arc(l.x, l.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(l.x, l.y, LASER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,200,200,${alpha})`;
        ctx.fill();

        // Trail
        ctx.strokeStyle = `rgba(255,60,60,${alpha * 0.6})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x - l.vx * 0.06, l.y - l.vy * 0.06);
        ctx.stroke();
      }

      // ── Draw particles ──────────────────────────────────────────────────
      for (const p of particlesRef.current) {
        const alpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();
      }

      // ── Draw enemy ──────────────────────────────────────────────────────
      const t = now / 1000;
      // Body shadow
      ctx.beginPath();
      ctx.arc(enemy.x + 3, enemy.y + 4, ENEMY_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fill();

      // Body glow
      const bodyGlow = ctx.createRadialGradient(enemy.x, enemy.y, 0, enemy.x, enemy.y, ENEMY_RADIUS + 10);
      bodyGlow.addColorStop(0, "rgba(200,0,0,0.3)");
      bodyGlow.addColorStop(1, "rgba(200,0,0,0)");
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, ENEMY_RADIUS + 10, 0, Math.PI * 2);
      ctx.fillStyle = bodyGlow;
      ctx.fill();

      // Body
      const bodyGrad = ctx.createRadialGradient(
        enemy.x - 6, enemy.y - 6, 2,
        enemy.x, enemy.y, ENEMY_RADIUS
      );
      bodyGrad.addColorStop(0, "#ff6666");
      bodyGrad.addColorStop(0.5, "#cc1111");
      bodyGrad.addColorStop(1, "#880000");
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, ENEMY_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.strokeStyle = "#ff4444";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Red glowing "head" (a smaller bright orb on top)
      const headOffX = -4;
      const headOffY = -ENEMY_RADIUS + 4;
      const headGlow = ctx.createRadialGradient(
        enemy.x + headOffX, enemy.y + headOffY, 0,
        enemy.x + headOffX, enemy.y + headOffY, ENEMY_HEAD_RADIUS + 8
      );
      headGlow.addColorStop(0, "rgba(255,100,100,0.5)");
      headGlow.addColorStop(1, "rgba(255,0,0,0)");
      ctx.beginPath();
      ctx.arc(enemy.x + headOffX, enemy.y + headOffY, ENEMY_HEAD_RADIUS + 8, 0, Math.PI * 2);
      ctx.fillStyle = headGlow;
      ctx.fill();

      const headGrad = ctx.createRadialGradient(
        enemy.x + headOffX - 3, enemy.y + headOffY - 3, 1,
        enemy.x + headOffX, enemy.y + headOffY, ENEMY_HEAD_RADIUS
      );
      headGrad.addColorStop(0, "#ffaaaa");
      headGrad.addColorStop(0.4, "#ff3333");
      headGrad.addColorStop(1, "#cc0000");
      ctx.beginPath();
      ctx.arc(enemy.x + headOffX, enemy.y + headOffY, ENEMY_HEAD_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = headGrad;
      ctx.fill();

      // Eyes (glowing white dots that track player)
      const eyeAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      const eyeOffsets = [
        { a: eyeAngle - 0.35, d: 9 },
        { a: eyeAngle + 0.35, d: 9 },
      ];
      for (const eo of eyeOffsets) {
        const ex2 = enemy.x + Math.cos(eo.a) * eo.d;
        const ey2 = enemy.y + Math.sin(eo.a) * eo.d;
        ctx.beginPath();
        ctx.arc(ex2, ey2, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        // Pupil
        ctx.beginPath();
        ctx.arc(ex2 + Math.cos(eyeAngle), ey2 + Math.sin(eyeAngle), 2, 0, Math.PI * 2);
        ctx.fillStyle = "#110000";
        ctx.fill();
      }

      // Shoot charge indicator (pulsing ring before shooting)
      const shootProgress = 1 - (enemy.shootTimer / getLaserCooldown(elapsedRef.current));
      if (shootProgress > 0.5) {
        const ring = (shootProgress - 0.5) * 2;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, ENEMY_RADIUS + 4 + ring * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,80,80,${ring * 0.9})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // ── Draw player ─────────────────────────────────────────────────────
      // Shadow
      ctx.beginPath();
      ctx.arc(player.x + 3, player.y + 4, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fill();

      // Glow
      const playerGlow = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, PLAYER_RADIUS + 12);
      playerGlow.addColorStop(0, "rgba(96,165,250,0.35)");
      playerGlow.addColorStop(1, "rgba(96,165,250,0)");
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_RADIUS + 12, 0, Math.PI * 2);
      ctx.fillStyle = playerGlow;
      ctx.fill();

      // Body
      const playerGrad = ctx.createRadialGradient(
        player.x - 5, player.y - 5, 2,
        player.x, player.y, PLAYER_RADIUS
      );
      playerGrad.addColorStop(0, "#93c5fd");
      playerGrad.addColorStop(0.5, "#3b82f6");
      playerGrad.addColorStop(1, "#1d4ed8");
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = playerGrad;
      ctx.fill();
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Shine
      ctx.beginPath();
      ctx.arc(player.x - 5, player.y - 5, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();

      // ── Joystick HUD ────────────────────────────────────────────────────
      if (joyActiveRef.current) {
        const jx = joyStartRef.current.x;
        const jy = joyStartRef.current.y;
        const jcx = joyCurrentRef.current.x;
        const jcy = joyCurrentRef.current.y;
        const JR = 44;
        ctx.beginPath();
        ctx.arc(jx, jy, JR, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(jcx, jcy, 22, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();
      }

      // ── Elapsed time / difficulty label ─────────────────────────────────
      const secSurvived = Math.floor(elapsedRef.current);
      ctx.font = "bold 13px Manrope, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.textAlign = "right";
      ctx.fillText(`${secSurvived}s survived`, W - 12, H - 12);
      ctx.textAlign = "left";

      // Shoot warning flash
      if (enemy.shootTimer < 0.25) {
        const warnAlpha = (0.25 - enemy.shootTimer) / 0.25 * 0.18;
        ctx.fillStyle = `rgba(255,0,0,${warnAlpha})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Bobbing animation for enemy
      void t; // used implicitly above in t-based sin

      rafRef.current = requestAnimationFrame(loop);
    },
    [onScore, onGameOver, spawnParticles]
  );

  // ── Setup ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Place player in center, enemy in a corner
    playerRef.current = { x: canvas.width / 2, y: canvas.height / 2 };
    enemyRef.current  = { x: 60, y: 60, shootTimer: 2.0 };
    lasersRef.current = [];
    particlesRef.current = [];
    elapsedRef.current = 0;
    scoreRef.current = 0;
    aliveRef.current = true;

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      const inp = inputRef.current;
      switch (e.key) {
        case "ArrowLeft":  case "a": case "A": inp.left  = true; break;
        case "ArrowRight": case "d": case "D": inp.right = true; break;
        case "ArrowUp":    case "w": case "W": inp.up    = true; break;
        case "ArrowDown":  case "s": case "S": inp.down  = true; break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const inp = inputRef.current;
      switch (e.key) {
        case "ArrowLeft":  case "a": case "A": inp.left  = false; break;
        case "ArrowRight": case "d": case "D": inp.right = false; break;
        case "ArrowUp":    case "w": case "W": inp.up    = false; break;
        case "ArrowDown":  case "s": case "S": inp.down  = false; break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Touch joystick
    const getPos = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t) return;
      const pos = getPos(t);
      joyActiveRef.current  = true;
      joyStartRef.current   = pos;
      joyCurrentRef.current = pos;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (!t) return;
      joyCurrentRef.current = getPos(t);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 0) joyActiveRef.current = false;
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove",  onTouchMove,  { passive: false });
    canvas.addEventListener("touchend",   onTouchEnd,   { passive: false });

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove",  onTouchMove);
      canvas.removeEventListener("touchend",   onTouchEnd);
    };
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block touch-none"
      style={{ background: "#0f0f1a" }}
    />
  );
}
