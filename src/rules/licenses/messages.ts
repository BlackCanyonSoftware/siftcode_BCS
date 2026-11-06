import type { Identification } from './identify.js';

/** Every license finding ends with this: the checks are against published license data. */
export const NOT_LEGAL_ADVICE = 'This is a check against published license data, not legal advice.';

/** The SPDX ids an identification names (none when the text was not recognized). */
export function identificationIds(identification: Identification): readonly string[] {
  return identification.kind === 'unrecognized' ? [] : identification.ids;
}
