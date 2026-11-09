import type { ScanResult } from '../core/result.js';
import { renderHtml } from './html/index.js';
import { renderJson } from './json.js';
import { renderMarkdown } from './markdown.js';
import { renderSarif } from './sarif.js';
import type { ReportContext } from './shared.js';
import { renderText } from './text.js';

export const REPORT_FORMATS = ['text', 'json', 'markdown', 'sarif', 'html'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export type { ReportContext } from './shared.js';
export { renderExplanation, renderRuleList } from './explain.js';

export function renderReport(
  format: ReportFormat,
  result: ScanResult,
  context: ReportContext,
): string {
  switch (format) {
    case 'text':
      return renderText(result);
    case 'json':
      return renderJson(result, context);
    case 'markdown':
      return renderMarkdown(result);
    case 'sarif':
      return renderSarif(result, context);
    case 'html':
      return renderHtml(result, context);
  }
}
