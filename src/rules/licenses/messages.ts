import type { Identification } from './identify.js';

/** The SPDX ids an identification names (none when the text was not recognized). */
export function identificationIds(identification: Identification): readonly string[] {
  return identification.kind === 'unrecognized' ? [] : identification.ids;
}
