import type { ElementDescriptor } from './element';

export type DetectionKind =
  | 'html-table' | 'div-table' | 'list' | 'card-grid' | 'data-grid-lib'
  | 'form' | 'tree' | 'unknown';

/** Known third-party grid/table library signatures the detector recognizes. */
export type LibrarySignature =
  | 'ag-grid' | 'tabulator' | 'handsontable' | 'kendo-grid' | 'bootstrap-table'
  | 'datatables' | 'primevue' | 'vuetify' | 'element-plus' | 'antd' | 'mui'
  | 'native';

export interface DetectionCandidate {
  id: string;
  kind: DetectionKind;
  library: LibrarySignature;
  element: ElementDescriptor;
  /** 0-1 heuristic confidence score. */
  confidence: number;
  /** Rough row/item count visible in the DOM right now. */
  approxItemCount: number;
  /** Rough column/field count (0 for non-tabular kinds). */
  approxFieldCount: number;
  reasons: string[];
}

export interface DetectionScanOptions {
  includeShadowDom: boolean;
  includeSameOriginIframes: boolean;
  minItemCount: number;
  maxCandidates: number;
}
