import './content.css';
import type { RuntimeMessage } from '@types/messages';
import { scanPage } from '@core/detection/scanner';
import { extractTable } from '@core/extractors/table-extractor';
import { ElementPicker } from './picker/overlay';

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
        const result = extractTable(root);
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
