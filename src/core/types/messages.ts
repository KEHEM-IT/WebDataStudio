import type { DetectionCandidate } from './detection';
import type { ExtractionResult } from './extraction';
import type { ElementDescriptor } from './element';
import type { ResourceScanResult } from './resource';

/** Runtime message protocol shared by background <-> content <-> popup/sidepanel.
 *  Every message is a discriminated union on `type` for exhaustive handling. */
export type RuntimeMessage =
  | { type: 'PICKER_START' }
  | { type: 'PICKER_STOP' }
  | { type: 'PICKER_HOVER'; element: ElementDescriptor | null }
  | { type: 'PICKER_SELECT'; element: ElementDescriptor }
  | { type: 'SCAN_PAGE'; requestId: string }
  | { type: 'SCAN_RESULT'; requestId: string; candidates: DetectionCandidate[] }
  | { type: 'EXTRACT_REQUEST'; requestId: string; rootSelector: string; kind: DetectionCandidate['kind'] }
  | { type: 'EXTRACT_RESULT'; requestId: string; result: ExtractionResult }
  | { type: 'EXTRACT_ERROR'; requestId: string; message: string }
  | { type: 'SCAN_FILES_REQUEST'; requestId: string }
  | { type: 'SCAN_FILES_RESULT'; requestId: string; result: ResourceScanResult }
  | { type: 'SCAN_FILES_IN_ELEMENT_REQUEST'; requestId: string; rootSelector: string }
  | { type: 'SCAN_FILES_IN_ELEMENT_ERROR'; requestId: string; message: string }
  | { type: 'OPEN_SIDE_PANEL' }
  | { type: 'GET_ACTIVE_TAB_INFO' }
  | { type: 'ACTIVE_TAB_INFO'; url: string; title: string; tabId: number };

export type MessageOf<T extends RuntimeMessage['type']> = Extract<RuntimeMessage, { type: T }>;
