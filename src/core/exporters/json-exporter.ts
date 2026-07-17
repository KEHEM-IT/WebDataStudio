import type { ExtractionResult } from '@types/extraction';

/** Plain-value rows: header name -> primitive cell value (no type metadata). */
function toPlainRows(result: ExtractionResult): Array<Record<string, string | number | boolean | null>> {
  return result.rows.map((row) => {
    const plain: Record<string, string | number | boolean | null> = {};
    for (const col of result.columns) {
      plain[col.name] = row[col.name]?.value ?? null;
    }
    return plain;
  });
}

export function toJson(result: ExtractionResult, pretty = true): string {
  const plain = toPlainRows(result);
  return pretty ? JSON.stringify(plain, null, 2) : JSON.stringify(plain);
}

export function toJsonLines(result: ExtractionResult): string {
  return toPlainRows(result).map((row) => JSON.stringify(row)).join('\n');
}
