export type InferredDataType =
  | 'string' | 'number' | 'boolean' | 'date' | 'time' | 'datetime'
  | 'currency' | 'percentage' | 'email' | 'phone' | 'url'
  | 'latitude' | 'longitude' | 'uuid' | 'json' | 'array' | 'object' | 'null';

export interface CellValue {
  /** Raw rendered text as extracted from the DOM. */
  raw: string;
  /** Best-effort parsed/typed value (string if unparsed). */
  value: string | number | boolean | null;
  type: InferredDataType;
  /** Present when the cell held a link, image, or other rich field. */
  href?: string;
  src?: string;
  alt?: string;
}

export interface DataColumn {
  id: string;
  name: string;
  originalHeader: string | null;
  inferredType: InferredDataType;
  /** True if header was synthesized (Column_1) rather than detected. */
  synthetic: boolean;
}

export type DataRow = Record<string, CellValue>;

export interface ExtractionResult {
  id: string;
  createdAt: number;
  sourceUrl: string;
  sourceTitle: string;
  extractorKind: 'table' | 'list' | 'card' | 'grid' | 'custom';
  rootSelector: string;
  columns: DataColumn[];
  rows: DataRow[];
  stats: ExtractionStats;
}

export interface ExtractionStats {
  rowCount: number;
  columnCount: number;
  cellCount: number;
  emptyCellCount: number;
  duplicateRowCount: number;
  imageCount: number;
  linkCount: number;
  extractionTimeMs: number;
  estimatedExportBytes: number;
}
