export function classify(items: number[], limit: number): number {
  let score = 0;
  for (const item of items) {
    if (item > limit && item < 100) {
      score += 1;
    } else if (item === 0 || item < 0) {
      score -= 1;
    } else {
      score += 2;
    }
  }
  while (score > 10) {
    score -= 3;
  }
  switch (score) {
    case 1:
      score = 2;
      break;
    case 2:
      score = 3;
      break;
    default:
      score = 0;
  }
  try {
    score += limit > 5 ? 1 : 2;
  } catch (error) {
    score = 0;
  }
  return score;
}
