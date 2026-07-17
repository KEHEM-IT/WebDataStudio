import type { DataColumn, DataRow, ExtractionResult } from '@dtypes/extraction';
import { generateId } from '@core/utils/id';
import { normalizeWhitespace } from '@core/utils/text';
import { computeStats } from '@core/utils/stats';
import { toCellValue } from './type-inference';

const RICH_TAGS = new Set(['a', 'img', 'button', 'input', 'select', 'textarea', 'svg', 'video', 'audio']);
const SKIP_TAGS = new Set(['script', 'style', 'noscript']);

interface FieldSlot {
  relativeSelector: string;
  sampleEl: Element;
}

function nthOfTypeSegment(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  if (sameTag.length <= 1) return tag;
  const index = sameTag.indexOf(el) + 1;
  return `${tag}:nth-of-type(${index})`;
}

/** Path from `root` down to `el`, expressed as a relative CSS selector,
 *  so the same slot can be re-located inside every sibling item. */
function relativeSelector(root: Element, el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    parts.unshift(nthOfTypeSegment(node));
    node = node.parentElement;
  }
  return parts.join(' > ');
}

/** Walk an item's subtree collecting "leaf" fields: rich media/interactive
 *  elements, or plain elements whose own children carry no further leaves. */
function collectLeaves(item: Element): Element[] {
  const leaves: Element[] = [];

  function walk(node: Element): void {
    const tag = node.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    if (RICH_TAGS.has(tag)) {
      leaves.push(node);
      if (tag !== 'a') return; // links may still contain nested images worth their own field
    }

    const children = Array.from(node.children).filter((c) => !SKIP_TAGS.has(c.tagName.toLowerCase()));
    if (children.length === 0) {
      const text = normalizeWhitespace((node as HTMLElement).innerText ?? node.textContent ?? '');
      if (text.length > 0 && !leaves.includes(node)) leaves.push(node);
      return;
    }
    for (const child of children) walk(child);
  }

  walk(item);
  return leaves;
}

function baseFieldName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return normalizeWhitespace(aria);
  const cls = Array.from(el.classList).find(
    (c) => c.length < 30 && !/^(css-|jsx-|_[a-z0-9]{5,}|sc-|w-|h-|p-|m-|flex|grid|text-|bg-)/i.test(c)
  );
  if (cls) return normalizeWhitespace(cls.replace(/[-_]+/g, ' '));
  return el.tagName.toLowerCase();
}

function dedupeName(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}_${count + 1}`;
}

function fieldRawValue(el: Element): { raw: string; href?: string; src?: string; alt?: string } {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') {
    const img = el as HTMLImageElement;
    return { raw: img.alt || img.src || '', src: img.src || undefined, alt: img.alt || undefined };
  }
  if (tag === 'a') {
    const a = el as HTMLAnchorElement;
    const text = normalizeWhitespace(a.innerText ?? a.textContent ?? '');
    const img = a.querySelector('img[src]') as HTMLImageElement | null;
    return { raw: text || a.href || '', href: a.href || undefined, src: img?.src, alt: img?.alt || undefined };
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const field = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    return { raw: field.value ?? '' };
  }
  return { raw: normalizeWhitespace((el as HTMLElement).innerText ?? el.textContent ?? '') };
}

/** Choose the item (among the first few) with the richest field set to use
 *  as the structural template every other item's fields are matched against. */
function pickTemplateItem(items: Element[]): { item: Element; leaves: Element[] } {
  let best = { item: items[0]!, leaves: collectLeaves(items[0]!) };
  for (const item of items.slice(1, 5)) {
    const leaves = collectLeaves(item);
    if (leaves.length > best.leaves.length) best = { item, leaves };
  }
  return best;
}

/** Extracts repeated non-tabular structures (cards, list items, custom
 *  containers) into named fields per item, producing the same
 *  ExtractionResult shape the table extractor emits. */
export function extractRepeated(
  root: Element,
  kind: 'list' | 'card' | 'custom' = 'card',
  itemSelector?: string
): ExtractionResult {
  const start = performance.now();

  const items = itemSelector
    ? Array.from(root.querySelectorAll(itemSelector))
    : Array.from(root.children).filter((c) => !SKIP_TAGS.has(c.tagName.toLowerCase()));

  if (items.length === 0) {
    return {
      id: generateId('extraction'),
      createdAt: Date.now(),
      sourceUrl: location.href,
      sourceTitle: document.title,
      extractorKind: kind,
      rootSelector: '',
      columns: [],
      rows: [],
      stats: computeStats([], [], performance.now() - start)
    };
  }

  const { item: template, leaves } = pickTemplateItem(items);
  const used = new Map<string, number>();

  const slots: Array<FieldSlot & { name: string }> = leaves.map((leafEl) => ({
    relativeSelector: relativeSelector(template, leafEl),
    sampleEl: leafEl,
    name: dedupeName(baseFieldName(leafEl), used)
  }));

  const columns: DataColumn[] = slots.map((slot) => ({
    id: generateId('col'),
    name: slot.name,
    originalHeader: null,
    inferredType: 'string',
    synthetic: true
  }));

  const rows: DataRow[] = items.map((itemEl) => {
    const row: DataRow = {};
    for (const slot of slots) {
      let fieldEl: Element | null = itemEl;
      if (slot.relativeSelector) {
        try {
          fieldEl = itemEl.querySelector(slot.relativeSelector);
        } catch {
          fieldEl = null;
        }
      }
      const { raw, href, src, alt } = fieldEl ? fieldRawValue(fieldEl) : { raw: '' };
      row[slot.name] = toCellValue(raw, { href, src, alt });
    }
    return row;
  });

  for (const col of columns) {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const cell = row[col.name];
      if (!cell || cell.type === 'null') continue;
      counts.set(cell.type, (counts.get(cell.type) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [type, count] of counts) {
      if (count > bestCount) { best = type; bestCount = count; }
    }
    if (best) col.inferredType = best as DataColumn['inferredType'];
  }

  const stats = computeStats(columns, rows, performance.now() - start);

  return {
    id: generateId('extraction'),
    createdAt: Date.now(),
    sourceUrl: location.href,
    sourceTitle: document.title,
    extractorKind: kind,
    rootSelector: '',
    columns,
    rows,
    stats
  };
}
