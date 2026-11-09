import type { DirectiveComment } from '../languages/model/types.js';
import type { AcceptedFinding, Finding } from './finding.js';

/**
 * A `siftcode-ignore` comment that was read correctly. `targetLine` is the line a finding must
 * start on, or `undefined` for `siftcode-ignore-file`, which covers the whole file.
 */
export interface Suppression {
  readonly path: string;
  /** Where the comment starts. */
  readonly line: number;
  readonly targetLine: number | undefined;
  readonly ruleIds: readonly string[];
  readonly reason: string;
}

export interface ParsedDirectives {
  readonly suppressions: readonly Suppression[];
  /** Comments that could not be used, each with the reason, for the report's notes. */
  readonly notes: readonly string[];
}

/**
 * A directive starts its comment line, after at most one comment opener. A comment that merely
 * mentions it ("to hide a finding, write siftcode-ignore ...") or quotes an example is left alone.
 */
const DIRECTIVE = /^\s*(?:\/\/+|#+|\/\*+|\*+)?\s*siftcode-ignore(-file)?(?![\w-])(.*)$/;
const EXAMPLE = '"siftcode-ignore SC-MET-001: legacy code, see #42"';

/**
 * Reads the `siftcode-ignore` comments of one file.
 *
 *     // siftcode-ignore SC-MET-001: legacy parser, see #42
 *
 * It accepts the findings of that rule that start on the same line (when the comment follows code)
 * or on the next line of code (when the comment stands alone). `siftcode-ignore-file` covers the
 * whole file. The rule id and a reason are both required: a comment without either does nothing,
 * and the notes say so.
 */
export function parseDirectives(
  path: string,
  comments: readonly DirectiveComment[],
  sourceLines: readonly string[],
  knownRules: ReadonlySet<string>,
): ParsedDirectives {
  const standalone = comments.filter((comment) => isStandalone(comment, sourceLines));
  const covered = new Set(standalone.flatMap((comment) => lineRange(comment)));
  const suppressions: Suppression[] = [];
  const notes: string[] = [];

  for (const comment of comments) {
    const match = firstDirective(comment.text);
    if (!match) {
      continue;
    }
    const parsed = parseBody(match[2] ?? '', knownRules);
    if (typeof parsed === 'string') {
      notes.push(`${path}:${comment.startLine}: ${parsed}`);
      continue;
    }
    const wholeFile = match[1] !== undefined;
    suppressions.push({
      path,
      line: comment.startLine,
      targetLine: wholeFile ? undefined : targetLine(comment, standalone, covered, sourceLines),
      ...parsed,
    });
  }
  return { suppressions, notes };
}

function firstDirective(text: string): RegExpExecArray | undefined {
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = DIRECTIVE.exec(line);
    if (match) {
      return match;
    }
  }
  return undefined;
}

/** The rule ids and reason, or the sentence that says what is wrong with the comment. */
function parseBody(
  body: string,
  knownRules: ReadonlySet<string>,
): { ruleIds: string[]; reason: string } | string {
  const rest = body.replace(/\*\/\s*$/, '').trim();
  const colon = rest.indexOf(':');
  const ids = (colon < 0 ? rest : rest.slice(0, colon)).split(/[\s,]+/).filter((id) => id !== '');
  const reason = colon < 0 ? '' : rest.slice(colon + 1).trim();

  if (ids.length === 0) {
    return 'siftcode-ignore needs a rule id before the reason, for example "siftcode-ignore SC-MET-001: reason".';
  }
  const unknown = ids.filter((id) => !knownRules.has(id));
  if (unknown.length > 0) {
    return `siftcode-ignore names ${unknown.join(', ')}, which is not a SiftCode rule.`;
  }
  if (reason === '') {
    return `siftcode-ignore needs a reason after the rule id, for example ${EXAMPLE}. The finding stays.`;
  }
  return { ruleIds: ids, reason };
}

const lineRange = (comment: DirectiveComment): number[] =>
  Array.from({ length: comment.endLine - comment.startLine + 1 }, (_, i) => comment.startLine + i);

/** True when nothing but whitespace comes before the comment on its first line. */
function isStandalone(comment: DirectiveComment, sourceLines: readonly string[]): boolean {
  const first = comment.text.split(/\r\n|\r|\n/)[0] ?? '';
  return (sourceLines[comment.startLine - 1] ?? '').trimStart().startsWith(first.trimStart());
}

/**
 * Same line for a comment that follows code; otherwise the next line that holds code, skipping
 * blank lines and other `siftcode-ignore` comments so that several can be stacked above one line.
 */
function targetLine(
  comment: DirectiveComment,
  standalone: readonly DirectiveComment[],
  covered: ReadonlySet<number>,
  sourceLines: readonly string[],
): number {
  if (!standalone.includes(comment)) {
    return comment.startLine;
  }
  let line = comment.endLine + 1;
  while (
    line <= sourceLines.length &&
    (covered.has(line) || (sourceLines[line - 1] ?? '').trim() === '')
  ) {
    line += 1;
  }
  return line;
}

export interface SuppressionOutcome {
  readonly active: readonly Finding[];
  readonly accepted: readonly AcceptedFinding[];
  /** Notes for comments that are well formed but matched nothing, so stale ones get cleaned up. */
  readonly notes: readonly string[];
}

/**
 * Moves the findings that a `siftcode-ignore` comment covers from `active` to `accepted`. A comment
 * for a rule that did not run is not reported as unused: the rule may simply be switched off.
 */
export function applySuppressions(
  findings: readonly Finding[],
  suppressions: readonly Suppression[],
  enabledRules: ReadonlySet<string>,
): SuppressionOutcome {
  const used = new Set<string>();
  const active: Finding[] = [];
  const accepted: AcceptedFinding[] = [];

  for (const finding of findings) {
    const match = suppressions.find((s) => covers(s, finding));
    if (match === undefined) {
      active.push(finding);
      continue;
    }
    used.add(usageKey(match, finding.ruleId));
    accepted.push({
      finding,
      via: { kind: 'suppression', reason: match.reason, line: match.line },
    });
  }
  return { active, accepted, notes: unusedNotes(suppressions, used, enabledRules) };
}

const covers = (suppression: Suppression, finding: Finding): boolean =>
  suppression.path === finding.path &&
  suppression.ruleIds.includes(finding.ruleId) &&
  (suppression.targetLine === undefined || suppression.targetLine === finding.startLine);

const usageKey = (suppression: Suppression, ruleId: string): string =>
  `${suppression.path}:${suppression.line}:${ruleId}`;

function unusedNotes(
  suppressions: readonly Suppression[],
  used: ReadonlySet<string>,
  enabledRules: ReadonlySet<string>,
): string[] {
  return suppressions.flatMap((suppression) => {
    const unused = suppression.ruleIds.filter(
      (id) => enabledRules.has(id) && !used.has(usageKey(suppression, id)),
    );
    return unused.length === 0
      ? []
      : [
          `${suppression.path}:${suppression.line}: siftcode-ignore ${unused.join(', ')} matched no finding.`,
        ];
  });
}
