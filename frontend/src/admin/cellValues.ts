// Parsing of jeopardy cell values typed by the host. No imports: also run by node --test.

/** "100 200, 300;400" -> [100, 200, 300, 400]; null when empty or not all integers. */
export function parseCellValues(input: string): number[] | null {
  const parts = input.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const values = new Set<number>();
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) return null;
    values.add(Number(p));
  }
  return [...values].sort((a, b) => a - b);
}

export function formatCellValues(values: number[]): string {
  return values.join(" ");
}
