import './content.css';
import type { RuntimeMessage } from '@dtypes/messages';
import { scanPage } from '@core/detection/scanner';
import { extractTable } from '@core/extractors/table-extractor';
import { extractRepeated } from '@core/extractors/repeated-extractor';
import type { DetectionCandidate } from '@dtypes/detection';
import { ElementPicker } from './picker/overlay';
import { startResourceObserver, getAccumulatedResources } from './detectors/resource-observer';
import { collectResourceCandidates, materializeCandidates } from './detectors/resource-scanner';
import { generateId } from '@core/utils/id';

// Start watching for lazily-loaded / virtualized media as soon as the
// content script lands, so history from before the panel is even opened
// (e.g. messages already scrolled past) is captured, not just whatever is
// on screen at the moment Rescan is clicked.
startResourceObserver();

/** Routes a resolved root element to the extractor matching its detected kind. */
function runExtractor(root: Element, kind: DetectionCandidate['kind']) {
  switch (kind) {
    case 'html-table':
    case 'div-table':
    case 'data-grid-lib':
      return extractTable(root);
    case 'list':
      return extractRepeated(root, 'list');
    case 'card-grid':
      return extractRepeated(root, 'card');
    case 'form':
    case 'tree':
    case 'unknown':
    default:
      return extractRepeated(root, 'custom');
  }
}

const picker = new ElementPicker(
  (descriptor) => {
    void chrome.runtime.sendMessage({ type: 'PICKER_HOVER', element: descriptor } satisfies RuntimeMessage);
  },
  (descriptor) => {
    void chrome.runtime.sendMessage({ type: 'PICKER_SELECT', element: descriptor } satisfies RuntimeMessage);
  }
);

function findExtractionRoot(rootSelector: string): Element | null {
  try {
    return document.querySelector(rootSelector);
  } catch {
    return null;
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'PICKER_START':
      picker.start();
      sendResponse({ ok: true });
      return false;

    case 'PICKER_STOP':
      picker.stop();
      sendResponse({ ok: true });
      return false;

    case 'SCAN_PAGE': {
      const candidates = scanPage();
      const response: RuntimeMessage = { type: 'SCAN_RESULT', requestId: message.requestId, candidates };
      sendResponse(response);
      return false;
    }

    case 'EXTRACT_REQUEST': {
      const root = findExtractionRoot(message.rootSelector);
      if (!root) {
        const errRes: RuntimeMessage = {
          type: 'EXTRACT_ERROR',
          requestId: message.requestId,
          message: `Could not resolve selector: ${message.rootSelector}`
        };
        sendResponse(errRes);
        return false;
      }
      try {
        const result = runExtractor(root, message.kind);
        result.rootSelector = message.rootSelector;
        const okRes: RuntimeMessage = { type: 'EXTRACT_RESULT', requestId: message.requestId, result };
        sendResponse(okRes);
      } catch (err) {
        const errRes: RuntimeMessage = {
          type: 'EXTRACT_ERROR',
          requestId: message.requestId,
          message: err instanceof Error ? err.message : 'Unknown extraction error'
        };
        sendResponse(errRes);
      }
      return false;
    }

    case 'SCAN_FILES_REQUEST': {
      const items = getAccumulatedResources();
      const response: RuntimeMessage = {
        type: 'SCAN_FILES_RESULT',
        requestId: message.requestId,
        result: {
          id: generateId('resscan'),
          createdAt: Date.now(),
          sourceUrl: location.href,
          sourceTitle: document.title,
          items
        }
      };
      sendResponse(response);
      return false;
    }

    case 'SCAN_FILES_IN_ELEMENT_REQUEST': {
      const root = findExtractionRoot(message.rootSelector);
      if (!root) {
        const errRes: RuntimeMessage = {
          type: 'SCAN_FILES_IN_ELEMENT_ERROR',
          requestId: message.requestId,
          message: `Could not resolve selector: ${message.rootSelector}`
        };
        sendResponse(errRes);
        return false;
      }
      const items = materializeCandidates(collectResourceCandidates(root));
      const response: RuntimeMessage = {
        type: 'SCAN_FILES_RESULT',
        requestId: message.requestId,
        result: {
          id: generateId('resscan'),
          createdAt: Date.now(),
          sourceUrl: location.href,
          sourceTitle: `${document.title} — selected element`,
          items
        }
      };
      sendResponse(response);
      return false;
    }

    default:
      return false;
  }
});

// Allow the descriptor picker to resolve an element back for programmatic
// re-highlighting (e.g. when the sidepanel hovers a saved candidate).
export function highlightBySelector(selector: string): void {
  try {
    const el = document.querySelector(selector);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch {
    /* invalid selector — ignore */
  }
}
