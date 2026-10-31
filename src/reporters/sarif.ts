import type { ScanResult } from '../core/result.js';
import type { Severity } from '../core/severity.js';
import type { RuleMeta } from '../rules/types.js';
import {
  TOOL_NAME,
  TOOL_URL,
  describeProblem,
  formatStandard,
  withRules,
  type ReportContext,
} from './shared.js';

export const SARIF_SCHEMA_URL =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';

/** SARIF has three result levels worth using; our `info` and `note` both read as a SARIF `note`. */
const LEVELS: Readonly<Record<Severity, 'error' | 'warning' | 'note'>> = {
  error: 'error',
  warning: 'warning',
  info: 'note',
  note: 'note',
};

/**
 * SARIF 2.1.0, the interchange format GitHub code scanning and many other tools read. Like the JSON
 * report it holds no absolute paths or timestamps, so output is reproducible.
 */
export function renderSarif(result: ScanResult, context: ReportContext): string {
  const ruleIndex = new Map(result.rules.map((rule, index) => [rule.id, index]));
  const log = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: context.version,
            informationUri: TOOL_URL,
            rules: result.rules.map(describeRule),
          },
        },
        results: withRules(result).map(({ finding }) => ({
          ruleId: finding.ruleId,
          ruleIndex: ruleIndex.get(finding.ruleId),
          level: LEVELS[finding.severity],
          message: { text: finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.path },
                region: { startLine: finding.startLine, endLine: finding.endLine },
              },
            },
          ],
          partialFingerprints: { 'siftcodeFingerprint/v1': finding.fingerprint },
        })),
        invocations: [
          {
            executionSuccessful: true,
            toolExecutionNotifications: result.problems.map((problem) => ({
              level: 'warning',
              message: { text: `${problem.path} ${describeProblem(problem.reason)}.` },
              locations: [{ physicalLocation: { artifactLocation: { uri: problem.path } } }],
            })),
          },
        ],
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}

function describeRule(rule: RuleMeta) {
  const helpUri = rule.standards.find((standard) => standard.url !== undefined)?.url;
  const standards = rule.standards.map(formatStandard);
  const markdown = [
    rule.suggestion.summary,
    ...(standards.length > 0 ? ['', 'Standards:', ...standards.map((s) => `- ${s}`)] : []),
  ].join('\n');
  return {
    id: rule.id,
    name: rule.title,
    shortDescription: { text: rule.title },
    fullDescription: { text: rule.rationale },
    help: { text: `${rule.suggestion.summary} ${standards.join('; ')}`.trim(), markdown },
    ...(helpUri === undefined ? {} : { helpUri }),
    defaultConfiguration: { level: LEVELS[rule.defaultSeverity] },
    properties: {
      tags: [rule.category, ...(rule.heuristic ? ['heuristic'] : [])],
      precision: rule.confidence,
    },
  };
}
