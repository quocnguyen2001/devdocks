import type { Transition, Variants } from "motion/react";

// Central motion rhythm — mirrors the CSS motion tokens in index.css so every
// animation shares one duration/easing/spring language (Phase 6). Callers pass
// `useReducedMotion()` so motion collapses to instant when the user opts out.

export const DURATION = { fast: 0.1, base: 0.18, slow: 0.26 } as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const SPRING: Transition = { type: "spring", stiffness: 200, damping: 15 };

/** Entrance: fade + rise. Reduced-motion → appears instantly, no transform. */
export function fadeInUp(reduced: boolean) {
  return reduced
    ? { initial: false as const, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: DURATION.base, ease: EASE_OUT },
      };
}

/** Staggered list container/item pair for grid entrances. */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base } },
};

/** Subtle press feedback for tappable cards/buttons. */
export function pressScale(reduced: boolean) {
  return reduced ? {} : { whileTap: { scale: 0.96 } };
}

/** Tactile pulse for the favorite-star toggle. */
export function starPulse(reduced: boolean) {
  return reduced ? {} : { whileTap: { scale: 1.3 }, transition: SPRING };
}
