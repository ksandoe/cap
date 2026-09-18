export const PHASES = {
  CHECKIN:    1,
  ACTIVITY:   2,
  CHECKOUT:   3,
  SUMMARY:    4,
} as const;

export type Phase = typeof PHASES[keyof typeof PHASES];
