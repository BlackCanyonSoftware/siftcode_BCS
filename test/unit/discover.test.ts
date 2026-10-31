import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError } from '../../src/core/errors.js';
import { MAX_FILE_BYTES, discoverFiles } from '../../src/discovery/discover.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'siftcode-discover-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(relativePath: string, content = 'x'): Promise<void> {
  const full = join(dir, relativePath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

describe('discoverFiles (US-001, US-002)', () => {
  it('finds supported files in a stable order with forward-slash relative paths', async () => {
    await put('b.py');
    await put('a/z.ts');
    await put('a/y.js');

    const { files } = await discoverFiles(dir);

    expect(files.map((f) => f.relativePath)).toEqual(['a/y.js', 'a/z.ts', 'b.py']);
  });

  it('skips dependency and build folders', async () => {
    await put('src/app.ts');
    await put('node_modules/pkg/index.js');
    await put('bin/Debug/App.cs');
    await put('obj/Generated.cs');
    await put('.venv/lib/site.py');

    const { files } = await discoverFiles(dir);

    expect(files.map((f) => f.relativePath)).toEqual(['src/app.ts']);
  });

  it('counts unsupported and oversized files instead of reading them', async () => {
    await put('readme.txt');
    await put('data.json');
    await put('huge.js', 'a'.repeat(MAX_FILE_BYTES + 1));

    const { files, skipped } = await discoverFiles(dir);

    expect(files).toEqual([]);
    expect(skipped).toEqual({ unsupported: 2, tooLarge: 1, symlinks: 0 });
  });

  it('accepts a single file as the scan root', async () => {
    await put('only.py');

    const { files } = await discoverFiles(join(dir, 'only.py'));

    expect(files.map((f) => f.relativePath)).toEqual(['only.py']);
  });

  it('does not follow symbolic links', async (context) => {
    await put('real/inside.py');
    try {
      await symlink(join(dir, 'real'), join(dir, 'link'), 'dir');
    } catch {
      context.skip(); // creating symlinks needs elevated rights on some Windows setups
    }

    const { files, skipped } = await discoverFiles(dir);

    expect(files.map((f) => f.relativePath)).toEqual(['real/inside.py']);
    expect(skipped.symlinks).toBe(1);
  });

  it('rejects a path that does not exist with a UsageError', async () => {
    await expect(discoverFiles(join(dir, 'missing'))).rejects.toBeInstanceOf(UsageError);
  });
});
