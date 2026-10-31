import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'vitest';

/** Absolute path of something under `test/fixtures`. */
export function fixture(relativePath: string): string {
  return fileURLToPath(new URL(`../fixtures/${relativePath}`, import.meta.url));
}

export interface Projects {
  /** Creates a temporary project from a map of relative path to file content; returns its folder. */
  create(files: Readonly<Record<string, string>>): Promise<string>;
}

/** Temporary projects are deleted after each test. Call once inside a `describe` or at file level. */
export function useProjects(): Projects {
  const folders: string[] = [];

  afterEach(async () => {
    await Promise.all(folders.splice(0).map((f) => rm(f, { recursive: true, force: true })));
  });

  return {
    async create(files) {
      const folder = await mkdtemp(join(tmpdir(), 'siftcode-test-'));
      folders.push(folder);
      for (const [path, content] of Object.entries(files)) {
        const target = join(folder, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content);
      }
      return folder;
    },
  };
}

/** A function of `lines` lines (at least 3) named `name`, in JavaScript. */
export function longJsFunction(name: string, lines: number): string {
  const body = Array.from({ length: Math.max(0, lines - 2) }, (_, i) => `  total += ${i};`);
  return [`function ${name}() {`, ...body, '}', ''].join('\n');
}
