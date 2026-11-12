import { describe, expect, it } from 'vitest';
import { sbomProblems } from '../../scripts/sbom-check.mjs';

const manifest = {
  name: 'siftcode',
  dependencies: { ignore: '7.0.14', 'web-tree-sitter': '0.27.1', zod: '4.6.7' },
};

const component = (name: string, version: string) => ({ name, version });

describe('release SBOM completeness (US-072)', () => {
  it('accepts an SBOM that lists every production dependency', () => {
    const sbom = {
      metadata: { component: { name: 'siftcode' } },
      components: [
        component('ignore', '7.0.14'),
        component('web-tree-sitter', '0.27.1'),
        component('zod', '4.6.7'),
      ],
    };

    expect(sbomProblems(sbom, manifest)).toEqual([]);
  });

  it('rejects what `npm sbom --omit dev` produced here: it left out `ignore` and named the root after the folder', () => {
    const sbom = {
      metadata: { component: { name: 'SiftCode_BCS' } },
      components: [component('web-tree-sitter', '0.27.1'), component('zod', '4.6.7')],
    };

    expect(sbomProblems(sbom, manifest)).toEqual([
      'the root component is "SiftCode_BCS", expected "siftcode"',
      'ignore@7.0.14 is a production dependency but is not in the SBOM',
    ]);
  });

  it('rejects a dependency listed at another version, and an SBOM with no components', () => {
    const wrongVersion = {
      metadata: { component: { name: 'siftcode' } },
      components: [
        component('ignore', '5.3.2'),
        component('web-tree-sitter', '0.27.1'),
        component('zod', '4.6.7'),
      ],
    };

    expect(sbomProblems(wrongVersion, manifest)).toEqual([
      'ignore@7.0.14 is a production dependency but is not in the SBOM',
    ]);
    expect(sbomProblems({ metadata: { component: { name: 'siftcode' } } }, manifest)).toHaveLength(
      3,
    );
  });
});
