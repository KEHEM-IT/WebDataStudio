import type { ExtractionResult } from '@dtypes/extraction';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeTagName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[^a-zA-Z_]/, '_$&');
  return cleaned.length > 0 ? cleaned : 'field';
}

export function toXml(result: ExtractionResult, rootTag = 'rows', rowTag = 'row'): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<${rootTag}>`];

  for (const row of result.rows) {
    lines.push(`  <${rowTag}>`);
    for (const col of result.columns) {
      const cell = row[col.name];
      const tag = safeTagName(col.name);
      const value = cell?.value ?? '';
      lines.push(`    <${tag}>${escapeXml(String(value))}</${tag}>`);
    }
    lines.push(`  </${rowTag}>`);
  }

  lines.push(`</${rootTag}>`);
  return lines.join('\n');
}
