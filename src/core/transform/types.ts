import type { ExtractionResult } from '@dtypes/extraction';

/** Case conversion modes shared by cleaning and transform ops. */
export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence';

/** Column scope: omit/undefined to apply to every column, or a specific list. */
export type ColumnScope = string[] | undefined;

// ---------------------------------------------------------------------------
// Data Cleaning Studio — one-click, normalize-in-place operations. Most keep
// table shape; removeBlankRows/Columns, splitCells and mergeCells reshape it.
// ---------------------------------------------------------------------------
export type CleaningOperation =
  | { kind: 'trimWhitespace'; columns?: ColumnScope }
  | { kind: 'removeDuplicateRows' }
  | { kind: 'removeBlankRows' }
  | { kind: 'removeBlankColumns' }
  | { kind: 'normalizeUnicode'; columns?: ColumnScope }
  | { kind: 'decodeHtml'; columns?: ColumnScope }
  | { kind: 'stripHtml'; columns?: ColumnScope }
  | { kind: 'convertLineBreaks'; columns?: ColumnScope; replacement?: string }
  | { kind: 'mergeCells'; columns: string[]; targetColumn: string; separator?: string; removeSource?: boolean }
  | { kind: 'splitCells'; column: string; delimiter: string; newColumnNames?: string[]; removeSource?: boolean }
  | { kind: 'replaceValue'; columns?: ColumnScope; find: string; replaceWith: string }
  | { kind: 'regexReplace'; columns?: ColumnScope; pattern: string; flags?: string; replaceWith: string }
  | { kind: 'findAndReplace'; find: string; replaceWith: string; matchCase?: boolean; wholeWord?: boolean; columns?: ColumnScope }
  | { kind: 'convertCase'; columns?: ColumnScope; mode: CaseMode };

// ---------------------------------------------------------------------------
// Data Transformation Studio — structural reshaping + computed/formatted
// columns. Independently applicable; typically run after cleaning.
// ---------------------------------------------------------------------------
export type TransformOperation =
  | { kind: 'renameColumn'; column: string; newName: string }
  | { kind: 'reorderColumns'; order: string[] }
  | { kind: 'removeColumn'; column: string }
  | { kind: 'mergeColumns'; columns: string[]; targetColumn: string; separator?: string; removeSource?: boolean }
  | { kind: 'splitColumn'; column: string; delimiter: string; newColumnNames: string[]; removeSource?: boolean }
  | { kind: 'calculatedColumn'; name: string; expression: string }
  | { kind: 'conditionalValue'; targetColumn: string; condition: string; ifTrue: string; ifFalse: string }
  | { kind: 'regexTransform'; column: string; pattern: string; flags?: string; replaceWith: string }
  | { kind: 'formatDate'; column: string; outputFormat: string }
  | { kind: 'formatNumber'; column: string; decimals?: number; thousandsSeparator?: boolean }
  | { kind: 'formatCurrency'; column: string; symbol?: string; decimals?: number; thousandsSeparator?: boolean }
  | { kind: 'formatPhone'; column: string; format?: 'e164' | 'national' | 'dashed' }
  | { kind: 'validateEmail'; column: string }
  | { kind: 'normalizeUrl'; column: string };

/** A single pipeline step, tagged with which studio it belongs to so the UI
 *  can group/color them and future stages can be inserted independently. */
export type PipelineOperation =
  | ({ stage: 'clean' } & CleaningOperation)
  | ({ stage: 'transform' } & TransformOperation);

export interface StepOutcome {
  index: number;
  operation: PipelineOperation;
  ok: boolean;
  error?: string;
  rowsBefore: number;
  rowsAfter: number;
  columnsBefore: number;
  columnsAfter: number;
  durationMs: number;
}

export interface PipelineRunResult {
  result: ExtractionResult;
  steps: StepOutcome[];
  ok: boolean;
}
