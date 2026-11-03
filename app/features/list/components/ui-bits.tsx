import { useState } from "react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-16 px-4 select-none flex-1">
      <svg
        className="w-20 h-20 sm:w-28 sm:h-28 mb-4 opacity-40 text-indigo-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4" />
      </svg>
      <h3
        className="text-lg font-semibold text-slate-300 mb-1"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        No tasks in this list
      </h3>
      <p className="text-slate-500 text-xs text-center max-w-xs">
        Add your first task above to get started. Stay organized and productive!
      </p>
    </div>
  );
}

export function ProgressRing({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          className="stroke-slate-800/80"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          className="stroke-indigo-500"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold text-indigo-300">
        {pct}%
      </span>
    </div>
  );
}

export function Toast({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-2xl transition-all duration-300 border
        bg-slate-900/95 backdrop-blur-lg text-indigo-200 border-indigo-500/30
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
    >
      {message}
    </div>
  );
}

const CONFETTI_COLORS = ["#f43f5e", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#06b6d4"];

function makeConfettiPieces() {
  return Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 1.8 + Math.random() * 1.5,
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    round: i % 2 === 0,
  }));
}

/** Celebration overlay. Pieces are randomized once per burst, so re-renders
 *  while it plays don't make them jump. */
export function Confetti() {
  const [pieces] = useState(makeConfettiPieces);
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece, i) => (
        <div
          key={i}
          className="absolute top-0 animate-confetti-fall"
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg)`,
            borderRadius: piece.round ? "50%" : "2px",
          }}
        />
      ))}
    </div>
  );
}

export { CompletedSectionToggle } from "./CompletedSectionToggle";
