export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class Counter {
  count = 0;

  increment(): void {
    this.count += 1;
  }
}
