export function longFunction(items) {
  let total = 0;
  for (const item of items) {
    total += item.price;
    total += item.tax;
  }
  return total;
}

export const longArrow = (items) => {
  let total = 0;
  for (const item of items) {
    total += item.price;
    total += item.tax;
  }
  return total;
};

export class Cart {
  longMethod(items) {
    let total = 0;
    for (const item of items) {
      total += item.price;
      total += item.tax;
    }
    return total;
  }
}

// Anonymous callbacks are measured as part of the code around them, not on their own.
[1, 2].forEach((value) => {
  console.log(value);
  console.log(value);
  console.log(value);
  console.log(value);
  console.log(value);
  console.log(value);
});
