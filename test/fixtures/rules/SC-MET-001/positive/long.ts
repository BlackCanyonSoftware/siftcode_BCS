interface Item {
  price: number;
  tax: number;
}

export function longFunction(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price;
    total += item.tax;
  }
  return total;
}

export class Cart {
  longMethod(items: Item[]): number {
    let total = 0;
    for (const item of items) {
      total += item.price;
      total += item.tax;
    }
    return total;
  }

  shortMethod(): number {
    return 1;
  }
}

export function overloaded(value: string): string;
export function overloaded(value: number): number;
export function overloaded(value: string | number): string | number {
  return value;
}
