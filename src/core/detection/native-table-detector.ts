import type { DetectionCandidate } from '@types/detection';
import { describeElement } from '@core/selectors/describe-element';
import { detectLibrary } from './library-signatures';
import { generateId } from '@core/utils/id';

/** Finds <table> elements and div-based "table" containers (role="table",
 *  or a repeated-row grid with a header-like first child). */
export function detectTables(minItemCount: number): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];

  for (const table of Array.from(document.querySelectorAll('table'))) {
    const rows = table.querySelectorAll('tbody tr, tr');
    const rowCount = rows.length;
    if (rowCount < minItemCount) continue;
    const firstRow = table.querySelector('tr');
    const fieldCount = firstRow ? firstRow.children.length : 0;
    const library = detectLibrary(table);
    candidates.push({
      id: generateId('cand'),
      kind: 'html-table',
      library,
      element: describeElement(table),
      confidence: rowCount >= 2 && fieldCount >= 2 ? 0.95 : 0.6,
      approxItemCount: rowCount,
      approxFieldCount: fieldCount,
      reasons: ['<table> element', `${rowCount} rows detected`, `library: ${library}`]
    });
  }

  for (const el of Array.from(document.querySelectorAll('[role="table"], [role="grid"]'))) {
    if (el.closest('table')) continue;
    const rowEls = el.querySelectorAll('[role="row"]');
    if (rowEls.length < minItemCount) continue;
    const first = rowEls[0];
    const fieldCount = first ? first.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"]').length : 0;
    candidates.push({
      id: generateId('cand'),
      kind: 'div-table',
      library: detectLibrary(el),
      element: describeElement(el),
      confidence: 0.85,
      approxItemCount: rowEls.length,
      approxFieldCount: fieldCount,
      reasons: [`role="${el.getAttribute('role')}" ARIA grid`, `${rowEls.length} rows detected`]
    });
  }

  return candidates;
}
