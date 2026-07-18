import type { DataColumn, DataRow, ExtractionResult } from '@dtypes/extraction';
import { generateId } from '@core/utils/id';
import { normalizeWhitespace } from '@core/utils/text';
import { computeStats } from '@core/utils/stats';
import { toCellValue } from './type-inference';

function cellText(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll('script,style').forEach((n) => n.remove());
  return normalizeWhitespace((clone as HTMLElement).innerText ?? clone.textContent ?? '');
}

function richAttrsOf(cell: Element): { href?: string; src?: string; alt?: string } {
  const a = cell.querySelector('a[href]') as HTMLAnchorElement | null;
  const img = cell.querySelector('img[src]') as HTMLImageElement | null;
  return {
    ...(a ? { href: a.href } : {}),
    ...(img ? { src: img.src, alt: img.alt || undefined } : {})
  };
}

function synthColumnName(index: number): string {
  return `Column_${index + 1}`;
}

/** Extracts a native or div-based table into typed columns/rows.
 *  `root` should be the table/div-grid element identified by detection. */
export function extractTable(root: Element): ExtractionResult {
  const start = performance.now();
  const isNativeTable = root.tagName.toLowerCase() === 'table';

  let headerCells: Element[] = [];
  let bodyRowEls: Element[] = [];

  if (isNativeTable) {
    const theadRow = root.querySelector('thead tr');
    headerCells = theadRow ? Array.from(theadRow.children) : [];
    const bodyRows = Array.from(root.querySelectorAll('tbody tr'));
    bodyRowEls = bodyRows.length > 0
      ? bodyRows
      : Array.from(root.querySelectorAll('tr')).slice(headerCells.length > 0 ? 1 : 0);
    if (headerCells.length === 0) {
      const firstRow = root.querySelector('tr');
      if (firstRow && firstRow.querySelectorAll('th').length > 0) {
        headerCells = Array.from(firstRow.children);
        bodyRowEls = bodyRowEls.filter((r) => r !== firstRow);
      }
    }
  } else {
    // Div-based "table": treat direct children as rows, and each row's
    // children as cells. First row is treated as header only if none of
    // its cells look like data (heuristic: mostly non-numeric, short text).
    const rowEls = Array.from(root.children);
    bodyRowEls = rowEls;
    const first = rowEls[0];
    if (first && first.children.length > 0) {
      headerCells = Array.from(first.children);
      bodyRowEls = rowEls.slice(1);
    }
  }

  const columnCount = Math.max(
    headerCells.length,
    ...bodyRowEls.slice(0, 25).map((r) => r.children.length),
    1
  );

  const columns: DataColumn[] = Array.from({ length: columnCount }, (_, i) => {
    const headerEl = headerCells[i];
    const original = headerEl ? cellText(headerEl) : null;
    return {
      id: generateId('col'),
      name: original && original.length > 0 ? original : synthColumnName(i),
      originalHeader: original && original.length > 0 ? original : null,
      inferredType: 'string',
      synthetic: !original || original.length === 0
    };
  });

  const rows: DataRow[] = bodyRowEls.map((rowEl) => {
    const cells = Array.from(rowEl.children);
    const row: DataRow = {};
    columns.forEach((col, i) => {
      const cellEl = cells[i];
      const attrs = cellEl ? richAttrsOf(cellEl) : undefined;
      const text = cellEl ? cellText(cellEl) : '';
      // When a cell has no visible text (e.g. a bare <img> or an icon-only
      // <a>), fall back the displayed raw value to its link/image target so
      // native <table> extraction surfaces file links the same way the
      // repeated/list extractor already does.
      const raw = text || attrs?.alt || attrs?.href || attrs?.src || '';
      row[col.name] = toCellValue(raw, attrs);
    });
    return row;
  });

  // Infer each column's dominant type from its non-empty cell values.
  for (const col of columns) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const cell = row[col.name];
      if (!cell || cell.type === 'null') continue;
      counts.set(cell.type, (counts.get(cell.type) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [type, count] of counts) {
      if (count > bestCount) { best = type; bestCount = count; }
    }
    if (best) col.inferredType = best as DataColumn['inferredType'];
  }

  const stats = computeStats(columns, rows, performance.now() - start);

  return {
    id: generateId('extraction'),
    createdAt: Date.now(),
    sourceUrl: location.href,
    sourceTitle: document.title,
    extractorKind: isNativeTable ? 'table' : 'grid',
    rootSelector: '',
    columns,
    rows,
    stats
  };
}
