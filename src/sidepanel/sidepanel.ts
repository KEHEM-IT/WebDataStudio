import type { RuntimeMessage } from '@types/messages';
import type { DetectionCandidate } from '@types/detection';
import type { ExtractionResult, CellValue } from '@types/extraction';
import { exportAs, type ExportFormat } from '@core/exporters';
import { addHistoryEntry, listHistory, removeHistoryEntry } from '@core/storage';
import { generateId } from '@core/utils/id';
import { normalizeWhitespace, toTitleCase } from '@core/utils/text';

const els = {
  rescan: document.getElementById('btn-rescan') as HTMLButtonElement,
  pick: document.getElementById('btn-pick') as HTMLButtonElement,
  status: document.getElementById('wds-status') as HTMLParagraphElement,
  tabs: document.getElementById('wds-tabs') as HTMLElement,
  explorerList: document.getElementById('explorer-list') as HTMLUListElement,
  previewStats: document.getElementById('preview-stats') as HTMLDivElement,
  previewTable: document.getElementById('preview-table') as HTMLTableElement,
  exportPreview: document.getElementById('export-preview') as HTMLTextAreaElement,
  copyBtn: document.getElementById('btn-copy') as HTMLButtonElement,
  downloadBtn: document.getElementById('btn-download') as HTMLButtonElement,
  historyList: document.getElementById('history-list') as HTMLUListElement
};

let currentResult: ExtractionResult | null = null;
let currentExportFormat: ExportFormat = 'json';

function setStatus(text: string): void {
  els.status.textContent = text;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function switchTab(name: string): void {
  document.querySelectorAll<HTMLButtonElement>('.wds-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll<HTMLElement>('.wds-panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
  if (name === 'history') void renderHistory();
  if (name === 'export') renderExportPreview();
}

els.tabs.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.wds-tab');
  if (btn?.dataset.tab) switchTab(btn.dataset.tab);
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function candidateLabel(candidate: DetectionCandidate): string {
  const kindLabel = candidate.kind.replace(/-/g, ' ');
  return `${kindLabel} · ${candidate.approxItemCount} items · ${candidate.library}`;
}

function renderExplorer(candidates: DetectionCandidate[]): void {
  els.explorerList.innerHTML = '';
  if (candidates.length === 0) {
    els.explorerList.innerHTML =
      '<li class="wds-hint">No extractable data detected. Try Rescan or Pick element.</li>';
    return;
  }
  for (const candidate of candidates) {
    const li = document.createElement('li');
    const idSuffix = candidate.element.id ? '#' + candidate.element.id : '';
    li.innerHTML = `<div class="kind">${escapeHtml(candidateLabel(candidate))}</div><div class="meta">${escapeHtml(
      candidate.element.tagName + idSuffix
    )}</div>`;
    li.addEventListener('click', () => void extractCandidate(candidate));
    els.explorerList.appendChild(li);
  }
}

async function rescan(): Promise<void> {
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
      renderExplorer(response.candidates);
      setStatus(`Found ${response.candidates.length} candidate(s).`);
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
  setStatus('Click an element on the page to select it…');
}

async function extractCandidate(candidate: DetectionCandidate): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
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
      await loadResult(response.result);
    } else if (response?.type === 'EXTRACT_ERROR') {
      setStatus(response.message);
    }
  } catch {
    setStatus('Extraction failed.');
  }
}

async function loadResult(result: ExtractionResult): Promise<void> {
  currentResult = result;
  renderPreview();
  switchTab('preview');
  setStatus(`Extracted ${result.stats.rowCount} rows × ${result.stats.columnCount} columns.`);
  await addHistoryEntry(result);
}

function cellText(cell: CellValue | undefined): string {
  return cell ? cell.raw : '';
}

function renderPreview(): void {
  if (!currentResult) return;
  const { columns, rows, stats } = currentResult;
  els.previewStats.innerHTML = [
    `Rows: ${stats.rowCount}`,
    `Columns: ${stats.columnCount}`,
    `Cells: ${stats.cellCount}`,
    `Empty: ${stats.emptyCellCount}`,
    `Duplicates: ${stats.duplicateRowCount}`,
    `Images: ${stats.imageCount}`,
    `Links: ${stats.linkCount}`,
    `${stats.extractionTimeMs}ms`
  ]
    .map((s) => `<span>${escapeHtml(s)}</span>`)
    .join('');

  const thead = `<thead><tr>${columns.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .slice(0, 500)
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td title="${escapeAttr(cellText(row[c.name]))}">${escapeHtml(cellText(row[c.name]))}</td>`)
          .join('')}</tr>`
    )
    .join('')}</tbody>`;
  els.previewTable.innerHTML = thead + tbody;
}

function recomputeStats(): void {
  if (!currentResult) return;
  const { columns, rows } = currentResult;
  let emptyCellCount = 0;
  let imageCount = 0;
  let linkCount = 0;
  const seen = new Set<string>();
  let duplicateRowCount = 0;
  for (const row of rows) {
    const parts: string[] = [];
    for (const col of columns) {
      const cell = row[col.name];
      if (!cell || cell.raw.length === 0) emptyCellCount += 1;
      if (cell?.src) imageCount += 1;
      if (cell?.href) linkCount += 1;
      parts.push(cell?.raw ?? '');
    }
    const key = parts.join('|');
    if (seen.has(key)) duplicateRowCount += 1;
    seen.add(key);
  }
  currentResult.stats.rowCount = rows.length;
  currentResult.stats.columnCount = columns.length;
  currentResult.stats.cellCount = rows.length * columns.length;
  currentResult.stats.emptyCellCount = emptyCellCount;
  currentResult.stats.duplicateRowCount = duplicateRowCount;
  currentResult.stats.imageCount = imageCount;
  currentResult.stats.linkCount = linkCount;
}

function applyCellTransform(fn: (raw: string) => string): void {
  if (!currentResult) return;
  for (const row of currentResult.rows) {
    for (const col of currentResult.columns) {
      const cell = row[col.name];
      if (!cell) continue;
      cell.raw = fn(cell.raw);
      if (typeof cell.value === 'string') cell.value = cell.raw;
    }
  }
  recomputeStats();
  renderPreview();
}

function dedupeRows(): void {
  if (!currentResult) return;
  const seen = new Set<string>();
  const cols = currentResult.columns;
  currentResult.rows = currentResult.rows.filter((row) => {
    const key = cols.map((c) => row[c.name]?.raw ?? '').join('␟');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  recomputeStats();
  renderPreview();
}

function removeEmptyRows(): void {
  if (!currentResult) return;
  const cols = currentResult.columns;
  currentResult.rows = currentResult.rows.filter((row) =>
    cols.some((c) => (row[c.name]?.raw ?? '').trim() !== '')
  );
  recomputeStats();
  renderPreview();
}

function removeEmptyColumns(): void {
  if (!currentResult) return;
  const rows = currentResult.rows;
  currentResult.columns = currentResult.columns.filter((c) =>
    rows.some((row) => (row[c.name]?.raw ?? '').trim() !== '')
  );
  recomputeStats();
  renderPreview();
}

document.querySelectorAll<HTMLButtonElement>('[data-op]').forEach((btn) => {
  btn.addEventListener('click', () => {
    switch (btn.dataset.op) {
      case 'trim':
        applyCellTransform(normalizeWhitespace);
        break;
      case 'dedupe-rows':
        dedupeRows();
        break;
      case 'remove-empty-rows':
        removeEmptyRows();
        break;
      case 'remove-empty-cols':
        removeEmptyColumns();
        break;
      case 'upper':
        applyCellTransform((s) => s.toUpperCase());
        break;
      case 'lower':
        applyCellTransform((s) => s.toLowerCase());
        break;
      case 'title':
        applyCellTransform(toTitleCase);
        break;
    }
    setStatus('Cleaning operation applied.');
  });
});

function renderExportPreview(): void {
  if (!currentResult) {
    els.exportPreview.value = '';
    return;
  }
  els.exportPreview.value = exportAs(currentResult, currentExportFormat).content;
}

document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentExportFormat = btn.dataset.format as ExportFormat;
    document
      .querySelectorAll<HTMLButtonElement>('[data-format]')
      .forEach((b) => b.classList.toggle('wds-btn-primary', b === btn));
    renderExportPreview();
  });
});

els.copyBtn.addEventListener('click', () => {
  if (!els.exportPreview.value) return;
  void navigator.clipboard.writeText(els.exportPreview.value).then(() => setStatus('Copied to clipboard.'));
});

els.downloadBtn.addEventListener('click', () => {
  if (!currentResult) return;
  const output = exportAs(currentResult, currentExportFormat);
  const blob = new Blob([output.content], { type: output.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `web-data-studio-export.${output.fileExtension}`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Download started.');
});

async function renderHistory(): Promise<void> {
  const entries = await listHistory();
  els.historyList.innerHTML = '';
  if (entries.length === 0) {
    els.historyList.innerHTML = '<li class="wds-hint">No extraction history yet.</li>';
    return;
  }
  for (const entry of entries) {
    const li = document.createElement('li');
    li.innerHTML = `<div class="kind">${escapeHtml(entry.sourceTitle || entry.sourceUrl)}</div><div class="meta">${
      entry.rowCount
    } rows × ${entry.columnCount} cols · ${new Date(entry.createdAt).toLocaleString()}</div>`;
    li.addEventListener('click', () => void loadResult(entry.result));
    const del = document.createElement('button');
    del.textContent = 'Remove';
    del.className = 'wds-btn wds-btn-sm';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      void removeHistoryEntry(entry.id).then(() => void renderHistory());
    });
    li.appendChild(del);
    els.historyList.appendChild(li);
  }
}

els.rescan.addEventListener('click', () => void rescan());
els.pick.addEventListener('click', () => void startPicker());

async function extractSelectedElement(selector: string): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  setStatus('Extracting selection…');
  const req: RuntimeMessage = {
    type: 'EXTRACT_REQUEST',
    requestId: generateId('req'),
    rootSelector: selector,
    kind: 'unknown'
  };
  try {
    const response = (await chrome.tabs.sendMessage(tab.id, req)) as RuntimeMessage;
    if (response?.type === 'EXTRACT_RESULT') await loadResult(response.result);
    else if (response?.type === 'EXTRACT_ERROR') setStatus(response.message);
  } catch {
    setStatus('Extraction failed.');
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === 'PICKER_SELECT') {
    void extractSelectedElement(message.element.cssSelector);
  }
});

async function init(): Promise<void> {
  try {
    const pending = await chrome.storage.session.get('wds:pending-extraction');
    const stored = pending['wds:pending-extraction'] as ExtractionResult | undefined;
    if (stored) {
      await chrome.storage.session.remove('wds:pending-extraction');
      await loadResult(stored);
      return;
    }
  } catch {
    /* session storage unavailable — fall through to a fresh scan */
  }
  void rescan();
}

void init();
