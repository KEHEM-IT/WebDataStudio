import type { ExtractionResult } from '@dtypes/extraction';

function escapeCsvCell(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellDisplay(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Shared delimited-text builder for both CSV (,) and TSV (\t). */
export function toDelimited(result: ExtractionResult, delimiter: string): string {
  const headers = result.columns.map((c) => escapeCsvCell(c.name, delimiter));
  const lines = [headers.join(delimiter)];

  for (const row of result.rows) {
    const cells = result.columns.map((col) => escapeCsvCell(cellDisplay(row[col.name]?.value ?? null), delimiter));
    lines.push(cells.join(delimiter));
  }

  return lines.join('\r\n');
}

export function toCsv(result: ExtractionResult): string {
  return toDelimited(result, ',');
}

export function toTsv(result: ExtractionResult): string {
  return toDelimited(result, '\t');
}
