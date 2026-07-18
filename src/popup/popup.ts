import type { RuntimeMessage } from '@dtypes/messages';
import type { DetectionCandidate } from '@dtypes/detection';
import { generateId } from '@core/utils/id';

const els = {
  pageTitle: document.getElementById('wds-page-title') as HTMLParagraphElement,
  status: document.getElementById('wds-status') as HTMLParagraphElement,
  results: document.getElementById('wds-results') as HTMLElement,
  list: document.getElementById('wds-candidate-list') as HTMLUListElement,
  scanBtn: document.getElementById('btn-scan') as HTMLButtonElement,
  pickerBtn: document.getElementById('btn-picker') as HTMLButtonElement,
  studioBtn: document.getElementById('btn-studio') as HTMLButtonElement
};

function setStatus(text: string): void {
  els.status.textContent = text;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadActiveTabInfo(): Promise<void> {
  const tab = await getActiveTab();
  els.pageTitle.textContent = tab?.title ?? tab?.url ?? '—';
}

function candidateLabel(candidate: DetectionCandidate): string {
  const kindLabel = candidate.kind.replace(/-/g, ' ');
  return `${kindLabel} · ${candidate.approxItemCount} items`;
}

function renderCandidates(candidates: DetectionCandidate[]): void {
  els.list.innerHTML = '';
  if (candidates.length === 0) {
    els.results.hidden = true;
    setStatus('No extractable data detected on this page.');
    return;
  }

  els.results.hidden = false;
  for (const candidate of candidates) {
    const li = document.createElement('li');
    li.className = 'wds-candidate-item';
    li.innerHTML = `<div class="kind">${candidateLabel(candidate)}</div><div class="meta">${candidate.element.tagName}${
      candidate.element.id ? '#' + candidate.element.id : ''
    } · ${candidate.library}</div>`;
    li.addEventListener('click', () => void extractAndOpenStudio(candidate));
    els.list.appendChild(li);
  }
  setStatus(`Found ${candidates.length} candidate${candidates.length === 1 ? '' : 's'}.`);
}

async function scanActiveTab(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('No active tab.');
    return;
  }
  setStatus('Scanning page…');
  try {
    const message: RuntimeMessage = { type: 'SCAN_PAGE', requestId: generateId('req') };
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as RuntimeMessage;
    if (response?.type === 'SCAN_RESULT') {
      renderCandidates(response.candidates);
    } else {
      setStatus('Scan failed to return results.');
    }
  } catch {
    setStatus('Could not reach this page (try refreshing it first).');
  }
}

async function startPicker(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const message: RuntimeMessage = { type: 'PICKER_START' };
  await chrome.tabs.sendMessage(tab.id, message).catch(() => setStatus('Could not start picker on this page.'));
  window.close();
}

async function extractAndOpenStudio(candidate: DetectionCandidate): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;

  // chrome.sidePanel.open() must be called directly within the click's user
  // gesture — routing it through a runtime message to the background service
  // worker loses that gesture context and makes the call silently fail. So we
  // open the panel first (still inside this click handler), then extract and
  // hand the result off via session storage, which the panel's init() picks
  // up (with a storage.onChanged fallback for the case where the panel is
  // still loading when the result lands).
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    setStatus('Could not open the studio panel.');
    return;
  }

  setStatus('Extracting…');
  const message: RuntimeMessage = {
    type: 'EXTRACT_REQUEST',
    requestId: generateId('req'),
    rootSelector: candidate.element.cssSelector,
    kind: candidate.kind
  };
  try {
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as RuntimeMessage;
    if (response?.type === 'EXTRACT_RESULT') {
      await chrome.storage.session.set({ 'wds:pending-extraction': response.result });
      window.close();
    } else if (response?.type === 'EXTRACT_ERROR') {
      setStatus(response.message);
    }
  } catch {
    setStatus('Extraction failed.');
  }
}

async function openStudio(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  } catch {
    setStatus('Could not open the studio panel.');
  }
}

els.scanBtn.addEventListener('click', () => void scanActiveTab());
els.pickerBtn.addEventListener('click', () => void startPicker());
els.studioBtn.addEventListener('click', () => void openStudio());

void loadActiveTabInfo();
