/** A single file-like resource discovered on the page — image, video,
 *  audio, or other downloadable file (pdf, zip, docs, etc). */
export type ResourceCategory = 'image' | 'video' | 'audio' | 'other';

export interface ResourceItem {
  id: string;
  /** Absolute, resolved URL — always safe to fetch() or hand to chrome.downloads. */
  url: string;
  /** Best-effort filename (with extension) derived from the URL. */
  filename: string;
  /** Lowercase extension without the dot, '' if it couldn't be determined. */
  ext: string;
  category: ResourceCategory;
  /** Where on the page this was found, e.g. "img", "video source", "css background". */
  sourceTag: string;
  width?: number;
  height?: number;
}

export interface ResourceScanResult {
  id: string;
  createdAt: number;
  sourceUrl: string;
  sourceTitle: string;
  items: ResourceItem[];
}
