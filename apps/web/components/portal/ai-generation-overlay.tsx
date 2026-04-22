'use client';

// ─────────────────────────────────────────────────────────────────
// AI Generation Overlay — fullscreen luxury loader shown while the
// AI generates a routine or meal plan. Framed as "the Coach is
// cooking" with staged steps so a 20-25 s wait feels curated
// instead of dead.
//
// Steps are simulated on the client (setInterval walking through
// the list). The actual API call races against the animation:
//   - If API finishes first we jump to the final step and close.
//   - If steps finish first we hold on the last step with a spinner
//     until the API resolves.
//
// Used from /portal/rutinas and /portal/plan-alimenticio via:
//   <AIGenerationOverlay open={mut.isPending} kind="routine" />
// ─────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ClipboardList,
  Dumbbell,
  Apple,
  Gauge,
  NotebookPen,
  Loader2,
  UserRound,
  UtensilsCrossed,
  Flame,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type GenerationKind = 'routine' | 'meal_plan';

interface Step {
  label: string;
  icon: LucideIcon;
  /** approximate duration in ms this step stays "active" */
  ms: number;
}

const ROUTINE_STEPS: Step[] = [
  { label: 'Leyendo tu perfil fitness', icon: UserRound, ms: 1800 },
  { label: 'Seleccionando ejercicios del método Coach Samuel', icon: ClipboardList, ms: 4200 },
  { label: 'Diseñando tu rutina personalizada', icon: Dumbbell, ms: 6500 },
  { label: 'Ajustando series, reps y descansos', icon: Gauge, ms: 5500 },
  { label: 'Añadiendo notas del coach', icon: NotebookPen, ms: 4000 },
];

const MEAL_STEPS: Step[] = [
  { label: 'Leyendo tu perfil y objetivo', icon: UserRound, ms: 1800 },
  { label: 'Calculando tus calorías y macros', icon: Flame, ms: 3500 },
  { label: 'Eligiendo ingredientes mexicanos', icon: Apple, ms: 5500 },
  { label: 'Armando tus 7 días de comidas', icon: UtensilsCrossed, ms: 7000 },
  { label: 'Ajustando porciones y revisando alergias', icon: NotebookPen, ms: 4500 },
];

export function AIGenerationOverlay({
  open,
  kind,
}: {
  open: boolean;
  kind: GenerationKind;
}) {
  const steps = kind === 'routine' ? ROUTINE_STEPS : MEAL_STEPS;
  const [activeIdx, setActiveIdx] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Walk through steps while the overlay is open. Stop at the last
  // step and hold there until the parent closes us (API returned).
  useEffect(() => {
    if (!open) {
      setActiveIdx(0);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let cancelled = false;
    const schedule = (i: number) => {
      const step = steps[i];
      if (!step) return;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        if (i < steps.length - 1) {
          setActiveIdx(i + 1);
          schedule(i + 1);
        }
      }, step.ms);
    };
    schedule(0);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, steps]);

  const totalDuration = useMemo(
    () => steps.reduce((acc, s) => acc + s.ms, 0),
    [steps],
  );

  const title = kind === 'routine' ? 'Preparando tu rutina' : 'Preparando tu plan alimenticio';
  const subtitle =
    kind === 'routine'
      ? 'El Coach Samuel está armando algo hecho para ti.'
      : 'Estamos diseñando tu plan con ingredientes mexicanos.';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
        >
          {/* Backdrop — deep blue to slate with soft blur so the
              rest of the UI fades away. */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 backdrop-blur-sm" />

          {/* Animated ambient glow behind the card. */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <motion.div
              className="absolute -top-32 left-1/2 -translate-x-1/2 h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-3xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -bottom-32 -right-20 h-[400px] w-[400px] rounded-full bg-indigo-500/20 blur-3xl"
              animate={{ scale: [1.1, 1, 1.1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
          </div>

          {/* Card */}
          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-md rounded-3xl bg-white/10 backdrop-blur-xl ring-1 ring-white/20 shadow-2xl overflow-hidden"
          >
            {/* Top brand strip */}
            <div className="relative px-6 pt-6 pb-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-200">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                CED·GYM
              </div>
              <h3 className="font-display text-2xl sm:text-3xl tracking-tight text-white mt-2">
                {title}
              </h3>
              <p className="text-sm text-blue-100/80 mt-1">{subtitle}</p>
            </div>

            {/* Progress bar */}
            <div className="px-6 pb-4">
              <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  key={totalDuration}
                  className="h-full bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: totalDuration / 1000, ease: 'easeInOut' }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="px-6 pb-6 space-y-3">
              {steps.map((s, i) => {
                const isDone = i < activeIdx;
                const isActive = i === activeIdx;
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={[
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                      isActive && 'bg-white/10 ring-1 ring-white/20',
                      isDone && 'opacity-70',
                      !isActive && !isDone && 'opacity-40',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div
                      className={[
                        'relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                        isDone && 'bg-emerald-500/20 ring-1 ring-emerald-400/40 text-emerald-300',
                        isActive && 'bg-blue-500/20 ring-1 ring-blue-400/40 text-blue-200',
                        !isActive && !isDone && 'bg-white/5 ring-1 ring-white/10 text-white/60',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {isDone ? (
                        <motion.span
                          key="check"
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        >
                          <Check className="h-4 w-4" />
                        </motion.span>
                      ) : isActive ? (
                        <motion.span
                          key="active"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </motion.span>
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </div>
                    <span
                      className={[
                        'text-sm leading-tight',
                        isActive ? 'text-white font-semibold' : 'text-white/80',
                      ].join(' ')}
                    >
                      {s.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Footer hint — only appears when we've reached the last
                step and are waiting on the API. */}
            {activeIdx === steps.length - 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="px-6 pb-6 -mt-2"
              >
                <p className="text-xs text-blue-100/70 text-center">
                  Últimos detalles… no cierres esta ventana.
                </p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
