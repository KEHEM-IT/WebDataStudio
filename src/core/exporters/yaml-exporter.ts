import type { ExtractionResult } from '@dtypes/extraction';

/** Minimal YAML scalar quoting — quotes only when needed so plain values
 *  (most cells) stay readable, mirroring how hand-written YAML looks. */
function yamlScalar(value: string | number | boolean | null): string {
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const needsQuote = /^[\s]|[\s]$|^[-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|^$|^(true|false|null|yes|no)$/i.test(value);
  if (!needsQuote) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function safeKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_ ]*$/.test(name) ? name : yamlScalar(name);
}

export function toYaml(result: ExtractionResult): string {
  if (result.rows.length === 0) return '[]\n';

  const lines: string[] = [];
  for (const row of result.rows) {
    result.columns.forEach((col, i) => {
      const value = row[col.name]?.value ?? null;
      const prefix = i === 0 ? '- ' : '  ';
      lines.push(`${prefix}${safeKey(col.name)}: ${yamlScalar(value)}`);
    });
  }
  return lines.join('\n') + '\n';
}
