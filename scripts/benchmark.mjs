// Scans a generated mixed-language project and reports how long it took, against the target in
// the PRD (NFR-4: 50,000 lines in under 30 seconds on a typical laptop).
//
// Usage: npm run benchmark [-- --files 500]
// Run after a build; this measures the built library in dist/.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const TARGET_LINES = 50_000;
const TARGET_SECONDS = 30;
const BLOCKS_PER_FILE = 10;

const { values } = parseArgs({ options: { files: { type: 'string', default: '500' } } });
const fileCount = Number.parseInt(values.files, 10);

const blocks = {
  '.js': (i) =>
    `function work${i}(a, b) {\n  let total = 0;\n  for (let n = 0; n < a; n++) {\n    total += n * b;\n    if (total > 100) {\n      total -= 7;\n    }\n  }\n  return total;\n}\n`,
  '.ts': (i) =>
    `export function work${i}(a: number, b: number): number {\n  let total = 0;\n  for (let n = 0; n < a; n++) {\n    total += n * b;\n    if (total > 100) {\n      total -= 7;\n    }\n  }\n  return total;\n}\n`,
  '.py': (i) =>
    `def work${i}(a, b):\n    total = 0\n    for n in range(a):\n        total += n * b\n        if total > 100:\n            total -= 7\n    return total\n\n`,
  '.cs': (i) =>
    `    public int Work${i}(int a, int b)\n    {\n        var total = 0;\n        for (var n = 0; n < a; n++)\n        {\n            total += n * b;\n            if (total > 100) { total -= 7; }\n        }\n        return total;\n    }\n`,
};

function fileContent(extension, index) {
  const body = Array.from({ length: BLOCKS_PER_FILE }, (_, i) =>
    blocks[extension](index * BLOCKS_PER_FILE + i),
  ).join('\n');
  return extension === '.cs' ? `public class Generated${index}\n{\n${body}}\n` : body;
}

const root = await mkdtemp(join(tmpdir(), 'siftcode-bench-'));
const extensions = Object.keys(blocks);
let lines = 0;
try {
  for (let index = 0; index < fileCount; index++) {
    const extension = extensions[index % extensions.length];
    const content = fileContent(extension, index);
    lines += content.split('\n').length - 1;
    const target = join(root, `pkg${index % 20}`, `file${index}${extension}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  const distIndex = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js');
  const { scan } = await import(pathToFileURL(distIndex).href);

  const started = process.hrtime.bigint();
  const result = await scan(root);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;

  const peakMegabytes = process.resourceUsage().maxRSS / 1024;
  console.log(`Files scanned:   ${result.filesScanned}`);
  console.log(`Lines scanned:   ${lines}`);
  console.log(`Findings:        ${result.findings.length}`);
  console.log(`Time:            ${seconds.toFixed(2)} s (${Math.round(lines / seconds)} lines/s)`);
  console.log(`Peak memory:     ${peakMegabytes.toFixed(0)} MB`);
  if (lines >= TARGET_LINES) {
    const verdict = seconds <= TARGET_SECONDS ? 'within' : 'OVER';
    console.log(`Target:          ${TARGET_LINES} lines in ${TARGET_SECONDS} s: ${verdict} target`);
  } else {
    console.log(`Target:          not comparable (scanned fewer than ${TARGET_LINES} lines)`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
