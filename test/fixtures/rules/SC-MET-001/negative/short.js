export function add(a, b) {
  return a + b;
}

export const double = (value) => value * 2;

export class Counter {
  increment() {
    this.count += 1;
  }
}
