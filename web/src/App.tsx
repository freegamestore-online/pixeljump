import { useRef, useState } from "react";
import { GameShell, GameTopbar, GameOverScreen } from "@freegamestore/games";
import { Game } from "./components/Game";
import { useHighScore } from "./hooks/useHighScore";
import type { GamePhase } from "./types";

export default function App() {
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [highScore, setHighScore] = useHighScore("lazerball-highscore");

  const scoreRef = useRef(0);
  const handleScore = (s: number) => {
    scoreRef.current = s;
    setScore(s);
  };

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setRound((r) => r + 1);
    setPhase("playing");
  };

  const end = () => {
    setHighScore(scoreRef.current);
    setPhase("over");
  };

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Lazer Ball"
          stats={[
            { label: "Score", value: score, accent: true },
            { label: "Best",  value: highScore },
          ]}
        />
      }
    >
      {phase === "menu" && (
        <div className="flex flex-col items-center justify-center w-full h-full gap-6 px-4"
          style={{ background: "#0f0f1a" }}>
          {/* Animated enemy preview */}
          <div className="relative flex items-center justify-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-2xl"
              style={{
                background: "radial-gradient(circle at 35% 35%, #ff6666, #cc1111 55%, #880000)",
                boxShadow: "0 0 40px 10px rgba(255,50,50,0.5), 0 0 80px 20px rgba(200,0,0,0.25)",
                animation: "bob 1.8s ease-in-out infinite",
              }}>
              {/* Head */}
              <div className="absolute rounded-full"
                style={{
                  width: 36, height: 36,
                  top: 4, left: 20,
                  background: "radial-gradient(circle at 30% 30%, #ffaaaa, #ff3333 50%, #cc0000)",
                  boxShadow: "0 0 14px 4px rgba(255,80,80,0.6)",
                }} />
              {/* Eyes */}
              <div className="absolute rounded-full bg-white" style={{ width: 10, height: 10, top: 36, left: 32 }} />
              <div className="absolute rounded-full bg-white" style={{ width: 10, height: 10, top: 36, left: 50 }} />
            </div>
            {/* Laser beams */}
            <div className="absolute rounded-full"
              style={{
                width: 10, height: 10,
                background: "#ff4444",
                boxShadow: "0 0 12px 4px rgba(255,50,50,0.8)",
                top: "50%", left: "110%",
                animation: "laserfly 1.2s linear infinite",
              }} />
          </div>

          <style>{`
            @keyframes bob {
              0%,100% { transform: translateY(0); }
              50%      { transform: translateY(-10px); }
            }
            @keyframes laserfly {
              0%   { transform: translate(0, -8px)  scale(1); opacity:1; }
              100% { transform: translate(80px,-8px) scale(0.5); opacity:0; }
            }
          `}</style>

          <div className="text-center">
            <h1 className="font-display text-5xl font-bold mb-2"
              style={{ color: "#ff4444", textShadow: "0 0 20px rgba(255,50,50,0.6)", fontFamily: "Fraunces, serif" }}>
              Lazer Ball
            </h1>
            <p className="text-base" style={{ color: "rgba(255,255,255,0.55)", fontFamily: "Manrope, sans-serif" }}>
              A red-headed ball chases you and shoots lasers.<br />
              Survive as long as you can!
            </p>
          </div>

          <div className="text-sm text-center" style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Manrope, sans-serif" }}>
            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>WASD / Arrows</span> to move &nbsp;·&nbsp;
            <span className="font-semibold" style={{ color: "rgba(255,255,255,0.55)" }}>Touch</span> to drag joystick
          </div>

          <button
            onClick={start}
            className="px-10 py-4 rounded-2xl text-xl font-bold transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              color: "#fff",
              fontFamily: "Manrope, sans-serif",
              boxShadow: "0 0 24px rgba(220,38,38,0.5)",
              minWidth: 180,
              minHeight: 56,
            }}
          >
            🎯 Play
          </button>

          {highScore > 0 && (
            <p style={{ color: "rgba(255,200,200,0.6)", fontFamily: "Manrope, sans-serif", fontSize: 14 }}>
              Best: <span style={{ color: "#ff9999", fontWeight: 700 }}>{highScore}</span>
            </p>
          )}
        </div>
      )}

      {phase === "playing" && (
        <Game key={round} onScore={handleScore} onGameOver={end} />
      )}

      {phase === "over" && (
        <GameOverScreen
          score={scoreRef.current}
          highScore={highScore}
          onRestart={start}
          message={
            scoreRef.current >= 200
              ? "Incredible dodging! 🔥"
              : scoreRef.current >= 100
              ? "Nice moves! Keep it up 💪"
              : "The Lazer Ball got you! 😈"
          }
        />
      )}
    </GameShell>
  );
}
