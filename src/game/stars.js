// Scoring per the spec: 3 stars at par, 2 at par + 1, 1 at anything else within budget. Pure.
// Over budget scores 0 (the UI never lets that happen; this is a guard, not a rule).
export function stars(par, wallsUsed, wallBudget) {
  for (const [name, v] of [['par', par], ['wallsUsed', wallsUsed], ['wallBudget', wallBudget]]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer, got ${v}`);
  }
  if (wallsUsed > wallBudget) return 0;
  if (wallsUsed <= par) return 3;
  if (wallsUsed === par + 1) return 2;
  return 1;
}
