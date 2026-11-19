/** A box in a diagram: what it is called, and the line of the file it is on. */
export interface DiagramNode {
  readonly label: string;
  readonly line: number;
}

/** A diagram found in a file, with the boxes it draws. */
export interface Diagram {
  readonly path: string;
  readonly kind: 'mermaid' | 'plantuml';
  readonly nodes: readonly DiagramNode[];
  /** All the words of the diagram's text, lowercase, for "is this name drawn anywhere". */
  readonly words: ReadonlySet<string>;
}

const MERMAID_FILE = /\.(?:mmd|mermaid)$/i;
const PLANTUML_FILE = /\.(?:puml|plantuml|pu|wsd|iuml)$/i;

/** A fenced block in Markdown (```mermaid ... ```) or the PlantUML markers in any text. */
const FENCE = /^[ \t]*(```|~~~)[ \t]*\{?\.?(mermaid|plantuml|puml)\b[^\n]*$/i;

interface Block {
  readonly kind: Diagram['kind'];
  /** The block's lines and the 1-based line of the file the first one is on. */
  readonly lines: readonly string[];
  readonly firstLine: number;
}

/** The diagrams a text holds: the whole file for a diagram file, the fenced blocks of a document. */
function blocksOf(path: string, text: string): Block[] {
  const lines = text.split(/\r?\n/);
  if (MERMAID_FILE.test(path)) {
    return [{ kind: 'mermaid', lines, firstLine: 1 }];
  }
  if (PLANTUML_FILE.test(path)) {
    return [{ kind: 'plantuml', lines, firstLine: 1 }];
  }
  return fencedBlocks(lines);
}

/** The ```mermaid and ```plantuml blocks of a Markdown file, with the line each one starts on. */
function fencedBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i] ?? '');
    if (open) {
      const fence = open[1] ?? '```';
      const kind = open[2]?.toLowerCase() === 'mermaid' ? 'mermaid' : 'plantuml';
      const end = closingLine(lines, i + 1, fence);
      blocks.push({ kind, lines: lines.slice(i + 1, end), firstLine: i + 2 });
      i = end;
    }
  }
  return blocks;
}

/** The index of the line that closes a fence opened before `from`, or the end of the file. */
function closingLine(lines: readonly string[], from: number, fence: string): number {
  const index = lines.findIndex((line, i) => i >= from && line.trim().startsWith(fence));
  return index < 0 ? lines.length : index;
}

/**
 * A Mermaid node as written: `id[Label]`, `id(Label)`, `id([Label])`, `id[(Label)]`, `id{{Label}}`,
 * `id>Label]`, with an optional quoted label. A line may hold several, joined by arrows.
 */
const MERMAID_NODE =
  /\b([A-Za-z_][\w-]*)(?:\[\(|\(\[|\[\[|\(\(|\{\{|\[|\(|\{|>)\s*("[^"]*"|[^\])}"]+?)\s*(?:\)\]|\]\)|\]\]|\)\)|}}|\]|\)|})/g;
const MERMAID_SUBGRAPH = /^\s*subgraph\s+(?:[\w-]+\s*\[\s*("[^"]*"|[^\]]+?)\s*\]|(.+?))\s*$/;
/** `Container(id, "Label", ...)`, `Component(...)`, `System(...)`, `Person(...)`, the C4 forms. */
const C4_ELEMENT =
  /\b(?:Container|Component|System|Boundary|Container_Boundary|System_Boundary)(?:Db|Queue|_Ext)?\(\s*[\w-]+\s*,\s*"([^"]*)"/g;

/** The kind of Mermaid diagram, from its first line; only flowcharts and C4 draw modules. */
function mermaidKind(block: Block): 'flowchart' | 'c4' | undefined {
  const header = block.lines.find((line) => line.trim() !== '' && !line.trim().startsWith('%%'));
  if (/^\s*(?:graph|flowchart)\b/.test(header ?? '')) {
    return 'flowchart';
  }
  return /^\s*C4(?:Context|Container|Component|Dynamic|Deployment)\b/.test(header ?? '')
    ? 'c4'
    : undefined;
}

/** The labels of the boxes written on one line of a Mermaid diagram. */
function mermaidLabels(text: string, kind: 'flowchart' | 'c4'): string[] {
  if (kind === 'c4') {
    return [...text.matchAll(C4_ELEMENT)].map((match) => match[1] ?? '');
  }
  const subgraph = MERMAID_SUBGRAPH.exec(text);
  if (subgraph) {
    return [unquote(subgraph[1] ?? subgraph[2] ?? '')];
  }
  return [...text.matchAll(MERMAID_NODE)].map((match) => unquote(match[2] ?? ''));
}

function mermaidNodes(block: Block): DiagramNode[] {
  const kind = mermaidKind(block);
  if (kind === undefined) {
    return [];
  }
  return block.lines
    .flatMap((text, index) =>
      mermaidLabels(text, kind).map((label) => ({ label, line: block.firstLine + index })),
    )
    .filter((node) => node.label !== '');
}

/** `[Name]` and `component Name` or `component "Name" as Alias`, the PlantUML component forms. */
const PLANTUML_BRACKET = /(?<!\[)\[([^[\]\n]+)\](?!\])/g;
const PLANTUML_COMPONENT = /^\s*component\s+(?:"([^"]+)"|([\w./-]+))/i;

function plantumlNodes(block: Block): DiagramNode[] {
  const nodes: DiagramNode[] = [];
  block.lines.forEach((text, index) => {
    const line = block.firstLine + index;
    if (/^\s*(?:'|note\b|@)/i.test(text)) {
      return;
    }
    const component = PLANTUML_COMPONENT.exec(text);
    if (component) {
      nodes.push({ label: component[1] ?? component[2] ?? '', line });
      return;
    }
    for (const match of text.matchAll(PLANTUML_BRACKET)) {
      nodes.push({ label: (match[1] ?? '').trim(), line });
    }
  });
  return nodes.filter((node) => node.label !== '');
}

/** The label without its quotes and line breaks (`<br/>`, `\n`) and markup. */
function unquote(label: string): string {
  return label
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/<br\s*\/?>|\\n/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function wordsOf(lines: readonly string[]): Set<string> {
  return new Set(
    lines
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1),
  );
}

/** The diagrams in one file: Mermaid flowcharts and C4, and PlantUML components. Other kinds are not read. */
export function parseDiagrams(path: string, text: string): Diagram[] {
  return blocksOf(path, text).map((block) => ({
    path,
    kind: block.kind,
    nodes: block.kind === 'mermaid' ? mermaidNodes(block) : plantumlNodes(block),
    words: wordsOf(block.lines),
  }));
}
