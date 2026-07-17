import type { ExtractionResult } from '@dtypes/extraction';

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function toMarkdownTable(result: ExtractionResult): string {
  const headers = result.columns.map((c) => escapePipe(c.name));
  const divider = result.columns.map(() => '---');
  const lines = [`| ${headers.join(' | ')} |`, `| ${divider.join(' | ')} |`];

  for (const row of result.rows) {
    const cells = result.columns.map((col) => escapePipe(String(row[col.name]?.value ?? '')));
    lines.push(`| ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}

export function toHtmlTable(result: ExtractionResult): string {
  const th = result.columns.map((c) => `<th>${escapePipe(c.name)}</th>`).join('');
  const bodyRows = result.rows
    .map((row) => {
      const tds = result.columns.map((col) => `<td>${String(row[col.name]?.value ?? '')}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('\n');
  return `<table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`;
}
