"use client";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export function StepTransition({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, x: -16 }}
        transition={{ duration: reduced ? 0.12 : 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function Stagger({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        show: { transition: { staggerChildren: reduced ? 0 : 0.05 } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function Tappable({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div className={className} whileTap={reduced ? undefined : { scale: 0.97 }}>
      {children}
    </motion.div>
  );
}

export function SuccessBurst({ label }: { label: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      role="status"
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ duration: reduced ? 0.12 : 0.3 }}
      className="flex flex-col items-center gap-2 text-success"
    >
      <span aria-hidden className="text-4xl">
        ✓
      </span>
      <span className="font-medium">{label}</span>
    </motion.div>
  );
}
