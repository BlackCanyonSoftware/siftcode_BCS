import ignore, { type Ignore } from 'ignore';

interface NestedLayer {
  /** Folder the patterns are relative to, as a path from the scan root. Never the root itself. */
  readonly base: string;
  readonly patterns: Ignore;
}

interface RootParts {
  readonly defaults: readonly string[];
  readonly gitignore: readonly string[];
  readonly config: readonly string[];
}

/**
 * The ignore rules in force at one point of a directory walk.
 *
 * At the scan root the built-in defaults, the root `.gitignore`, and the config file's `ignore`
 * patterns form one ordered list, so a later pattern can re-include what an earlier one excluded
 * (for example `!bin/` in the config re-includes a folder ignored by default). A `.gitignore` in a
 * subfolder adds a layer that applies below that folder and is evaluated after the root list.
 *
 * Limits: only `.gitignore` files inside the scanned folder are read (not `.git/info/exclude` or
 * the user's global ignore file), and a nested layer cannot re-include a folder its parent ignored,
 * which is rare because ignored folders are not entered.
 */
export class IgnoreStack {
  private constructor(
    private readonly parts: RootParts,
    private readonly root: Ignore,
    private readonly nested: readonly NestedLayer[],
  ) {}

  static create(defaults: readonly string[], config: readonly string[]): IgnoreStack {
    return IgnoreStack.build({ defaults, gitignore: [], config }, []);
  }

  /** Adds the contents of a `.gitignore` found in `base` ('' for the scan root). */
  withGitignore(base: string, content: string): IgnoreStack {
    const lines = content.split(/\r?\n/);
    if (base === '') {
      return IgnoreStack.build({ ...this.parts, gitignore: lines }, this.nested);
    }
    return new IgnoreStack(this.parts, this.root, [
      ...this.nested,
      { base, patterns: ignore().add(lines) },
    ]);
  }

  /** `path` is relative to the scan root with forward slashes. */
  isIgnored(path: string, isDirectory: boolean): boolean {
    const asked = (local: string) => (isDirectory ? `${local}/` : local);
    let ignored = this.root.ignores(asked(path));
    for (const layer of this.nested) {
      if (!path.startsWith(`${layer.base}/`)) {
        continue;
      }
      const result = layer.patterns.test(asked(path.slice(layer.base.length + 1)));
      if (result.ignored) {
        ignored = true;
      } else if (result.unignored) {
        ignored = false;
      }
    }
    return ignored;
  }

  private static build(parts: RootParts, nested: readonly NestedLayer[]): IgnoreStack {
    const root = ignore().add([...parts.defaults, ...parts.gitignore, ...parts.config]);
    return new IgnoreStack(parts, root, nested);
  }
}
