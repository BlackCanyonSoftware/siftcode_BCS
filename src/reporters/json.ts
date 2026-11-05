import type { ScanResult } from '../core/result.js';
import type { CodeFile } from '../languages/model/types.js';
import { TOOL_NAME, countBySeverity, withRules, type ReportContext } from './shared.js';

/** Current version of the JSON report layout. Bump it when a field is removed or changes meaning. */
export const JSON_SCHEMA_VERSION = 1;

/**
 * Machine-readable report. Contains no absolute paths, timestamps, or other machine-specific
 * data, so the same input always yields byte-identical output.
 */
export function renderJson(result: ScanResult, context: ReportContext): string {
  const report = {
    schemaVersion: JSON_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: context.version },
    summary: {
      filesScanned: result.filesScanned,
      languages: Object.fromEntries(result.byLanguage),
      findings: countBySeverity(result.findings),
      skipped: result.skipped,
    },
    rules: result.rules,
    findings: withRules(result).map(({ finding, rule }) => ({
      ...finding,
      rationale: rule.rationale,
      standards: rule.standards,
      suggestion: rule.suggestion,
    })),
    problems: result.problems,
    metrics: { files: result.files.map(describeFile) },
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** The measurements of one file and of each function and method in it. */
function describeFile(file: CodeFile) {
  return {
    path: file.path,
    language: file.language,
    lines: file.lineCount,
    ...file.metrics,
    classes: file.classes,
    units: file.units.map((unit) => ({
      kind: unit.kind,
      name: unit.name,
      startLine: unit.startLine,
      endLine: unit.endLine,
      ...unit.metrics,
    })),
  };
}
