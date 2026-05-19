"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChefHat, NotebookPen, Scale, Sparkles, WandSparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const HINTS = [
  "Vorrat wird durchforstet…",
  "Der Koch sammelt Ideen…",
  "Zutaten werden abgewogen…",
  "Geschmacksrichtungen werden abgestimmt…",
  "Würzige Kombinationen werden geprüft…",
  "Mengen werden auf 4 Portionen skaliert…",
  "Der letzte Feinschliff wird gemacht…",
];

const COMBINED_PHASES: { key: string; label: string; sub: string; Icon: LucideIcon; pct: number }[] = [
  { key: "sammeln",     label: "Vorrat durchgehen & Ideen sammeln",  sub: "Was ist da, was passt zusammen?",                  Icon: Sparkles,      pct: 0  },
  { key: "abwägen",     label: "Geschmacksrichtungen abwägen",        sub: "Süß, salzig, frisch, deftig – was passt wozu?",   Icon: Scale,         pct: 25 },
  { key: "schreiben",   label: "Rezepte schreiben",                   sub: "Zutaten, Mengen, Schritte für 4 Portionen",       Icon: NotebookPen,   pct: 55 },
  { key: "feinschliff", label: "Letzter Feinschliff",                 sub: "Tipps, Garzeiten, Würzempfehlungen",              Icon: WandSparkles,  pct: 85 },
];

function useLoadingClock(duration = 14000) {
  const [progress, setProgress] = useState(0);
  const [hintIdx, setHintIdx] = useState(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    let raf: number;
    function tick(now: number) {
      const elapsed = (now - startRef.current) % (duration + 1200);
      if (elapsed <= duration) {
        const t = elapsed / duration;
        const eased = 1 - Math.pow(1 - t, 1.6);
        setProgress(Math.min(100, eased * 100));
      } else {
        setProgress(100);
        if (elapsed > duration + 1000) startRef.current = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  useEffect(() => {
    const id = setInterval(() => setHintIdx((i) => (i + 1) % HINTS.length), 2400);
    return () => clearInterval(id);
  }, []);

  return { progress, hint: HINTS[hintIdx] };
}

function FadeText({ value }: { value: string }) {
  const [shown, setShown] = useState(value);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (value === shown) return;
    setVisible(false);
    const t = setTimeout(() => { setShown(value); setVisible(true); }, 240);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span style={{
      display: "inline-block",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(4px)",
      transition: "opacity 240ms ease, transform 240ms ease",
    }}>
      {shown}
    </span>
  );
}

export function RecipeLoading() {
  const { progress, hint } = useLoadingClock();

  const currentIdx = (() => {
    for (let i = COMBINED_PHASES.length - 1; i >= 0; i--) {
      if (progress >= COMBINED_PHASES[i].pct) return i;
    }
    return 0;
  })();

  return (
    <div
      aria-busy
      aria-label="Rezepte werden generiert"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        padding: "20px 20px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Hero: chef hat + % side by side */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
          <span style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "var(--color-primary-subtle)",
            animation: "loader-pulse 1.8s ease-in-out infinite",
          }} />
          <span style={{
            position: "absolute", inset: -7, borderRadius: "50%",
            border: "1.5px solid color-mix(in srgb, var(--color-primary) 35%, transparent)",
            animation: "loader-ring 2.4s ease-out infinite",
          }} />
          <span style={{
            position: "absolute", inset: 0,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "var(--color-primary-text)",
            animation: "loader-bob 2.4s ease-in-out infinite",
          }}>
            <ChefHat size={24} strokeWidth={1.75} aria-hidden />
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-serif)", fontSize: 40, fontWeight: 500,
            lineHeight: 1, color: "var(--color-foreground)",
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em",
          }}>
            {Math.round(progress)}<span style={{ fontSize: 20, color: "var(--color-muted)", marginLeft: 2 }}> %</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-foreground)" }}>
            Rezepte werden erstellt
          </div>
          <div style={{ fontSize: 12, color: "var(--color-muted)", minHeight: 16 }}>
            <FadeText value={hint} />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        width: "100%", height: 4,
        background: "var(--color-surface-raised)",
        borderRadius: 999, overflow: "hidden",
      }}>
        <div style={{
          width: `${progress}%`, height: "100%",
          background: "var(--color-primary)",
          borderRadius: 999,
          transition: "width 200ms linear",
        }} />
      </div>

      {/* Phases */}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {COMBINED_PHASES.map((phase, i) => {
          const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
          const isLast = i === COMBINED_PHASES.length - 1;
          const PhaseIcon = state === "done" ? Check : phase.Icon;

          return (
            <li key={phase.key} style={{ position: "relative", display: "flex", gap: 14, alignItems: "flex-start" }}>
              {/* Connector line */}
              {!isLast && (
                <span style={{
                  position: "absolute",
                  left: 19, top: 40, bottom: -14, width: 2,
                  background: state === "done" ? "var(--color-primary)" : "var(--color-border)",
                  transition: "background 240ms",
                }} />
              )}

              {/* Icon circle */}
              <div style={{
                width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                position: "relative", zIndex: 1,
                background: state === "active" ? "var(--color-primary)"
                          : state === "done"   ? "var(--color-primary-subtle)"
                          :                       "var(--color-surface)",
                color:      state === "active" ? "var(--color-primary-fg)"
                          : state === "done"   ? "var(--color-primary-text)"
                          :                       "var(--color-muted)",
                border: state === "pending" ? "1.5px solid var(--color-border)" : "1.5px solid transparent",
                transition: "background 240ms, color 240ms, box-shadow 240ms",
                animation: state === "active" ? "loader-pulse-soft 1.8s ease-in-out infinite" : "none",
              }}>
                <PhaseIcon size={18} strokeWidth={2} aria-hidden />
              </div>

              {/* Text */}
              <div style={{ flex: 1, paddingTop: 2, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: state === "active" ? 600 : 500,
                    color: state === "pending" ? "var(--color-muted)" : "var(--color-foreground)",
                    transition: "color 240ms",
                  }}>
                    {phase.label}
                  </span>
                  {state === "active" && (
                    <span style={{ display: "inline-flex", gap: 3, marginTop: 2 }}>
                      <span className="dot-anim" style={{ animationDelay: "0s" }} />
                      <span className="dot-anim" style={{ animationDelay: "0.18s" }} />
                      <span className="dot-anim" style={{ animationDelay: "0.36s" }} />
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 12, lineHeight: 1.4,
                  color: "var(--color-muted)",
                  opacity: state === "pending" ? 0.7 : 1,
                  transition: "opacity 240ms",
                }}>
                  {phase.sub}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
