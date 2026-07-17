import type { ExtractionResult } from '@dtypes/extraction';
import { toJson, toJsonLines } from './json-exporter';
import { toCsv, toTsv } from './csv-exporter';
import { toMarkdownTable, toHtmlTable } from './markdown-exporter';
import { toXml } from './xml-exporter';
import { toYaml } from './yaml-exporter';
import { toSql } from './sql-exporter';

export * from './json-exporter';
export * from './csv-exporter';
export * from './markdown-exporter';
export * from './xml-exporter';
export * from './yaml-exporter';
export * from './sql-exporter';

export type ExportFormat = 'json' | 'jsonl' | 'csv' | 'tsv' | 'markdown' | 'html' | 'xml' | 'yaml' | 'sql';

export interface ExportOutput {
  content: string;
  mimeType: string;
  fileExtension: string;
}

/** Single entry point the UI layers call — keeps popup/sidepanel decoupled
 *  from which exporter module implements which format. */
export function exportAs(result: ExtractionResult, format: ExportFormat): ExportOutput {
  switch (format) {
    case 'json':
      return { content: toJson(result), mimeType: 'application/json', fileExtension: 'json' };
    case 'jsonl':
      return { content: toJsonLines(result), mimeType: 'application/x-ndjson', fileExtension: 'jsonl' };
    case 'csv':
      return { content: toCsv(result), mimeType: 'text/csv', fileExtension: 'csv' };
    case 'tsv':
      return { content: toTsv(result), mimeType: 'text/tab-separated-values', fileExtension: 'tsv' };
    case 'markdown':
      return { content: toMarkdownTable(result), mimeType: 'text/markdown', fileExtension: 'md' };
    case 'html':
      return { content: toHtmlTable(result), mimeType: 'text/html', fileExtension: 'html' };
    case 'xml':
      return { content: toXml(result), mimeType: 'application/xml', fileExtension: 'xml' };
    case 'yaml':
      return { content: toYaml(result), mimeType: 'application/x-yaml', fileExtension: 'yaml' };
    case 'sql':
      return { content: toSql(result), mimeType: 'application/sql', fileExtension: 'sql' };
  }
}
