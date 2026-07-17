import type { DataColumn, ExtractionResult, InferredDataType } from '@dtypes/extraction';

function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_$&');
  return cleaned.length > 0 ? cleaned.toLowerCase() : 'field';
}

function sqlType(type: InferredDataType): string {
  switch (type) {
    case 'number':
    case 'latitude':
    case 'longitude':
      return 'DOUBLE PRECISION';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'DATE';
    case 'datetime':
      return 'TIMESTAMP';
    default:
      return 'TEXT';
  }
}

function sqlLiteral(value: string | number | boolean | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${value.replace(/'/g, "''")}'`;
}

export interface SqlExportOptions {
  tableName?: string;
  includeCreateTable?: boolean;
  batchSize?: number;
}

function buildCreateTable(tableName: string, columns: DataColumn[]): string {
  const cols = columns
    .map((c) => `  ${sanitizeIdentifier(c.name)} ${sqlType(c.inferredType)}`)
    .join(',\n');
  return `CREATE TABLE IF NOT EXISTS ${tableName} (\n${cols}\n);`;
}

/** Generic ANSI-ish SQL INSERT output, portable across MySQL/PostgreSQL/SQLite
 *  for the common case (no dialect-specific quoting/escaping needed here). */
export function toSql(result: ExtractionResult, options: SqlExportOptions = {}): string {
  const tableName = sanitizeIdentifier(options.tableName ?? 'extracted_data');
  const batchSize = options.batchSize ?? 500;
  const columnNames = result.columns.map((c) => sanitizeIdentifier(c.name));
  const parts: string[] = [];

  if (options.includeCreateTable !== false) {
    parts.push(buildCreateTable(tableName, result.columns));
  }

  for (let i = 0; i < result.rows.length; i += batchSize) {
    const batch = result.rows.slice(i, i + batchSize);
    const valueRows = batch.map((row) => {
      const values = result.columns.map((col) => sqlLiteral(row[col.name]?.value ?? null));
      return `  (${values.join(', ')})`;
    });
    if (valueRows.length === 0) continue;
    parts.push(
      `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES\n${valueRows.join(',\n')};`
    );
  }

  return parts.join('\n\n');
}
