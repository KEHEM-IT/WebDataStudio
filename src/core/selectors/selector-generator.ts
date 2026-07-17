import type { SelectorCandidate } from '@types/element';

/** Attributes that make a strong, re-render-stable selector when present. */
const STABLE_DATA_ATTRS = ['data-testid', 'data-test', 'data-qa', 'data-id', 'data-key', 'id'];

function isUniqueInDocument(selector: string): boolean {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function attrSelector(el: Element, attr: string): string | null {
  const val = el.getAttribute(attr);
  if (!val) return null;
  const esc = CSS.escape(val);
  return attr === 'id' ? `#${esc}` : `[${attr}="${esc}"]`;
}

/** Build a short, stable CSS class combo from an element's classList,
 *  filtering out obviously dynamic/utility hashes (e.g. Tailwind/CSS-modules). */
function stableClassSelector(el: Element): string | null {
  const classes = Array.from(el.classList).filter(
    (c) => c.length < 40 && !/^(css-|jsx-|_[a-z0-9]{5,}|sc-)/i.test(c)
  );
  if (classes.length === 0) return null;
  return `${el.tagName.toLowerCase()}.${classes.slice(0, 3).map((c) => CSS.escape(c)).join('.')}`;
}

function nthChildSelector(el: Element): string {
  const parent = el.parentElement;
  const tag = el.tagName.toLowerCase();
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
  const index = siblings.indexOf(el) + 1;
  return siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
}

/** Walk up from `el` to build a full path selector, stopping early once unique. */
function buildPathSelector(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let guard = 0;
  while (node && node.nodeType === 1 && guard < 12) {
    guard += 1;
    const dataSel = STABLE_DATA_ATTRS.map((a) => attrSelector(node as Element, a)).find(Boolean);
    if (dataSel) {
      parts.unshift(dataSel);
      const full = parts.join(' > ');
      if (isUniqueInDocument(full)) return full;
      if (dataSel.startsWith('#')) break;
    } else {
      parts.unshift(nthChildSelector(node));
    }
    const full = parts.join(' > ');
    if (isUniqueInDocument(full)) return full;
    node = node.parentElement;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

export function buildXPath(el: Element): string {
  if (el.id) return `//*[@id="${el.id}"]`;
  const segments: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let index = 1;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    segments.unshift(`${node.tagName.toLowerCase()}[${index}]`);
    node = node.parentElement;
  }
  return `/html/${segments.join('/')}`;
}

/** Public API: generate the best CSS selector for a single element. */
export function generateSelector(el: Element): string {
  for (const attr of STABLE_DATA_ATTRS) {
    const sel = attrSelector(el, attr);
    if (sel && isUniqueInDocument(sel)) return sel;
  }
  const classSel = stableClassSelector(el);
  if (classSel && isUniqueInDocument(classSel)) return classSel;
  return buildPathSelector(el);
}
