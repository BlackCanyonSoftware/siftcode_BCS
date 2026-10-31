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

async function found(options?: { ignore?: string[] }): Promise<string[]> {
  const { files } = await discoverFiles(dir, options);
  return files.map((f) => f.relativePath);
}

describe('discoverFiles (US-001, US-002)', () => {
  it('finds supported files in a stable order with forward-slash relative paths', async () => {
    await put('b.py');
    await put('a/z.ts');
    await put('a/y.js');

    expect(await found()).toEqual(['a/y.js', 'a/z.ts', 'b.py']);
  });

  it('skips dependency and build folders', async () => {
    await put('src/app.ts');
    await put('node_modules/pkg/index.js');
    await put('bin/Debug/App.cs');
    await put('obj/Generated.cs');
    await put('.venv/lib/site.py');
    await put('deep/node_modules/pkg/index.js');

    expect(await found()).toEqual(['src/app.ts']);
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

    const { skipped } = await discoverFiles(dir);

    expect(await found()).toEqual(['real/inside.py']);
    expect(skipped.symlinks).toBe(1);
  });

  it('rejects a path that does not exist with a UsageError', async () => {
    await expect(discoverFiles(join(dir, 'missing'))).rejects.toBeInstanceOf(UsageError);
  });
});

describe('ignore rules (US-002)', () => {
  it('honors the .gitignore in the scanned folder', async () => {
    await put('.gitignore', 'generated/\n*.min.js\n');
    await put('src/app.js');
    await put('generated/out.js');
    await put('src/lib.min.js');

    expect(await found()).toEqual(['src/app.js']);
  });

  it('honors a nested .gitignore only inside its own folder', async () => {
    await put('pkg/.gitignore', 'secret.py\n');
    await put('pkg/secret.py');
    await put('pkg/public.py');
    await put('secret.py');

    expect(await found()).toEqual(['pkg/public.py', 'secret.py']);
  });

  it('lets a nested .gitignore re-include what its parent ignored', async () => {
    await put('.gitignore', '*.py\n');
    await put('keep/.gitignore', '!*.py\n');
    await put('keep/a.py');
    await put('drop.py');

    expect(await found()).toEqual(['keep/a.py']);
  });

  it('applies the config ignore patterns', async () => {
    await put('src/app.js');
    await put('legacy/old.js');
    await put('src/old.test.js');

    expect(await found({ ignore: ['legacy/', '*.test.js'] })).toEqual(['src/app.js']);
  });

  it('lets the config re-include a folder that is ignored by default', async () => {
    await put('bin/tool.js');
    await put('src/app.js');

    expect(await found({ ignore: ['!bin/'] })).toEqual(['bin/tool.js', 'src/app.js']);
  });

  it('lets the config override a .gitignore', async () => {
    await put('.gitignore', 'vendor/\n');
    await put('vendor/lib.js');

    expect(await found({ ignore: ['!vendor/'] })).toEqual(['vendor/lib.js']);
  });

  it('scans a file named directly even if an ignore rule would exclude it', async () => {
    await put('.gitignore', '*.js\n');
    await put('a.js');

    const { files } = await discoverFiles(join(dir, 'a.js'));

    expect(files.map((f) => f.relativePath)).toEqual(['a.js']);
  });
});
