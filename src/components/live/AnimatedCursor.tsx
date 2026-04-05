"use client";

import { cn } from "@/lib/utils";

interface AnimatedCursorProps {
  targetX: number;
  targetY: number;
  isClicking: boolean;
  elementText?: string;
  elementType?: string;
}

export function AnimatedCursor({ targetX, targetY, isClicking, elementText, elementType }: AnimatedCursorProps) {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-500 ease-out"
      style={{
        left: `${targetX}px`,
        top: `${targetY}px`,
        transform: 'translate(-4px, -4px)',
      }}
    >
      {/* Cursor SVG with purple accent */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        className="drop-shadow-lg filter"
      >
        <path
          d="M5 3l14 8-6 2-4 6z"
          fill="white"
          stroke="#8B5CF6"
          strokeWidth="1.5"
        />
      </svg>

      {/* Click ripple effect with purple colors */}
      {isClicking && (
        <div className="absolute -top-4 -left-4 w-14 h-14">
          <div className="absolute inset-0 rounded-full bg-purple-400/30 animate-ping" />
          <div className="absolute inset-2 rounded-full bg-purple-500/50 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-purple-600/70" />
        </div>
      )}

      {/* Element label tooltip with type badge */}
      {elementText && (
        <div className="absolute top-7 left-5">
          <div className="flex items-center gap-1.5 bg-black/85 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap backdrop-blur-sm border border-white/10 shadow-xl">
            <span className="text-purple-400">🖱️</span>
            <span className="font-medium">{elementText.substring(0, 40)}{elementText.length > 40 ? '...' : ''}</span>
            {elementType && (
              <span className="text-gray-400 text-[10px] ml-1 px-1.5 py-0.5 bg-white/10 rounded">
                {elementType}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
