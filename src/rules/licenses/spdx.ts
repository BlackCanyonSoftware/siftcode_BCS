import type { Catalog } from './catalog.js';

/**
 * A parsed SPDX license expression (SPDX specification, Annex D): ids joined by `AND` and `OR`,
 * `WITH` an exception, `+` for "or any later version", and parentheses.
 */
export type Expression =
  | {
      readonly kind: 'license';
      /** Canonical SPDX id (deprecated names are mapped to their current ones). */
      readonly id: string;
      /** The id is a `LicenseRef-…` the expression defines itself, or is not on the SPDX list. */
      readonly known: boolean;
      readonly exception?: string;
    }
  | { readonly kind: 'and' | 'or'; readonly left: Expression; readonly right: Expression };

export type ParseResult =
  | { readonly ok: true; readonly expression: Expression }
  | { readonly ok: false; readonly reason: string };

/** Deprecated SPDX ids and the current ids they mean. */
const CURRENT_ID = new Map([
  ['gpl-1.0', 'GPL-1.0-only'],
  ['gpl-2.0', 'GPL-2.0-only'],
  ['gpl-3.0', 'GPL-3.0-only'],
  ['lgpl-2.0', 'LGPL-2.0-only'],
  ['lgpl-2.1', 'LGPL-2.1-only'],
  ['lgpl-3.0', 'LGPL-3.0-only'],
  ['agpl-1.0', 'AGPL-1.0-only'],
  ['agpl-3.0', 'AGPL-3.0-only'],
]);

function canonicalId(raw: string, catalog: Catalog): { id: string; known: boolean } {
  const plus = raw.endsWith('+');
  const base = plus ? raw.slice(0, -1) : raw;
  const entry = catalog.entries.get(base.toLowerCase());
  if (!entry) {
    return { id: base, known: false };
  }
  const current = CURRENT_ID.get(entry.id.toLowerCase()) ?? entry.id;
  // `GPL-2.0+` and `GPL-2.0-or-later` mean the same.
  const id = plus && current.endsWith('-only') ? current.replace(/-only$/, '-or-later') : current;
  return { id: catalog.entries.get(id.toLowerCase())?.id ?? id, known: true };
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: readonly string[],
    private readonly catalog: Catalog,
  ) {}

  parse(): Expression {
    const expression = this.or();
    const rest = this.tokens[this.position];
    if (rest !== undefined) {
      throw new SyntaxError(`unexpected "${rest}"`);
    }
    return expression;
  }

  private or(): Expression {
    let left = this.and();
    while (this.tokens[this.position] === 'OR') {
      this.position += 1;
      left = { kind: 'or', left, right: this.and() };
    }
    return left;
  }

  private and(): Expression {
    let left = this.simple();
    while (this.tokens[this.position] === 'AND') {
      this.position += 1;
      left = { kind: 'and', left, right: this.simple() };
    }
    return left;
  }

  private simple(): Expression {
    const token = this.tokens[this.position];
    this.position += 1;
    if (token === undefined) {
      throw new SyntaxError('the expression ends early');
    }
    if (token === '(') {
      const inner = this.or();
      if (this.tokens[this.position] !== ')') {
        throw new SyntaxError('a parenthesis is not closed');
      }
      this.position += 1;
      return inner;
    }
    if (token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') {
      throw new SyntaxError(`unexpected "${token}"`);
    }
    return this.license(token);
  }

  private license(token: string): Expression {
    const { id, known } =
      token.startsWith('LicenseRef-') || token.startsWith('DocumentRef-')
        ? { id: token, known: false }
        : canonicalId(token, this.catalog);
    if (this.tokens[this.position] !== 'WITH') {
      return { kind: 'license', id, known };
    }
    this.position += 1;
    const exception = this.tokens[this.position];
    if (exception === undefined || /^(?:\(|\)|AND|OR|WITH)$/.test(exception)) {
      throw new SyntaxError('WITH needs an exception id');
    }
    this.position += 1;
    return { kind: 'license', id, known, exception };
  }
}

/**
 * Parses an SPDX license expression. A string that is not valid SPDX syntax (`MIT License`,
 * `Apache 2.0`, `MIT or Apache-2.0`) is reported as not ok instead of being guessed at; an id that
 * is syntactically fine but not on the SPDX list parses with `known: false`.
 */
export function parseExpression(text: string, catalog: Catalog): ParseResult {
  const tokens = text.match(/\(|\)|[^\s()]+/g) ?? [];
  if (tokens.length === 0) {
    return { ok: false, reason: 'it is empty' };
  }
  try {
    return { ok: true, expression: new Parser(tokens, catalog).parse() };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

/** Every license in an expression, left to right. */
export function licensesIn(
  expression: Expression,
): readonly Extract<Expression, { kind: 'license' }>[] {
  return expression.kind === 'license'
    ? [expression]
    : [...licensesIn(expression.left), ...licensesIn(expression.right)];
}

/** The expression as text, with parentheses only where precedence needs them. */
export function formatExpression(expression: Expression): string {
  if (expression.kind === 'license') {
    return expression.exception === undefined
      ? expression.id
      : `${expression.id} WITH ${expression.exception}`;
  }
  const wrap = (inner: Expression): string =>
    inner.kind === 'or' && expression.kind === 'and'
      ? `(${formatExpression(inner)})`
      : formatExpression(inner);
  return `${wrap(expression.left)} ${expression.kind.toUpperCase()} ${wrap(expression.right)}`;
}
