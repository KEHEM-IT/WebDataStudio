/** Collapse whitespace/newlines the way a human reading the rendered page would. */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** Decode common HTML entities that can leak into textContent from malformed markup. */
export function decodeHtmlEntities(input: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = input;
  return el.value;
}

export function stripHtml(input: string): string {
  const el = document.createElement('div');
  el.innerHTML = input;
  return normalizeWhitespace(el.textContent ?? '');
}

export function toTitleCase(input: string): string {
  return input.replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}

export function toSentenceCase(input: string): string {
  const t = input.trim();
  if (!t) return t;
  return t[0]!.toUpperCase() + t.slice(1).toLowerCase();
}
