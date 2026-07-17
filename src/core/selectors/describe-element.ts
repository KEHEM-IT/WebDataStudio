import type { ElementDescriptor } from '@types/element';
import { generateSelector, buildXPath } from './selector-generator';
import { normalizeWhitespace } from '@core/utils/text';

function ownTextOf(el: Element): string {
  let text = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) text += n.textContent ?? '';
  });
  return normalizeWhitespace(text);
}

function ancestorPathOf(el: Element): string[] {
  const path: string[] = [];
  let node: Element | null = el.parentElement;
  let guard = 0;
  while (node && guard < 40) {
    path.unshift(node.tagName.toLowerCase());
    node = node.parentElement;
    guard += 1;
  }
  return path;
}

export function describeElement(el: Element): ElementDescriptor {
  const rect = el.getBoundingClientRect();
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attributes[attr.name] = attr.value;

  const dataset: Record<string, string> = {};
  if (el instanceof HTMLElement) {
    for (const [k, v] of Object.entries(el.dataset)) dataset[k] = v ?? '';
  }

  return {
    cssSelector: generateSelector(el),
    xpath: buildXPath(el),
    tagName: el.tagName.toLowerCase(),
    id: el.id || null,
    classList: Array.from(el.classList),
    attributes,
    dataset,
    ownText: ownTextOf(el),
    innerText: normalizeWhitespace((el as HTMLElement).innerText ?? el.textContent ?? ''),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    depth: ancestorPathOf(el).length,
    childElementCount: el.childElementCount,
    ancestorPath: ancestorPathOf(el)
  };
}

export function resolveDescriptor(descriptor: ElementDescriptor): Element | null {
  try {
    return document.querySelector(descriptor.cssSelector);
  } catch {
    return null;
  }
}
