import JSZip from 'jszip';
import type { ResourceItem } from '@dtypes/resource';

export interface ZipProgress {
  done: number;
  total: number;
  failed: string[];
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : 'file';
}

/** Keeps zip entry names unique, preserving the extension when a
 *  collision forces a "_2", "_3", ... suffix onto the base name. */
function uniqueName(taken: Set<string>, name: string): string {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  let candidate = `${base}_${i}${ext}`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}_${i}${ext}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Fetches every resource (bounded concurrency) and packs the successful
 *  ones into a single zip Blob. This only works reliably from an extension
 *  page (popup/side panel) — with host_permissions granted, Chrome exempts
 *  those contexts from the cross-origin CORS restrictions a content script
 *  or the target page's own JS would otherwise hit. */
export async function buildResourceZip(
  items: ResourceItem[],
  onProgress?: (p: ZipProgress) => void
): Promise<{ blob: Blob; failed: string[] }> {
  const zip = new JSZip();
  const taken = new Set<string>();
  const failed: string[] = [];
  const total = items.length;
  let done = 0;
  let index = 0;
  const concurrency = Math.min(6, Math.max(1, items.length));

  async function worker(): Promise<void> {
    for (;;) {
      const i = index++;
      const item = items[i];
      if (!item) return;
      try {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error(String(res.status));
        const buf = await res.arrayBuffer();
        zip.file(uniqueName(taken, sanitizeFilename(item.filename)), buf);
      } catch {
        failed.push(item.url);
      }
      done += 1;
      onProgress?.({ done, total, failed });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  return { blob, failed };
}

/** Triggers a browser download for an in-memory Blob via a throwaway
 *  object URL — the same mechanism the Export tab already uses. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
