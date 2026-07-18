import type { ResourceItem } from '@dtypes/resource';
import { collectResourceCandidates, materializeCandidates, MAX_ITEMS, type RawResourceCandidate } from './resource-scanner';

/** Messenger-style apps virtualize their message list two ways: (1) off-screen
 *  media gets unmounted entirely, and (2) — the trickier one — on-screen DOM
 *  nodes get *recycled*, with the same <img> having its `src` swapped as you
 *  scroll (image1 -> image2 -> image3 on the same node). A debounced
 *  "wait for things to settle, then re-scan the whole document" approach
 *  loses image1 and image2: by the time the debounce fires, the node has
 *  already moved on to image3.
 *
 *  So this reacts to each MutationRecord as it arrives, pulling the resource
 *  straight off the mutated element (or newly-added subtree) at that moment
 *  — no debounce, no re-scanning the whole page. Every distinct value a
 *  recycled node ever held gets captured, not just its final one.
 *
 *  That in-memory history only lives as long as this content-script instance
 *  does, though — reload the tab (or come back to the same conversation
 *  later) and a fresh instance starts with nothing. So accumulated results
 *  are also persisted to chrome.storage.local, keyed per page URL, and
 *  restored on startup — a reload loses only whatever happened in the
 *  SAVE_DEBOUNCE_MS window right before it, not the whole session. */

const accumulated = new Map<string, RawResourceCandidate>();
let observer: MutationObserver | null = null;

/** Extension reloads/updates (common during dev) invalidate every content
 *  script already injected into open tabs. `chrome.runtime.id` reads as
 *  `undefined` once that happens, but on some Chrome versions merely
 *  *accessing* `chrome.storage`/`chrome.runtime` on an invalidated context
 *  throws synchronously rather than rejecting a promise — so this must be
 *  wrapped in try/catch, not just checked as a boolean. */
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** Once the context is gone it never comes back for this script instance —
 *  the tab needs a reload. Tearing the observer down stops it from retrying
 *  (and re-throwing) on every single mutation, which on a page like
 *  Facebook is effectively every few milliseconds. */
function handleContextInvalidated(): void {
  observer?.disconnect();
  observer = null;
  if (saveHandle) clearTimeout(saveHandle);
}

function storageKeyForCurrentPage(): string {
  // origin + pathname + search (no hash) — distinct per Messenger thread,
  // but stable across a reload of the same thread.
  const u = new URL(location.href);
  return `wds:resources:${u.origin}${u.pathname}${u.search}`;
}

let saveHandle: ReturnType<typeof setTimeout> | undefined;
const SAVE_DEBOUNCE_MS = 1000;

function scheduleSave(): void {
  if (saveHandle) clearTimeout(saveHandle);
  saveHandle = setTimeout(() => {
    if (!isContextValid()) {
      handleContextInvalidated();
      return;
    }
    try {
      const key = storageKeyForCurrentPage();
      const payload = Array.from(accumulated.values()).slice(0, MAX_ITEMS);
      void chrome.storage?.local?.set({ [key]: payload }).catch(() => {
        /* storage unavailable — accumulation still works in-memory for this page load */
      });
    } catch {
      // Property access itself threw (context invalidated between the
      // isContextValid() check and here) — stop retrying.
      handleContextInvalidated();
    }
  }, SAVE_DEBOUNCE_MS);
}

function mergeCandidates(candidates: RawResourceCandidate[], persist = true): void {
  let added = false;
  for (const c of candidates) {
    if (!accumulated.has(c.url)) {
      accumulated.set(c.url, c);
      added = true;
    }
  }
  if (added && persist) scheduleSave();
}

function handleMutations(records: MutationRecord[]): void {
  if (!isContextValid()) {
    handleContextInvalidated();
    return;
  }
  for (const record of records) {
    if (record.type === 'attributes') {
      if (record.target instanceof Element) mergeCandidates(collectResourceCandidates(record.target));
      continue;
    }
    if (record.type === 'childList') {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) mergeCandidates(collectResourceCandidates(node));
      });
    }
  }
}

// Recycled nodes in some virtualized libraries update lazy-load/data-* src
// attributes rather than `src` itself before a later pass copies it over —
// watch those too so no intermediate value is missed.
const IMG_LAZY_AND_VIDEO_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-lazy',
  'data-video-src',
  'data-hls-url',
  'data-m3u8',
  'data-stream-url'
];

/** Idempotent — safe to call on every content-script load. Watches the
 *  whole document for new/changed media, and restores whatever was
 *  accumulated for this same page URL before the last reload. */
export function startResourceObserver(): void {
  if (observer) return;
  mergeCandidates(collectResourceCandidates(document), false);
  observer = new MutationObserver(handleMutations);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'srcset', 'style', 'poster', 'href', ...IMG_LAZY_AND_VIDEO_ATTRS]
  });

  try {
    const key = storageKeyForCurrentPage();
    chrome.storage?.local
      ?.get(key)
      .then((data: Record<string, unknown>) => {
        const stored = data?.[key] as RawResourceCandidate[] | undefined;
        if (stored?.length) mergeCandidates(stored, false);
      })
      .catch(() => {
        /* storage unavailable — this page load still accumulates in-memory */
      });
  } catch {
    // Context was already invalid at startup (rare, but possible if the
    // script was injected right as the extension reloaded).
    handleContextInvalidated();
  }
}

/** Returns everything accumulated so far (including anything restored from
 *  a previous page load), plus one last live scan to catch anything not
 *  covered by attribute/childList mutations. */
export function getAccumulatedResources(): ResourceItem[] {
  mergeCandidates(collectResourceCandidates(document));
  return materializeCandidates(accumulated.values());
}

/** Wipes accumulated history — useful after switching to a different
 *  conversation/thread in the same single-page app, where old media is no
 *  longer relevant. Immediately reseeds from a fresh scan of what's
 *  currently on screen. */
export function clearAccumulatedResources(): ResourceItem[] {
  accumulated.clear();
  try {
    const key = storageKeyForCurrentPage();
    void chrome.storage?.local?.remove(key).catch(() => {
      /* storage unavailable — in-memory clear still applies */
    });
  } catch {
    handleContextInvalidated();
  }
  mergeCandidates(collectResourceCandidates(document));
  return materializeCandidates(accumulated.values());
}
