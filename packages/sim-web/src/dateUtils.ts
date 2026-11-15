export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** One month from today, clamped to the target month's last day (e.g. Jan 31 -> Feb 28/29). */
export function monthFromNowIso(): string {
  const d = new Date();
  const targetMonthFirst = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const lastDayOfTargetMonth = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth() + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDayOfTargetMonth);
  const result = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth(), day);
  return result.toISOString().slice(0, 10);
}
