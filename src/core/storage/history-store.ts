import type { ExtractionResult } from '@types/extraction';

const HISTORY_KEY = 'wds:history';
const BOOKMARKS_KEY = 'wds:bookmarks';
const MAX_HISTORY_ENTRIES = 100;

export interface HistoryEntry {
  id: string;
  createdAt: number;
  sourceUrl: string;
  sourceTitle: string;
  rowCount: number;
  columnCount: number;
  /** Full result is kept alongside the summary so re-opening history is instant. */
  result: ExtractionResult;
}

export interface SavedSelector {
  id: string;
  name: string;
  sourceUrl: string;
  rootSelector: string;
  kind: ExtractionResult['extractorKind'];
  createdAt: number;
}

async function getArray<T>(key: string): Promise<T[]> {
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

async function setArray<T>(key: string, value: T[]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function addHistoryEntry(result: ExtractionResult): Promise<void> {
  const entries = await getArray<HistoryEntry>(HISTORY_KEY);
  const entry: HistoryEntry = {
    id: result.id,
    createdAt: result.createdAt,
    sourceUrl: result.sourceUrl,
    sourceTitle: result.sourceTitle,
    rowCount: result.stats.rowCount,
    columnCount: result.stats.columnCount,
    result
  };
  entries.unshift(entry);
  await setArray(HISTORY_KEY, entries.slice(0, MAX_HISTORY_ENTRIES));
}

export async function listHistory(): Promise<HistoryEntry[]> {
  return getArray<HistoryEntry>(HISTORY_KEY);
}

export async function removeHistoryEntry(id: string): Promise<void> {
  const entries = await getArray<HistoryEntry>(HISTORY_KEY);
  await setArray(HISTORY_KEY, entries.filter((e) => e.id !== id));
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.remove(HISTORY_KEY);
}

export async function addBookmark(selector: SavedSelector): Promise<void> {
  const bookmarks = await getArray<SavedSelector>(BOOKMARKS_KEY);
  bookmarks.unshift(selector);
  await setArray(BOOKMARKS_KEY, bookmarks);
}

export async function listBookmarks(): Promise<SavedSelector[]> {
  return getArray<SavedSelector>(BOOKMARKS_KEY);
}

export async function removeBookmark(id: string): Promise<void> {
  const bookmarks = await getArray<SavedSelector>(BOOKMARKS_KEY);
  await setArray(BOOKMARKS_KEY, bookmarks.filter((b) => b.id !== id));
}
