export function LongComponent({ items }: { items: number[] }) {
  const total = items.reduce((sum, item) => sum + item, 0);
  return (
    <ul>
      <li>{total}</li>
      <li>{items.length}</li>
    </ul>
  );
}
