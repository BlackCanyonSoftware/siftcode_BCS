import type { CodeFile } from '../../languages/model/types.js';
import { projectCode } from '../code-text.js';
import type { RepoView } from '../types.js';
import { assignComponents } from './components.js';
import { indexProject, resolveImport } from './resolve.js';

/** One import of a project file by another. */
export interface FileEdge {
  readonly from: string;
  readonly to: string;
  readonly line: number;
}

export interface DependencyGraph {
  readonly files: readonly CodeFile[];
  readonly edges: readonly FileEdge[];
  /** The component each file belongs to (LOOSE for a file that belongs to none). */
  readonly componentOf: ReadonlyMap<string, string>;
}

/** The folder of each `.csproj` in the project, longest first: where a C# project begins. */
function projectFolders(repo: RepoView): string[] {
  return repo.files
    .filter((path) => path.endsWith('.csproj'))
    .map((path) => path.split('/').slice(0, -1).join('/'))
    .sort((a, b) => b.length - a.length);
}

/** The C# files that hold a project's `global using` lines: they name namespaces for the whole project. */
const GLOBAL_USINGS = /(?:^|\/)(?:global|implicit)usings\.cs$/i;

/**
 * A C# `using` names a namespace, and a namespace can be declared in several projects (extension
 * methods are often placed in `Microsoft.Extensions.Hosting`, and many projects share a root such as
 * `GitVersion`). When the files that declare it are in more than one project there is no telling which
 * one is meant, so the import is left out instead of drawn to all of them.
 */
function inOneProject(targets: readonly string[], projects: readonly string[]): boolean {
  const projectOf = (path: string) =>
    projects.find((folder) => folder === '' || path.startsWith(`${folder}/`));
  return new Set(targets.map(projectOf)).size <= 1;
}

/**
 * Who imports whom among the project's own source files (not tests, not vendored code), and which
 * component each file belongs to. Only imports that resolve to a file of the project are edges, so a
 * package, the standard library, and a path alias are left out rather than guessed at.
 */
export function buildDependencyGraph(repo: RepoView): DependencyGraph {
  const files = projectCode(repo);
  const index = indexProject(files);
  const projects = projectFolders(repo);
  const edges: FileEdge[] = [];
  for (const file of files.filter((candidate) => !GLOBAL_USINGS.test(candidate.path))) {
    for (const imported of file.usage.imports) {
      const targets = resolveImport(file, imported, index);
      if (file.grammar === 'csharp' && !inOneProject(targets, projects)) {
        continue;
      }
      for (const to of targets) {
        edges.push({ from: file.path, to, line: imported.line });
      }
    }
  }
  const componentOf = assignComponents(
    files.map((file) => file.path),
    projects,
  );
  return { files, edges, componentOf };
}
