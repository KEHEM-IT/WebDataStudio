import type { DataColumn, DataRow, ExtractionStats } from '@dtypes/extraction';

/** Recomputes summary statistics for a column/row set. Shared by extractors
 *  and the transform pipeline so stats always reflect the current data,
 *  even after cleaning/transformation steps add, remove, or reshape cells. */
export function computeStats(columns: DataColumn[], rows: DataRow[], elapsedMs = 0): ExtractionStats {
  let emptyCellCount = 0;
  let imageCount = 0;
  let linkCount = 0;
  const seen = new Set<string>();
  let duplicateRowCount = 0;

  for (const row of rows) {
    const parts: string[] = [];
    for (const col of columns) {
      const cell = row[col.name];
      if (!cell) continue;
      if (cell.type === 'null' || cell.raw.length === 0) emptyCellCount += 1;
      if (cell.src) imageCount += 1;
      if (cell.href) linkCount += 1;
      parts.push(cell.raw);
    }
    const key = parts.join('|');
    if (seen.has(key)) duplicateRowCount += 1;
    seen.add(key);
  }

  const cellCount = rows.length * columns.length;
  const estimatedExportBytes = JSON.stringify(rows).length;

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    cellCount,
    emptyCellCount,
    duplicateRowCount,
    imageCount,
    linkCount,
    extractionTimeMs: Math.round(elapsedMs),
    estimatedExportBytes
  };
}
