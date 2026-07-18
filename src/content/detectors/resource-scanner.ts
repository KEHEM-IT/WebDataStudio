import type { ResourceCategory, ResourceItem } from '@dtypes/resource';
import { generateId } from '@core/utils/id';

const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif', 'heic', 'heif'
]);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv', 'avi', 'flv', 'wmv', '3gp', 'm3u8', 'mpd']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'wma', 'opus', 'weba']);
const DOC_EXTS = new Set([
  'pdf', 'zip', 'rar', '7z', 'tar', 'gz', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'csv', 'json', 'xml', 'txt', 'rtf', 'epub', 'psd', 'ai'
]);

const IMG_LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy'];
const VIDEO_DATA_ATTRS = ['data-video-src', 'data-hls-url', 'data-m3u8', 'data-stream-url'];
export const MAX_ITEMS = 2000;
const MAX_SCRIPT_CHARS = 2_000_000;

function extFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').pop() ?? '';
    const dot = last.lastIndexOf('.');
    if (dot === -1) return '';
    const ext = last.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,6}$/.test(ext) ? ext : '';
  } catch {
    return '';
  }
}

function categorizeByExt(ext: string): ResourceCategory | null {
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (DOC_EXTS.has(ext)) return 'other';
  return null;
}

function filenameFromUrl(url: string, ext: string, category: ResourceCategory, index: number): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    if (last && last.length <= 120) {
      return ext && !last.toLowerCase().endsWith(`.${ext}`) ? `${last}.${ext}` : last;
    }
  } catch {
    /* fall through to synthetic name */
  }
  const base = `${category}_${index}`;
  return ext ? `${base}.${ext}` : base;
}

function firstUrlsFromSrcset(srcset: string): string[] {
  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((u): u is string => Boolean(u));
}

function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed || /^(data|javascript|about):/i.test(trimmed)) return null;
  try {
    return new URL(trimmed, document.baseURI).href;
  } catch {
    return null;
  }
}

/** A resource found in the DOM, not yet deduped/id-assigned. Kept separate
 *  from ResourceItem so a single mutated element can be re-collected many
 *  times cheaply (id/filename assignment only happens once, at read time,
 *  in materializeCandidates). */
export interface RawResourceCandidate {
  url: string;
  category: ResourceCategory;
  sourceTag: string;
  extras?: Partial<ResourceItem>;
}

/** Queries `selector` within `root`, including `root` itself if it's an
 *  Element that matches — needed because MutationObserver hands us the
 *  mutated element directly (e.g. an <img> whose src just changed), not
 *  a container we can blindly querySelectorAll into. */
function queryIncludingSelf<E extends Element>(root: ParentNode, selector: string): E[] {
  const results: E[] = [];
  if (root instanceof Element && root.matches(selector)) results.push(root as unknown as E);
  root.querySelectorAll<E>(selector).forEach((el) => results.push(el));
  return results;
}

/** Crawls `root` (the whole document, or a single element/subtree) for
 *  image/video/audio/other file resources — <img>/srcset, <picture>, CSS
 *  background-image, <video>/<audio>/<source>, lazy-load data-* attributes,
 *  file-extension <a href>s, and m3u8/mpd/mp4 manifest URLs embedded in
 *  inline <script> text. Pure/stateless — no id assignment, no dedup —
 *  so it's cheap enough to call on a single element every time a mutation
 *  touches it. */
export function collectResourceCandidates(root: ParentNode = document): RawResourceCandidate[] {
  const out: RawResourceCandidate[] = [];
  const push = (url: string | null, category: ResourceCategory, sourceTag: string, extras?: Partial<ResourceItem>) => {
    const resolved = resolveUrl(url);
    if (resolved) out.push({ url: resolved, category, sourceTag, extras });
  };

  queryIncludingSelf<HTMLImageElement>(root, 'img').forEach((img) => {
    push(img.currentSrc || img.getAttribute('src'), 'image', 'img', {
      width: img.naturalWidth || undefined,
      height: img.naturalHeight || undefined
    });
    const srcset = img.getAttribute('srcset');
    if (srcset) firstUrlsFromSrcset(srcset).forEach((u) => push(u, 'image', 'img srcset'));
    for (const attr of IMG_LAZY_ATTRS) {
      const v = img.getAttribute(attr);
      if (v) push(v, 'image', `img[${attr}]`);
    }
  });

  queryIncludingSelf<HTMLSourceElement>(root, 'picture source[srcset]').forEach((src) => {
    firstUrlsFromSrcset(src.getAttribute('srcset') ?? '').forEach((u) => push(u, 'image', 'picture source'));
  });

  queryIncludingSelf<HTMLElement>(root, '[style*="url("]').forEach((el) => {
    const match = (el.getAttribute('style') ?? '').match(/url\((['"]?)([^'")]+)\1\)/i);
    if (match?.[2]) push(match[2], 'image', 'css background');
  });

  queryIncludingSelf<HTMLVideoElement>(root, 'video').forEach((v) => {
    push(v.currentSrc || v.getAttribute('src'), 'video', 'video');
    const poster = v.getAttribute('poster');
    if (poster) push(poster, 'image', 'video poster');
  });
  queryIncludingSelf<HTMLAudioElement>(root, 'audio').forEach((a) => {
    push(a.currentSrc || a.getAttribute('src'), 'audio', 'audio');
  });
  queryIncludingSelf<HTMLSourceElement | HTMLTrackElement>(root, 'video source, audio source, track').forEach((s) => {
    const src = s.getAttribute('src');
    if (!src) return;
    const type = (s.getAttribute('type') ?? '').toLowerCase();
    const parentTag = s.parentElement?.tagName.toLowerCase();
    const category: ResourceCategory = parentTag === 'audio' || type.includes('audio') ? 'audio' : 'video';
    push(src, category, `${parentTag ?? 'media'} > source`);
  });

  queryIncludingSelf<HTMLAnchorElement>(root, 'a[href]').forEach((a) => {
    const resolved = resolveUrl(a.getAttribute('href'));
    if (!resolved) return;
    const category = categorizeByExt(extFromUrl(resolved));
    if (category) push(resolved, category, 'a href');
  });

  for (const attr of VIDEO_DATA_ATTRS) {
    queryIncludingSelf<HTMLElement>(root, `[${attr}]`).forEach((el) => {
      push(el.getAttribute(attr), 'video', `[${attr}]`);
    });
  }

  // HLS/DASH manifest URLs are usually only ever assigned to a JS player
  // instance, never written to a DOM attribute — so scan inline script text.
  const manifestPattern = /https?:\/\/[^\s"'<>\\]+?\.(m3u8|mpd)(\?[^\s"'<>\\]*)?/gi;
  queryIncludingSelf<HTMLScriptElement>(root, 'script:not([src])').forEach((script) => {
    const text = (script.textContent ?? '').slice(0, MAX_SCRIPT_CHARS);
    if (!text) return;
    manifestPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = manifestPattern.exec(text))) {
      push(match[0], 'video', 'script');
    }
  });

  return out;
}

/** Dedupes by URL (first-seen wins) and assigns ids/filenames. Cheap to
 *  call repeatedly on an accumulated candidate list — ids are only ever
 *  handed out at read time. */
export function materializeCandidates(candidates: Iterable<RawResourceCandidate>, limit = MAX_ITEMS): ResourceItem[] {
  const found = new Map<string, ResourceItem>();
  let counter = 0;
  for (const c of candidates) {
    if (found.size >= limit || found.has(c.url)) continue;
    const ext = extFromUrl(c.url);
    found.set(c.url, {
      id: generateId('res'),
      url: c.url,
      filename: filenameFromUrl(c.url, ext, c.category, ++counter),
      ext,
      category: c.category,
      sourceTag: c.sourceTag,
      ...c.extras
    });
  }
  return Array.from(found.values());
}

/** One-shot full-page scan — used for the initial seed and as a fallback.
 *  For live/incremental capture (recommended for messenger-style virtualized
 *  UIs) use collectResourceCandidates + materializeCandidates via the
 *  resource-observer module instead, which reacts per-mutation rather than
 *  re-querying the whole document. */
export function scanPageResources(limit = MAX_ITEMS): ResourceItem[] {
  return materializeCandidates(collectResourceCandidates(document), limit);
}
