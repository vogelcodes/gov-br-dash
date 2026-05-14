import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatAge, type StaleLevel } from "../lib/staleness";

interface Props {
  level: StaleLevel;
  /** Timestamp the staleness check was based on (usually last_synced_at). */
  lastChangedAt: string | null | undefined;
}

/**
 * Small info icon. Always rendered — color reflects staleness, tooltip
 * surfaces last-verification age. Refresh is enqueued automatically by the
 * backend; this is purely informational.
 */
export function StaleBadge({ level, lastChangedAt }: Props) {
  const color =
    level === "red"
      ? "text-red-500"
      : level === "yellow"
        ? "text-amber-500"
        : "text-green-300";
  const svgColor =
    level === "red" ? "red" : level === "yellow" ? "yellow" : "green";

  const suffix =
    level === "red"
      ? " · será atualizado em breve"
      : level === "yellow"
        ? " · agendado para atualização"
        : "";
  const label = `Última verificação: ${formatAge(lastChangedAt)}${suffix}`;

  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom + 4 });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={anchorRef}
      aria-label={label}
      className={`inline-flex items-center ${color}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 16 16"
        aria-hidden="true"
        stroke={svgColor}
      >
        <circle cx="8" cy="8" r="7" stroke={svgColor} strokeWidth="1.5" />
        <line
          x1="8"
          y1="5"
          x2="8"
          y2="9"
          stroke={svgColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11" r="0.75" fill={svgColor} />
      </svg>
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              transform: "translateX(-50%)",
            }}
            className="pointer-events-none z-[9999] whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}

export function staleTintClass(level: StaleLevel): string {
  if (level === "red") return "bg-red-50";
  if (level === "yellow") return "bg-amber-50";
  return "";
}
