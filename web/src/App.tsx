import { useRef, useState, useEffect, useCallback } from "react";
import { GameShell, GameTopbar } from "@freegamestore/games";
import { GameComponent } from "./components/Game";
import { useHighScore } from "./hooks/useHighScore";
import { AudioManager } from "./lib/audio";
import type { GamePhase } from "./types";

const audio = new AudioManager();

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useHighScore("redescape-highscore");
  const [round, setRound] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const menuCanvasRef = useRef<HTMLCanvasElement>(null);
  const menuRafRef = useRef<number>(0);

  const handleScore = useCallback((s: number) => setScore(s), []);
  const handleHighScore = useCallback((s: number) => setHighScore(s), [setHighScore]);

  const startGame = useCallback(() => {
    audio.buttonClick();
    if (!audio.isMuted) audio.unmute();
    setScore(0);
    setRound((r) => r + 1);
    setPhase("playing");
  }, []);

  const toggleSound = useCallback(() => {
    const on = audio.toggle();
    setSoundOn(on);
    if (on) audio.buttonClick();
  }, []);

  // Animated menu background
  useEffect(() => {
    if (phase !== "menu") return;
    const canvas = menuCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let t = 0;
    const dots: Array<{ x: number; y: number; vx: number; vy: number; r: number; color: string }> = [];
    for (let i = 0; i < 8; i++) {
      dots.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        vx: (Math.random() - 0.5) * 60,
        vy: (Math.random() - 0.5) * 60,
        r: 8 + Math.random() * 18,
        color: Math.random() > 0.5 ? "#ff4444" : "#4488ff",
      });
    }

    const draw = (dt: number) => {
      t += dt;
      ctx.fillStyle = "#060810";
      ctx.fillRect(0, 0, 800, 600);

      // Grid
      ctx.strokeStyle = `hsla(220,40%,60%,0.05)`;
      ctx.lineWidth = 1;
      for (let x = 0; x <= 800; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 600); ctx.stroke(); }
      for (let y = 0; y <= 600; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(800, y); ctx.stroke(); }

      for (const d of dots) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < 0 || d.x > 800) d.vx *= -1;
        if (d.y < 0 || d.y > 600) d.vy *= -1;
        ctx.save();
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 20;
        ctx.fillStyle = d.color + "66";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * (1 + 0.15 * Math.sin(t * 2 + d.x)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    let last = performance.now();
    const loop = (now: number) => {
      menuRafRef.current = requestAnimationFrame(loop);
      draw(Math.min((now - last) / 1000, 0.05));
      last = now;
    };
    menuRafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(menuRafRef.current);
  }, [phase]);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Red Escape"
          stats={
            phase === "playing"
              ? [
                  { label: "Score", value: score, accent: true },
                  { label: "Best", value: highScore },
                ]
              : []
          }
        />
      }
    >
      {phase === "menu" ? (
        // ── Menu ──────────────────────────────────────────────────────────────
        <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
          <canvas
            ref={menuCanvasRef}
            width={800}
            height={600}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="relative z-10 flex flex-col items-center gap-6 px-4">
            {/* Title */}
            <div className="text-center">
              <h1
                className="text-6xl md:text-7xl font-black leading-none"
                style={{
                  fontFamily: "Fraunces, serif",
                  color: "#ff4444",
                  textShadow: "0 0 40px #ff4444, 0 0 80px #ff222244",
                  letterSpacing: "-0.02em",
                }}
              >
                RED ESCAPE
              </h1>
              <p className="mt-2 text-lg" style={{ color: "#aaaacc", fontFamily: "Manrope, sans-serif" }}>
                Survive 60 seconds. Collect carrots. Don't get caught.
              </p>
            </div>

            {/* Buttons */}
            <button
              onClick={startGame}
              className="px-12 py-4 rounded-2xl text-xl font-bold text-white transition-transform active:scale-95"
              style={{
                background: "linear-gradient(135deg, #e53e3e, #c53030)",
                boxShadow: "0 0 30px #e53e3e88, 0 4px 20px #00000066",
                fontFamily: "Manrope, sans-serif",
              }}
            >
              ▶ Start Game
            </button>

            {/* Sound toggle */}
            <button
              onClick={toggleSound}
              className="px-6 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: soundOn ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${soundOn ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}`,
                color: soundOn ? "#ffffff" : "#666688",
                fontFamily: "Manrope, sans-serif",
              }}
            >
              {soundOn ? "🔊 Sound On" : "🔇 Sound Off"}
            </button>

            {/* Instructions */}
            <div
              className="max-w-md text-sm rounded-2xl px-6 py-4"
              style={{
                background: "rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#aaaacc",
                fontFamily: "Manrope, sans-serif",
                backdropFilter: "blur(4px)",
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["🎮 Move", "WASD / Arrow Keys"],
                  ["⏸ Pause", "P or Escape"],
                  ["🥕 Collect", "Run over carrots"],
                  ["⚡ Power-ups", "Glow on the map"],
                  ["🛡 Shield", "Survive one hit"],
                  ["❄ Freeze", "Stops the enemy"],
                ].map(([icon, desc]) => (
                  <div key={icon}>
                    <span style={{ color: "#ffffff" }}>{icon}</span>{" "}
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center" style={{ color: "#ff8888" }}>
                📱 Touch the screen to use the joystick on mobile
              </p>
              {highScore > 0 && (
                <p className="mt-2 text-center font-bold" style={{ color: "#ffcc44" }}>
                  ⭐ Your best: {highScore}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        // ── Game ──────────────────────────────────────────────────────────────
        <GameComponent
          key={round}
          audio={audio}
          onPhaseChange={setPhase}
          onScore={handleScore}
          onHighScore={handleHighScore}
          initialHighScore={highScore}
        />
      )}
    </GameShell>
  );
}
