import type { CellValue, InferredDataType } from '@types/extraction';

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_URL = /^(https?:\/\/|www\.)[^\s]+$/i;
const RE_PHONE = /^[+()\d][\d\s().-]{6,}\d$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_CURRENCY = /^[$€£¥₹]\s?-?[\d,]+(\.\d+)?$|^-?[\d,]+(\.\d+)?\s?[$€£¥₹]$/;
const RE_PERCENT = /^-?\d+(\.\d+)?\s?%$/;
const RE_NUMBER = /^-?[\d,]+(\.\d+)?$/;
const RE_ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const RE_SLASH_DATE = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/;
const RE_TIME = /^\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM|am|pm)?$/;
const RE_LATLNG = /^-?\d{1,3}\.\d+$/;
const RE_BOOL = /^(true|false|yes|no)$/i;

/** Best-effort classification of a raw extracted string into a semantic type.
 *  Order matters: more specific patterns are tested before generic ones. */
export function inferType(raw: string): InferredDataType {
  const t = raw.trim();
  if (!t) return 'null';
  if (RE_BOOL.test(t)) return 'boolean';
  if (RE_UUID.test(t)) return 'uuid';
  if (RE_EMAIL.test(t)) return 'email';
  if (RE_URL.test(t)) return 'url';
  if (RE_CURRENCY.test(t)) return 'currency';
  if (RE_PERCENT.test(t)) return 'percentage';
  if (RE_ISO_DATE.test(t)) return t.includes('T') ? 'datetime' : 'date';
  if (RE_SLASH_DATE.test(t)) return 'date';
  if (RE_TIME.test(t)) return 'time';
  if (RE_PHONE.test(t) && /\d{7,}/.test(t.replace(/\D/g, ''))) return 'phone';
  if (RE_NUMBER.test(t)) return 'number';
  if (RE_LATLNG.test(t)) return 'number';
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      const parsed = JSON.parse(t);
      return Array.isArray(parsed) ? 'array' : 'object';
    } catch {
      /* fall through to string */
    }
  }
  return 'string';
}

/** Parse a raw string into its typed value given an already-inferred type. */
export function parseValue(raw: string, type: InferredDataType): string | number | boolean | null {
  const t = raw.trim();
  switch (type) {
    case 'number':
    case 'latitude':
    case 'longitude':
      return Number(t.replace(/,/g, '')) || 0;
    case 'currency':
    case 'percentage':
      return Number(t.replace(/[^0-9.-]/g, '')) || 0;
    case 'boolean':
      return /^(true|yes)$/i.test(t);
    case 'null':
      return null;
    default:
      return t;
  }
}

/** Build a fully-formed CellValue from a raw string plus optional rich attrs. */
export function toCellValue(raw: string, extra?: Partial<Pick<CellValue, 'href' | 'src' | 'alt'>>): CellValue {
  const type = inferType(raw);
  return {
    raw,
    value: parseValue(raw, type),
    type,
    ...(extra?.href ? { href: extra.href } : {}),
    ...(extra?.src ? { src: extra.src } : {}),
    ...(extra?.alt ? { alt: extra.alt } : {})
  };
}
