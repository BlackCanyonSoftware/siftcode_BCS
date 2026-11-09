const IF_DIRECTIVE = /^[ \t]*#[ \t]*if\b/;
const ELSE_DIRECTIVE = /^[ \t]*#[ \t]*(?:else|elif)\b/;
const ENDIF_DIRECTIVE = /^[ \t]*#[ \t]*endif\b/;

/** One open `#if`: whether the branch being read is its first, and so is kept. */
interface Frame {
  keep: boolean;
}

/**
 * C# source read as the first branch of every `#if` block: the directive lines, and the code under
 * `#elif` and `#else`, are blanked out. A parser cannot know which symbols are defined, and a block
 * that splits one member (`#if X public override #else private #endif async Task M()`) leaves it
 * with neither branch whole, so reading both branches as one file fails.
 *
 * Every line keeps its place and its line ending, so line numbers in the result are the original's.
 * Returns `undefined` when the source has no `#if`. Directives such as `#region` and `#nullable` are
 * left alone.
 */
export function firstConditionalBranch(source: string): string | undefined {
  if (!/^[ \t]*#[ \t]*if\b/m.test(source)) {
    return undefined;
  }
  const frames: Frame[] = [];
  return source
    .split(/(?<=\n)/)
    .map((line) => {
      const [text = '', ending = ''] = /^([^\r\n]*)(\r?\n?)$/.exec(line)?.slice(1) ?? [line, ''];
      if (IF_DIRECTIVE.test(text)) {
        frames.push({ keep: true });
        return ending;
      }
      if (ELSE_DIRECTIVE.test(text)) {
        const top = frames[frames.length - 1];
        if (top) {
          top.keep = false;
        }
        return ending;
      }
      if (ENDIF_DIRECTIVE.test(text)) {
        frames.pop();
        return ending;
      }
      return frames.every((frame) => frame.keep) ? line : ending;
    })
    .join('');
}
