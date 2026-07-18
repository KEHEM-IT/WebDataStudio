import type { RuntimeMessage } from '@dtypes/messages';
import type { DetectionCandidate } from '@dtypes/detection';
import type { ElementDescriptor } from '@dtypes/element';
import type { ExtractionResult, CellValue } from '@dtypes/extraction';
import type { ResourceScanResult, ResourceItem, ResourceCategory } from '@dtypes/resource';
import { exportAs, type ExportFormat } from '@core/exporters';
import { addHistoryEntry, listHistory, removeHistoryEntry, clearHistory } from '@core/storage';
import { buildResourceZip, downloadBlob } from '@core/resources/zip-builder';
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
  historyList: document.getElementById('history-list') as HTMLUListElement,
  historyClear: document.getElementById('btn-history-clear') as HTMLButtonElement,
  search: document.getElementById('wds-search') as HTMLInputElement,
  filesStats: document.getElementById('files-stats') as HTMLDivElement,
  filesGroups: document.getElementById('files-groups') as HTMLDivElement,
  filesProgress: document.getElementById('files-progress') as HTMLDivElement,
  filesRescan: document.getElementById('btn-files-rescan') as HTMLButtonElement,
  filesPick: document.getElementById('btn-files-pick') as HTMLButtonElement,
  filesSelectAll: document.getElementById('btn-files-select-all') as HTMLButtonElement,
  filesSelectNone: document.getElementById('btn-files-select-none') as HTMLButtonElement,
  filesZipSelected: document.getElementById('btn-files-zip-selected') as HTMLButtonElement,
  filesZipAll: document.getElementById('btn-files-zip-all') as HTMLButtonElement,
  filePreview: document.getElementById('wds-file-preview') as HTMLImageElement
};

let currentResult: ExtractionResult | null = null;
let currentExportFormat: ExportFormat = 'json';
let currentResources: ResourceScanResult | null = null;
const selectedResourceUrls = new Set<string>();

function setStatus(text: string, loading = false): void {
  if (!loading) {
    els.status.textContent = text;
    return;
  }
  els.status.innerHTML = '';
  const spinner = document.createElement('span');
  spinner.className = 'wds-spinner';
  els.status.append(spinner, document.createTextNode(text));
}

/** Shows a spinner in place of a button's label and disables it while an
 *  async action (rescan, extraction, etc.) is in flight. */
function setButtonLoading(btn: HTMLButtonElement, loading: boolean): void {
  btn.classList.toggle('is-loading', loading);
  btn.disabled = loading;
  if (loading) {
    if (!btn.querySelector('.wds-spinner')) {
      const spinner = document.createElement('span');
      spinner.className = 'wds-spinner';
      btn.appendChild(spinner);
    }
  } else {
    btn.querySelector('.wds-spinner')?.remove();
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const SEARCH_PLACEHOLDERS: Record<string, string> = {
  explorer: 'Search candidates…',
  preview: 'Search rows…',
  files: 'Search files…',
  export: 'Search formats…',
  history: 'Search history…'
};

function switchTab(name: string): void {
  document.querySelectorAll<HTMLButtonElement>('.wds-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  document.querySelectorAll<HTMLElement>('.wds-panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${name}`;
  });
  // Search is scoped to whichever tab is active, so switching tabs starts
  // with a clean slate rather than applying a stale query to new content.
  els.search.value = '';
  els.search.placeholder = SEARCH_PLACEHOLDERS[name] ?? 'Search…';
  if (name === 'history') void renderHistory();
  if (name === 'export') renderExportPreview();
  if (name === 'files' && !currentResources) void scanFiles();
  applySearchFilter();
}

els.tabs.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.wds-tab');
  if (btn?.dataset.tab) switchTab(btn.dataset.tab);
});

function currentActiveTab(): string {
  return document.querySelector<HTMLButtonElement>('.wds-tab.active')?.dataset.tab ?? 'explorer';
}

/** Live-filters whichever list/table/buttons belong to the active tab.
 *  Re-run after any render*() call so edits, rescans, or format switches
 *  don't silently drop an in-progress search term. */
function applySearchFilter(): void {
  const query = els.search.value.trim().toLowerCase();
  const tab = currentActiveTab();

  if (tab === 'explorer') {
    els.explorerList.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      li.hidden = query.length > 0 && !(li.textContent ?? '').toLowerCase().includes(query);
    });
  } else if (tab === 'preview') {
    els.previewTable.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      tr.hidden = query.length > 0 && !(tr.textContent ?? '').toLowerCase().includes(query);
    });
  } else if (tab === 'history') {
    els.historyList.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      li.hidden = query.length > 0 && !(li.textContent ?? '').toLowerCase().includes(query);
    });
  } else if (tab === 'export') {
    document.querySelectorAll<HTMLButtonElement>('.wds-export-grid [data-format]').forEach((btn) => {
      btn.hidden = query.length > 0 && !(btn.textContent ?? '').toLowerCase().includes(query);
    });
  } else if (tab === 'files') {
    const anyVisibleInGroup = new Map<HTMLElement, boolean>();
    els.filesGroups.querySelectorAll<HTMLElement>('.wds-file-item').forEach((item) => {
      const match = query.length === 0 || (item.textContent ?? '').toLowerCase().includes(query);
      item.hidden = !match;
      const group = item.closest<HTMLElement>('.wds-file-group');
      if (group) anyVisibleInGroup.set(group, (anyVisibleInGroup.get(group) ?? false) || match);
    });
    els.filesGroups.querySelectorAll<HTMLElement>('.wds-file-group').forEach((group) => {
      group.hidden = query.length > 0 && !anyVisibleInGroup.get(group);
    });
  }
}

els.search.addEventListener('input', applySearchFilter);

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
  applySearchFilter();
}

/** Clears all in-memory session state (extracted result, preview, export
 *  preview, file scan, selections) so a rescan starts clean instead of
 *  mixing stale data from a previous page/extraction. History lives in
 *  chrome.storage.local (see history-store.ts) and is untouched by this. */
function resetSessionState(): void {
  currentResult = null;
  currentResources = null;
  selectedResourceUrls.clear();
  renderPreview();
  els.previewStats.innerHTML = '';
  els.previewTable.innerHTML = '';
  renderExportPreview();
  renderFiles();
}

async function rescan(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('No active tab.');
    return;
  }
  setButtonLoading(els.rescan, true);
  setStatus('Scanning page…', true);
  resetSessionState();
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
  } finally {
    setButtonLoading(els.rescan, false);
  }
}

let pickerMode: 'extract' | 'files' = 'extract';
let pickerActive = false;
let activePickerBtn: HTMLButtonElement | null = null;

function setPickerButtonActive(btn: HTMLButtonElement | null, active: boolean): void {
  btn?.classList.toggle('is-active', active);
}

/** Clicking a Pick element button starts the picker; clicking the SAME
 *  button again (while it's still listening) cancels it instead of
 *  restarting a fresh session. Clicking the OTHER pick button while one is
 *  active switches modes rather than requiring an explicit cancel first. */
async function startPicker(mode: 'extract' | 'files' = 'extract'): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const btn = mode === 'files' ? els.filesPick : els.pick;

  if (pickerActive && pickerMode === mode) {
    const message: RuntimeMessage = { type: 'PICKER_STOP' };
    await chrome.tabs.sendMessage(tab.id, message).catch(() => {
      /* content script already gone (e.g. navigated away) — nothing to stop */
    });
    pickerActive = false;
    setPickerButtonActive(activePickerBtn, false);
    activePickerBtn = null;
    setStatus('Picker cancelled.');
    return;
  }

  pickerMode = mode;
  setPickerButtonActive(activePickerBtn, false);
  activePickerBtn = btn;
  pickerActive = true;
  setPickerButtonActive(btn, true);
  const message: RuntimeMessage = { type: 'PICKER_START' };
  await chrome.tabs.sendMessage(tab.id, message).catch(() => {
    setStatus('Could not start picker on this page.');
    pickerActive = false;
    setPickerButtonActive(btn, false);
    activePickerBtn = null;
  });
  setStatus(
    mode === 'files' ? 'Click an element on the page to scan its files…' : 'Click an element on the page to select it…'
  );
}

/** The picker can also stop itself on the page side (Escape key, or right
 *  after a click-select fires PICKER_SELECT) without the sidepanel telling
 *  it to. overlay.ts's stop() always emits a PICKER_HOVER with a null
 *  element as its last act, so that's the one signal that reliably covers
 *  every stop path — use it to keep the button's active state in sync. */
function handlePickerHover(element: ElementDescriptor | null): void {
  if (element !== null) return;
  pickerActive = false;
  setPickerButtonActive(activePickerBtn, false);
  activePickerBtn = null;
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

function renderStatsBar(): void {
  if (!currentResult) return;
  const { stats } = currentResult;
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
}

function renderPreview(): void {
  if (!currentResult) return;
  const { columns, rows } = currentResult;
  renderStatsBar();

  const thead = `<thead><tr><th class="wds-col-actions"></th>${columns
    .map(
      (c) =>
        `<th><span class="wds-th-name" contenteditable="true" data-col="${escapeAttr(
          c.name
        )}" title="${escapeAttr(c.name)}">${escapeHtml(c.name)}</span><button class="wds-th-del" data-del-col="${escapeAttr(
          c.name
        )}" title="Delete column">×</button></th>`
    )
    .join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .slice(0, 500)
    .map(
      (row, i) =>
        `<tr><td class="wds-row-actions"><button class="wds-td-del" data-del-row="${i}" title="Delete row">×</button></td>${columns
          .map(
            (c) =>
              `<td contenteditable="true" data-row="${i}" data-col="${escapeAttr(
                c.name
              )}" title="${escapeAttr(cellText(row[c.name]))}">${escapeHtml(cellText(row[c.name]))}</td>`
          )
          .join('')}</tr>`
    )
    .join('')}</tbody>`;
  els.previewTable.innerHTML = thead + tbody;
  applySearchFilter();
}

function commitCellEdit(td: HTMLTableCellElement): void {
  if (!currentResult) return;
  const rowIndex = Number(td.dataset.row);
  const colName = td.dataset.col ?? '';
  const row = currentResult.rows[rowIndex];
  if (!row || !colName) return;
  const newText = td.textContent ?? '';
  const cell: CellValue = row[colName] ?? { raw: '', value: '', type: 'string' };
  cell.raw = newText;
  if (typeof cell.value !== 'number' && typeof cell.value !== 'boolean') cell.value = newText;
  row[colName] = cell;
  td.title = newText;
  recomputeStats();
  renderStatsBar();
}

function commitHeaderEdit(span: HTMLElement): void {
  if (!currentResult) return;
  const oldName = span.dataset.col ?? '';
  const col = currentResult.columns.find((c) => c.name === oldName);
  if (!col) return;

  const typed = normalizeWhitespace(span.textContent ?? '');
  if (!typed || typed === oldName) {
    // Empty or unchanged — snap the DOM back to the current name rather than
    // leaving a blank/whitespace-only header floating in the UI.
    renderPreview();
    return;
  }

  // Column names double as row keys, so a rename must stay unique or later
  // lookups (row[col.name]) would collide with an existing column.
  const taken = new Set(currentResult.columns.map((c) => c.name));
  let finalName = typed;
  let suffix = 2;
  while (taken.has(finalName) && finalName !== oldName) {
    finalName = `${typed}_${suffix}`;
    suffix += 1;
  }

  col.name = finalName;
  col.originalHeader = finalName;
  col.synthetic = false;
  for (const row of currentResult.rows) {
    if (oldName in row) {
      row[finalName] = row[oldName]!;
      if (finalName !== oldName) delete row[oldName];
    }
  }

  renderPreview();
  setStatus(`Column renamed to "${finalName}".`);
}

function deleteRow(index: number): void {
  if (!currentResult) return;
  currentResult.rows.splice(index, 1);
  recomputeStats();
  renderPreview();
  setStatus(`Row deleted — now ${currentResult.stats.rowCount} rows.`);
}

function deleteColumn(name: string): void {
  if (!currentResult) return;
  currentResult.columns = currentResult.columns.filter((c) => c.name !== name);
  for (const row of currentResult.rows) delete row[name];
  recomputeStats();
  renderPreview();
  setStatus(`Column deleted — now ${currentResult.stats.columnCount} columns.`);
}

els.previewTable.addEventListener('focusout', (e) => {
  const target = e.target as HTMLElement;
  const th = target.closest<HTMLElement>('.wds-th-name');
  if (th) {
    commitHeaderEdit(th);
    return;
  }
  const td = target.closest<HTMLTableCellElement>('td[data-col]');
  if (td) commitCellEdit(td);
});

els.previewTable.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const delRowBtn = target.closest<HTMLElement>('[data-del-row]');
  if (delRowBtn) {
    deleteRow(Number(delRowBtn.dataset.delRow));
    return;
  }
  const delColBtn = target.closest<HTMLElement>('[data-del-col]');
  if (delColBtn?.dataset.delCol) {
    deleteColumn(delColBtn.dataset.delCol);
  }
});

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

function applyCellTransform(fn: (raw: string) => string): boolean {
  if (!currentResult) return false;
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
  return true;
}

function dedupeRows(): boolean {
  if (!currentResult) return false;
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
  return true;
}

document.querySelectorAll<HTMLButtonElement>('[data-op]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!currentResult) {
      setStatus('Extract or select data first, then clean it here.');
      return;
    }
    let applied = false;
    switch (btn.dataset.op) {
      case 'trim':
        applied = applyCellTransform(normalizeWhitespace);
        break;
      case 'dedupe-rows':
        applied = dedupeRows();
        break;
      case 'upper':
        applied = applyCellTransform((s) => s.toUpperCase());
        break;
      case 'lower':
        applied = applyCellTransform((s) => s.toLowerCase());
        break;
      case 'title':
        applied = applyCellTransform(toTitleCase);
        break;
    }
    if (applied && currentResult) {
      setStatus(
        `Cleaning applied — now ${currentResult.stats.rowCount} rows × ${currentResult.stats.columnCount} columns.`
      );
    }
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
  els.historyClear.disabled = entries.length === 0;
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
  applySearchFilter();
}

els.historyClear.addEventListener('click', () => {
  if (els.historyClear.disabled) return;
  if (!confirm('Delete all extraction history? This cannot be undone.')) return;
  void clearHistory().then(() => {
    void renderHistory();
    setStatus('History cleared.');
  });
});

const CATEGORY_ORDER: ResourceCategory[] = ['image', 'video', 'audio', 'other'];
const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  image: 'Images',
  video: 'Video (incl. m3u8/mpd streams)',
  audio: 'Audio',
  other: 'Other files'
};

function groupResources(items: ResourceItem[]): Map<ResourceCategory, ResourceItem[]> {
  const groups = new Map<ResourceCategory, ResourceItem[]>();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const item of items) groups.get(item.category)?.push(item);
  return groups;
}

function renderFilesStats(): void {
  if (!currentResources) {
    els.filesStats.innerHTML = '';
    return;
  }
  const groups = groupResources(currentResources.items);
  els.filesStats.innerHTML = CATEGORY_ORDER.map(
    (cat) => `<span>${CATEGORY_LABELS[cat].split(' (')[0]}: ${groups.get(cat)?.length ?? 0}</span>`
  ).join('');
}

function fileItemHtml(item: ResourceItem): string {
  const thumb =
    item.category === 'image'
      ? `<img class="thumb" src="${escapeAttr(item.url)}" loading="lazy" alt="" />`
      : `<span class="thumb"></span>`;
  return `<label class="wds-file-item" title="${escapeAttr(item.url)}">
    <input type="checkbox" class="wds-file-check" data-url="${escapeAttr(item.url)}" ${
      selectedResourceUrls.has(item.url) ? 'checked' : ''
    } />
    ${thumb}
    <span class="name">${escapeHtml(item.filename)}</span>
    <span class="ext">${escapeHtml(item.ext || item.category)}</span>
    <button type="button" class="wds-btn wds-btn-sm" data-download-url="${escapeAttr(item.url)}" data-download-name="${escapeAttr(
      item.filename
    )}">Save</button>
  </label>`;
}

function renderFiles(): void {
  if (!currentResources) {
    els.filesGroups.innerHTML = '<p class="wds-hint">No scan yet — click Rescan files.</p>';
    return;
  }
  renderFilesStats();
  const groups = groupResources(currentResources.items);
  els.filesGroups.innerHTML = CATEGORY_ORDER.filter((cat) => (groups.get(cat)?.length ?? 0) > 0)
    .map((cat) => {
      const items = groups.get(cat) ?? [];
      return `<div class="wds-file-group">
        <div class="wds-file-group-header">
          <span>${CATEGORY_LABELS[cat]}<span class="count"> · ${items.length}</span></span>
          <button type="button" class="wds-btn wds-btn-sm" data-zip-category="${cat}">Zip this group</button>
        </div>
        <div class="wds-file-group-body">${items.map(fileItemHtml).join('')}</div>
      </div>`;
    })
    .join('');
  if (currentResources.items.length === 0) {
    els.filesGroups.innerHTML = '<p class="wds-hint">No downloadable resources found on this page.</p>';
  }
  applySearchFilter();
}

async function scanFiles(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) {
    setStatus('No active tab.');
    return;
  }
  setButtonLoading(els.filesRescan, true);
  setStatus('Scanning files…', true);
  try {
    const message: RuntimeMessage = { type: 'SCAN_FILES_REQUEST', requestId: generateId('req') };
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as RuntimeMessage;
    if (response?.type === 'SCAN_FILES_RESULT') {
      currentResources = response.result;
      selectedResourceUrls.clear();
      renderFiles();
      setStatus(`Found ${response.result.items.length} file resource(s).`);
    } else {
      setStatus('File scan failed to return results.');
    }
  } catch {
    setStatus('Could not reach this page (try refreshing it first).');
  } finally {
    setButtonLoading(els.filesRescan, false);
  }
}

// 'error' doesn't bubble, so this must be registered with useCapture to
// catch broken thumbnails via delegation instead of one listener per <img>.
els.filesGroups.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLElement;
    if (img.tagName === 'IMG') img.style.visibility = 'hidden';
  },
  true
);

const PREVIEW_MARGIN = 16;
const PREVIEW_MAX = 320;

function positionFilePreview(x: number, y: number): void {
  let left = x + PREVIEW_MARGIN;
  let top = y + PREVIEW_MARGIN;
  if (left + PREVIEW_MAX > window.innerWidth) left = x - PREVIEW_MAX - PREVIEW_MARGIN;
  if (top + PREVIEW_MAX > window.innerHeight) top = y - PREVIEW_MAX - PREVIEW_MARGIN;
  els.filePreview.style.left = `${Math.max(4, left)}px`;
  els.filePreview.style.top = `${Math.max(4, top)}px`;
}

// mouseover/mouseout (unlike mouseenter/mouseleave) bubble, so a single pair
// of delegated listeners on the container covers every thumbnail, including
// ones added later by a rescan.
els.filesGroups.addEventListener('mouseover', (e) => {
  const img = (e.target as HTMLElement).closest<HTMLImageElement>('img.thumb');
  if (!img?.src) return;
  els.filePreview.src = img.src;
  els.filePreview.classList.add('visible');
  positionFilePreview(e.clientX, e.clientY);
});

els.filesGroups.addEventListener('mousemove', (e) => {
  if (!els.filePreview.classList.contains('visible')) return;
  positionFilePreview(e.clientX, e.clientY);
});

els.filesGroups.addEventListener('mouseout', (e) => {
  const img = (e.target as HTMLElement).closest<HTMLImageElement>('img.thumb');
  if (!img) return;
  els.filePreview.classList.remove('visible');
  els.filePreview.removeAttribute('src');
});

els.filesGroups.addEventListener('change', (e) => {
  const check = (e.target as HTMLElement).closest<HTMLInputElement>('.wds-file-check');
  if (!check?.dataset.url) return;
  if (check.checked) selectedResourceUrls.add(check.dataset.url);
  else selectedResourceUrls.delete(check.dataset.url);
});

els.filesGroups.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const dl = target.closest<HTMLButtonElement>('[data-download-url]');
  if (dl?.dataset.downloadUrl) {
    e.preventDefault();
    void chrome.downloads.download({ url: dl.dataset.downloadUrl, filename: dl.dataset.downloadName, saveAs: false });
    return;
  }
  const zipCatBtn = target.closest<HTMLButtonElement>('[data-zip-category]');
  if (zipCatBtn?.dataset.zipCategory) {
    e.preventDefault();
    const cat = zipCatBtn.dataset.zipCategory as ResourceCategory;
    const items = currentResources?.items.filter((it) => it.category === cat) ?? [];
    void zipAndDownload(items, `web-data-studio-${cat}s.zip`);
  }
});

function setFilesProgress(text: string | null): void {
  els.filesProgress.hidden = !text;
  els.filesProgress.textContent = text ?? '';
}

async function zipAndDownload(items: ResourceItem[], zipFilename: string): Promise<void> {
  if (items.length === 0) {
    setStatus('Nothing to zip.');
    return;
  }
  setFilesProgress(`Zipping 0 / ${items.length}…`);
  try {
    const { blob, failed } = await buildResourceZip(items, (p) => setFilesProgress(`Zipping ${p.done} / ${p.total}…`));
    downloadBlob(blob, zipFilename);
    setStatus(
      failed.length > 0
        ? `Zip downloaded — ${failed.length} file(s) could not be fetched and were skipped.`
        : `Zip downloaded with ${items.length} file(s).`
    );
  } catch {
    setStatus('Zip creation failed.');
  } finally {
    setFilesProgress(null);
  }
}

async function scanFilesInElement(selector: string): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  setButtonLoading(els.filesPick, true);
  setStatus('Scanning selected element…', true);
  try {
    const message: RuntimeMessage = {
      type: 'SCAN_FILES_IN_ELEMENT_REQUEST',
      requestId: generateId('req'),
      rootSelector: selector
    };
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as RuntimeMessage;
    if (response?.type === 'SCAN_FILES_RESULT') {
      currentResources = response.result;
      selectedResourceUrls.clear();
      renderFiles();
      setStatus(`Found ${response.result.items.length} file resource(s) in the selected element.`);
    } else if (response?.type === 'SCAN_FILES_IN_ELEMENT_ERROR') {
      setStatus(response.message);
    } else {
      setStatus('Element file scan failed to return results.');
    }
  } catch {
    setStatus('Could not reach this page (try refreshing it first).');
  } finally {
    setButtonLoading(els.filesPick, false);
  }
}

els.filesRescan.addEventListener('click', () => void scanFiles());
els.filesPick.addEventListener('click', () => void startPicker('files'));
els.filesSelectAll.addEventListener('click', () => {
  if (!currentResources) return;
  for (const item of currentResources.items) selectedResourceUrls.add(item.url);
  renderFiles();
});
els.filesSelectNone.addEventListener('click', () => {
  selectedResourceUrls.clear();
  renderFiles();
});
els.filesZipSelected.addEventListener('click', () => {
  const items = currentResources?.items.filter((it) => selectedResourceUrls.has(it.url)) ?? [];
  void zipAndDownload(items, 'web-data-studio-selected.zip');
});
els.filesZipAll.addEventListener('click', () => {
  void zipAndDownload(currentResources?.items ?? [], 'web-data-studio-all-files.zip');
});

els.rescan.addEventListener('click', () => void rescan());
els.pick.addEventListener('click', () => void startPicker('extract'));

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
    if (pickerMode === 'files') void scanFilesInElement(message.element.cssSelector);
    else void extractSelectedElement(message.element.cssSelector);
  } else if (message.type === 'PICKER_HOVER') {
    handlePickerHover(message.element);
  }
});

// The panel can open (via popup's sidePanel.open() call, made early to keep
// the user-gesture context) before the popup has finished extracting and
// writing the result to session storage. init() below covers the case where
// the result is already there; this listener covers the case where it lands
// a moment later, after this panel has already checked and moved on.
let pendingHandled = false;
chrome.storage.session.onChanged?.addListener?.(
  (changes: { [key: string]: chrome.storage.StorageChange }) => {
    const change = changes['wds:pending-extraction'];
    if (!change?.newValue || pendingHandled) return;
    pendingHandled = true;
    void chrome.storage.session.remove('wds:pending-extraction').then(() => {
      void loadResult(change.newValue as ExtractionResult);
    });
  }
);

async function init(): Promise<void> {
  try {
    const pending = await chrome.storage.session.get('wds:pending-extraction');
    const stored = pending['wds:pending-extraction'] as ExtractionResult | undefined;
    if (stored) {
      pendingHandled = true;
      await chrome.storage.session.remove('wds:pending-extraction');
      await loadResult(stored);
      return;
    }
  } catch {
    /* session storage unavailable — fall through to a fresh scan */
  }
  // Give the popup's in-flight extraction (if any) a brief window to land via
  // the onChanged listener above before falling back to a fresh scan.
  setTimeout(() => {
    if (!pendingHandled) void rescan();
  }, 600);
}

void init();
