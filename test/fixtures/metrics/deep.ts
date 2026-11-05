export function deep(a: boolean, b: number[], c: boolean): number | null {
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
