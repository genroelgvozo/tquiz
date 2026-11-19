// Lays jeopardy cells out so that one value always sits in one column.
export function layoutBoard<T extends { value: number }>(
  categories: T[][],
): { columns: number[]; rows: (T | null)[][] } {
  // per theme: questions grouped by value, in input order within a value
  const grouped = categories.map((cells) => {
    const m = new Map<number, T[]>();
    for (const cell of cells) {
      const list = m.get(cell.value);
      if (list) list.push(cell);
      else m.set(cell.value, [cell]);
    }
    return m;
  });
  const slots = new Map<number, number>();
  for (const m of grouped) {
    for (const [v, list] of m) slots.set(v, Math.max(slots.get(v) ?? 0, list.length));
  }
  const values = [...slots.keys()].sort((a, b) => a - b);
  const columns: number[] = [];
  for (const v of values) for (let i = 0; i < (slots.get(v) ?? 0); i++) columns.push(v);
  const rows = grouped.map((m) => {
    const used = new Map<number, number>();
    return columns.map((v) => {
      const o = used.get(v) ?? 0;
      used.set(v, o + 1);
      return m.get(v)?.[o] ?? null;
    });
  });
  return { columns, rows };
}
