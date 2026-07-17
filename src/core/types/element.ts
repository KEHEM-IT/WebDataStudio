/** A serializable, cross-context description of a DOM element. Never pass
 *  live Element/Node references across the content<->background boundary —
 *  always resolve to this descriptor first. */
export interface ElementDescriptor {
  /** Stable CSS selector generated for this element (best-effort unique). */
  cssSelector: string;
  /** Absolute XPath as a fallback/alternate locator. */
  xpath: string;
  tagName: string;
  id: string | null;
  classList: string[];
  attributes: Record<string, string>;
  dataset: Record<string, string>;
  /** Direct text content, trimmed, excluding descendant element text. */
  ownText: string;
  /** Full innerText of the element (rendered, whitespace-collapsed). */
  innerText: string;
  /** Bounding box at time of capture, viewport-relative. */
  rect: { x: number; y: number; width: number; height: number };
  depth: number;
  childElementCount: number;
  /** Path of ancestor tag names from html -> parent, for breadcrumb UI. */
  ancestorPath: string[];
}

export interface SelectorCandidate {
  selector: string;
  /** Estimated number of elements this selector currently matches. */
  matchCount: number;
  /** 0-1 confidence that this selector is stable across re-renders. */
  stability: number;
  kind: 'id' | 'data-attribute' | 'class-combo' | 'nth-child' | 'xpath';
}
