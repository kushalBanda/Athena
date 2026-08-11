export interface FuzzyMatch {
  score: number;
  indices: number[];
}

const SEPARATORS = new Set([" ", "-", "_", "/", ".", ":"]);

const SUBSTRING_BASE_SCORE = 1000;
const BOUNDARY_BONUS = 100;
const CHAR_SCORE = 10;
const CONSECUTIVE_BONUS = 15;
const SUBSEQUENCE_BOUNDARY_BONUS = 20;

function isBoundary(target: string, index: number): boolean {
  return index === 0 || SEPARATORS.has(target[index - 1] ?? "");
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query === "") return { score: 0, indices: [] };

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const subIndex = t.indexOf(q);
  if (subIndex !== -1) {
    const indices = Array.from({ length: q.length }, (_, i) => subIndex + i);
    const score = SUBSTRING_BASE_SCORE + (isBoundary(t, subIndex) ? BOUNDARY_BONUS : 0) - subIndex;
    return { score, indices };
  }

  let qi = 0;
  let score = 0;
  const indices: number[] = [];
  let prevMatch = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      let charScore = CHAR_SCORE;
      if (ti === prevMatch + 1) charScore += CONSECUTIVE_BONUS;
      if (isBoundary(t, ti)) charScore += SUBSEQUENCE_BOUNDARY_BONUS;
      score += charScore;
      prevMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;

  const first = indices[0] ?? 0;
  const last = indices[indices.length - 1] ?? 0;
  score -= last - first;

  return { score, indices };
}
