export function deep(a, b, c) {
  if (a) {
    for (const x of b) {
      while (x) {
        if (c) {
          return x;
        }
      }
    }
  }
  return null;
}
