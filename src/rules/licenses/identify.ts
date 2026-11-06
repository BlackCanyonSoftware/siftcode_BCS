import type { Catalog } from './catalog.js';

/** At least this similar (Dice coefficient of word pairs) is the SPDX text, word for word. */
export const VERBATIM_SIMILARITY = 0.97;
/**
 * At least this similar is that license. The gap to verbatim is ordinary wording: "the author" for
 * "ISC", a line added before the notice. Text similarity cannot tell that from a small real change
 * to the terms, so this tier is a known limit (ADR 0009).
 */
export const MATCH_SIMILARITY = 0.9;
/** Closer than this, but not a match, is a modified version of the license. */
export const MODIFIED_SIMILARITY = 0.8;
/** A reference text this fully inside the file (share of its word pairs) counts as included. */
const CONTAINED_SHARE = 0.95;
/** A license that is this much inside another one is a part of it (MIT-0 in MIT), not a second license. */
const PART_SHARE = 0.9;
/**
 * Text added to or taken from a license in one stretch this long (in words) is a change to its
 * terms, however high the overall similarity: a clause is about this long.
 */
const MAX_CHANGE_RUN = 14;
/** Texts shorter than this many words are too small to tell licenses apart. */
const MIN_WORDS = 20;

export type Identification =
  /** The text is the license. `ids` lists licenses with identical text (GPL-3.0-only and GPL-3.0-or-later). */
  | {
      readonly kind: 'match';
      readonly ids: readonly string[];
      readonly score: number;
      /** Word for word the SPDX text (apart from the copyright line and spacing). */
      readonly verbatim: boolean;
    }
  | { readonly kind: 'modified'; readonly ids: readonly string[]; readonly score: number }
  /** The file holds the full text of several licenses. */
  | { readonly kind: 'multiple'; readonly ids: readonly string[] }
  | { readonly kind: 'unrecognized' };

/** A line that starts like a copyright notice (`Copyright (c) 2024 Name`, `© Name`). */
const NOTICE_START =
  /^\s*(?:copyright\s*(?:\(c\)|©|\W*\d|\[|<)|\(c\)|©|copyright\s+(?!(?:notice|owner|owners|holder|holders|law|laws|license|licenses|interest|statement|and|or|in|of|to|is|by)\b)\S)/i;
/** Notices are short; a long line that merely starts with "copyright" is license text. */
const MAX_NOTICE_WORDS = 14;

/** Where the license proper ends and optional boilerplate for adopters begins. */
const OPTIONAL_TAILS = [
  ['end', 'of', 'terms', 'and', 'conditions'],
  ['exhibit', 'a', 'source', 'code', 'form', 'license', 'notice'],
];

const splitWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/https?:\/\//g, 'http ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word !== '');

/** True for the lines that differ in every project: copyright notices and "All rights reserved". */
function isNoticeLine(line: string): boolean {
  const count = splitWords(line.replace(/\bhttps?:\/\/\S+/gi, ' ')).length;
  return (
    (NOTICE_START.test(line) && count <= MAX_NOTICE_WORDS) ||
    /^\s*all rights reserved\W*$/i.test(line)
  );
}

/** Cuts the words after the first optional tail, such as the "how to apply" appendix of the GPL. */
function withoutOptionalTail(list: string[]): string[] {
  for (let i = 0; i < list.length; i += 1) {
    const tail = OPTIONAL_TAILS.find((marker) => marker.every((word, k) => list[i + k] === word));
    if (tail) {
      return list.slice(0, i + tail.length);
    }
  }
  return list;
}

/**
 * The words of a text, lower case, in the way the SPDX matching guidelines treat them: case,
 * spacing, punctuation, bullets, `http`/`https`, the copyright notice, a leading title, and the
 * optional appendix at the end do not make a different license.
 */
export function words(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => !isNoticeLine(line));
  const first = lines.findIndex((line) => line.trim() !== '');
  // A first line of up to four words with no sentence in it is a title ("MIT License").
  if (
    first >= 0 &&
    splitWords(lines[first] ?? '').length <= 4 &&
    !/[.:;,]/.test(lines[first] ?? '')
  ) {
    lines.splice(first, 1);
  }
  return withoutOptionalTail(splitWords(lines.join('\n')));
}

type Pairs = ReadonlyMap<string, number>;

interface Bag {
  readonly list: readonly string[];
  readonly pairs: Pairs;
  readonly total: number;
}

const pairKey = (list: readonly string[], i: number): string =>
  `${list[i] ?? ''} ${list[i + 1] ?? ''}`;

function bagOf(list: readonly string[]): Bag {
  const pairs = new Map<string, number>();
  for (let i = 0; i + 1 < list.length; i += 1) {
    const key = pairKey(list, i);
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  return { list, pairs, total: Math.max(0, list.length - 1) };
}

function sharedPairs(a: Pairs, b: Pairs): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const [key, count] of small) {
    shared += Math.min(count, large.get(key) ?? 0);
  }
  return shared;
}

/** The longest stretch of `list` whose word pairs are all missing from `other`: text added or removed. */
function longestNovelRun(list: readonly string[], other: Pairs): number {
  let longest = 0;
  let run = 0;
  for (let i = 0; i + 1 < list.length; i += 1) {
    run = other.has(pairKey(list, i)) ? 0 : run + 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

interface Reference extends Bag {
  /** Licenses whose normalized text is the same. */
  readonly ids: readonly string[];
}

const indexes = new WeakMap<Catalog, readonly Reference[]>();

/** The reference texts, with licenses of identical text merged into one entry. */
function referencesOf(catalog: Catalog): readonly Reference[] {
  let index = indexes.get(catalog);
  if (!index) {
    const byText = new Map<string, string[]>();
    for (const [id, text] of catalog.texts) {
      const key = words(text).join(' ');
      byText.set(key, [...(byText.get(key) ?? []), id]);
    }
    index = [...byText].map(([key, ids]) => ({ ids: ids.sort(), ...bagOf(key.split(' ')) }));
    indexes.set(catalog, index);
  }
  return index;
}

interface Scored {
  readonly reference: Reference;
  readonly score: number;
  /** Share of the reference's word pairs found in the file. */
  readonly containment: number;
}

function scoreAgainst(file: Bag, references: readonly Reference[]): Scored[] {
  return references.map((reference) => {
    const shared = sharedPairs(file.pairs, reference.pairs);
    return {
      reference,
      score: (2 * shared) / (file.total + reference.total),
      containment: reference.total === 0 ? 0 : shared / reference.total,
    };
  });
}

/** The licenses whose full text is in the file, leaving out one that is only a part of another (MIT-0 in MIT). */
function includedLicenses(scored: readonly Scored[]): Reference[] {
  const full = scored
    .filter((s) => s.reference.total >= MIN_WORDS && s.containment >= CONTAINED_SHARE)
    .map((s) => s.reference);
  return full.filter(
    (reference) =>
      !full.some(
        (other) =>
          other !== reference &&
          sharedPairs(reference.pairs, other.pairs) / reference.total >= PART_SHARE &&
          (other.total > reference.total ||
            (other.total === reference.total && other.ids.join() < reference.ids.join())),
      ),
  );
}

/** Compares the text of a license file with the bundled SPDX license texts. */
export function identifyLicenseText(text: string, catalog: Catalog): Identification {
  const candidate = words(text);
  if (candidate.length < MIN_WORDS) {
    return { kind: 'unrecognized' };
  }
  const file = bagOf(candidate);
  const scored = scoreAgainst(file, referencesOf(catalog));
  const included = includedLicenses(scored);
  if (included.length >= 2) {
    return { kind: 'multiple', ids: included.flatMap((reference) => reference.ids).sort() };
  }
  const best = scored.reduce<Scored | undefined>(
    (top, current) => (top === undefined || current.score > top.score ? current : top),
    undefined,
  );
  if (!best || best.score < MODIFIED_SIMILARITY) {
    return { kind: 'unrecognized' };
  }
  const changed =
    Math.max(
      longestNovelRun(file.list, best.reference.pairs),
      longestNovelRun(best.reference.list, file.pairs),
    ) >= MAX_CHANGE_RUN;
  if (best.score < MATCH_SIMILARITY || changed) {
    return { kind: 'modified', ids: best.reference.ids, score: best.score };
  }
  return {
    kind: 'match',
    ids: best.reference.ids,
    score: best.score,
    verbatim: best.score >= VERBATIM_SIMILARITY,
  };
}
