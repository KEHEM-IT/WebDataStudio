import type { DetectionCandidate, LibrarySignature } from '@dtypes/detection';
import { describeElement } from '@core/selectors/describe-element';
import { generateId } from '@core/utils/id';

/** Root selector + row selector for div-based (non-<table>) grid libraries.
 *  Libraries that render onto a native <table> (DataTables, Bootstrap Table,
 *  Kendo's table mode, etc.) are intentionally left out here — the native
 *  table detector already finds and tags those via `detectLibrary`, so
 *  surfacing them again from a wrapper `<div>` would just duplicate the
 *  candidate list. This detector exists specifically for the div-based grids
 *  the other two detectors structurally can't see. */
const DIV_GRID_SIGNATURES: Array<{
  lib: LibrarySignature;
  root: string;
  rows: string;
}> = [
  { lib: 'ag-grid', root: '.ag-root-wrapper, .ag-root', rows: '.ag-row' },
  { lib: 'tabulator', root: '.tabulator', rows: '.tabulator-row' },
  { lib: 'handsontable', root: '.handsontable', rows: 'tbody tr' },
  { lib: 'kendo-grid', root: '.k-grid', rows: '.k-grid-content tr, tr.k-master-row' },
  { lib: 'primevue', root: '.p-datatable', rows: '.p-datatable-tbody > tr' },
  { lib: 'vuetify', root: '.v-data-table', rows: '.v-data-table__tr, tbody tr' },
  { lib: 'element-plus', root: '.el-table', rows: '.el-table__row' },
  { lib: 'antd', root: '.ant-table', rows: '.ant-table-row' },
  { lib: 'mui', root: '.MuiDataGrid-root', rows: '.MuiDataGrid-row' }
];

/** Finds roots of known third-party grid libraries that are NOT backed by a
 *  native <table> element (those are already covered by the table
 *  detector) and turns each into a ranked candidate. */
export function detectLibraryGrids(minItemCount: number, maxCandidates: number): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  const seenRoots = new Set<Element>();

  for (const sig of DIV_GRID_SIGNATURES) {
    if (candidates.length >= maxCandidates) break;

    for (const root of Array.from(document.querySelectorAll(sig.root))) {
      if (seenRoots.has(root)) continue;
      if (root.querySelector('table')) continue; // covered by native-table-detector instead

      const rowEls = root.querySelectorAll(sig.rows);
      const rowCount = rowEls.length;
      if (rowCount < minItemCount) continue;

      seenRoots.add(root);
      const firstRow = rowEls[0];
      const fieldCount = firstRow ? firstRow.children.length : 0;

      candidates.push({
        id: generateId('cand'),
        kind: 'data-grid-lib',
        library: sig.lib,
        element: describeElement(root),
        confidence: 0.9,
        approxItemCount: rowCount,
        approxFieldCount: fieldCount,
        reasons: [`${sig.lib} grid detected`, `${rowCount} rows detected`]
      });

      if (candidates.length >= maxCandidates) break;
    }
  }

  return candidates.slice(0, maxCandidates);
}
