// Scoring per the spec: 3 stars at par, 2 at par + 1, 1 at anything else within budget. Pure.
// Each hint used on the attempt lowers a win by 1 star, minimum 1 (hintsUsed defaults to 0).
// Over budget scores 0 (the UI never lets that happen; this is a guard, not a rule).
export function stars(par, wallsUsed, wallBudget, hintsUsed = 0) {
  for (const [name, v] of [['par', par], ['wallsUsed', wallsUsed], ['wallBudget', wallBudget], ['hintsUsed', hintsUsed]]) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer, got ${v}`);
  }
  if (wallsUsed > wallBudget) return 0;
  const base = wallsUsed <= par ? 3 : wallsUsed === par + 1 ? 2 : 1;
  return Math.max(1, base - hintsUsed); // each hint used on the attempt costs a star, minimum 1
}
