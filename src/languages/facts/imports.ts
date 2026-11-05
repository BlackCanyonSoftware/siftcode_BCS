import type { Node } from 'web-tree-sitter';
import type { ImportFact } from '../model/types.js';
import type { GrammarId } from '../registry.js';

/** Finds the modules a file imports (JavaScript/TypeScript), imports (Python), or uses (C#). */
export function extractImports(grammar: GrammarId, root: Node): ImportFact[] {
  switch (grammar) {
    case 'javascript':
    case 'typescript':
    case 'tsx':
      return javascriptImports(root);
    case 'python':
      return pythonImports(root);
    case 'csharp':
      return csharpImports(root);
  }
}

const line = (node: Node): number => node.startPosition.row + 1;

/** The text of a string literal without its quotes. */
function stringValue(node: Node | null | undefined): string | undefined {
  return node ? node.text.slice(1, -1) : undefined;
}

function javascriptImports(root: Node): ImportFact[] {
  const imports: ImportFact[] = [];
  for (const node of root.descendantsOfType(['import_statement', 'export_statement'])) {
    // `import x = require('x')` (TypeScript) keeps its source inside the import clause.
    const requireClause = node.namedChildren.find(
      (child) => child.type === 'import_require_clause',
    );
    const module = stringValue((requireClause ?? node).childForFieldName('source'));
    if (module !== undefined) {
      imports.push({ module, bindings: javascriptBindings(node), line: line(node) });
    }
  }
  for (const call of root.descendantsOfType(['call_expression'])) {
    const isRequire = call.childForFieldName('function')?.text === 'require';
    const module = isRequire
      ? stringValue(call.childForFieldName('arguments')?.namedChildren[0])
      : undefined;
    if (module !== undefined) {
      imports.push({ module, bindings: requireBindings(call), line: line(call) });
    }
  }
  return imports;
}

/** Local names created by `import a, { b as c }, * as d from '...'` and `import e = require(...)`. */
function javascriptBindings(statement: Node): string[] {
  return statement.namedChildren.flatMap((clause) => {
    if (clause.type === 'import_require_clause') {
      return clause.namedChildren.filter((child) => child.type === 'identifier').map((n) => n.text);
    }
    return clause.type === 'import_clause' ? clause.namedChildren.flatMap(importPartBindings) : [];
  });
}

function importPartBindings(part: Node): string[] {
  if (part.type === 'identifier' || part.type === 'namespace_import') {
    return [part.namedChildren[0]?.text ?? part.text];
  }
  return part.type === 'named_imports' ? part.namedChildren.flatMap(specifierBinding) : [];
}

/** `b` or `c` in `{ b, x as c }`: the name the file uses. */
function specifierBinding(specifier: Node): string[] {
  const local = specifier.childForFieldName('alias') ?? specifier.childForFieldName('name');
  return local ? [local.text] : [];
}

/** `const a = require('x')` and `const { a, b: c } = require('x')`. */
function requireBindings(call: Node): string[] {
  const declarator = call.parent;
  const target =
    declarator?.type === 'variable_declarator' ? declarator.childForFieldName('name') : null;
  if (!target) {
    return [];
  }
  if (target.type === 'identifier') {
    return [target.text];
  }
  return target.namedChildren.map((part) =>
    part.type === 'pair_pattern' ? (part.childForFieldName('value')?.text ?? '') : part.text,
  );
}

function pythonImports(root: Node): ImportFact[] {
  return root
    .descendantsOfType(['import_statement', 'import_from_statement'])
    .flatMap((node) =>
      node.type === 'import_statement' ? pythonImport(node) : pythonFromImport(node),
    );
}

/** `import a.b.c`, `import x as y`: one fact per module named. */
function pythonImport(node: Node): ImportFact[] {
  return node.childrenForFieldName('name').flatMap((name) => {
    const aliased = name.type === 'aliased_import';
    const dotted = aliased ? name.childForFieldName('name') : name;
    if (!dotted) {
      return [];
    }
    const local =
      (aliased ? name.childForFieldName('alias')?.text : undefined) ??
      dotted.namedChildren[0]?.text ??
      dotted.text;
    return [{ module: dotted.text, bindings: [local], line: line(node) }];
  });
}

/** `from m import n, o as p`, `from . import q`. */
function pythonFromImport(node: Node): ImportFact[] {
  const module = node.childForFieldName('module_name')?.text;
  if (module === undefined) {
    return [];
  }
  const bindings = node.childrenForFieldName('name').map((name) => {
    const alias = name.type === 'aliased_import' ? name.childForFieldName('alias') : null;
    return alias?.text ?? name.text;
  });
  return [{ module, bindings, line: line(node) }];
}

function csharpImports(root: Node): ImportFact[] {
  return root.descendantsOfType(['using_directive']).flatMap((node) => {
    const target = node.namedChildren.at(-1);
    if (!target) {
      return [];
    }
    const alias = node.childForFieldName('name');
    const isStatic = node.children.some((child) => child.type === 'static');
    const bindings = alias ? [alias.text] : isStatic ? [] : [namespaceRoot(target)];
    return [{ module: target.text, bindings, line: line(node) }];
  });
}

/** `System` in `System.IO.Path`. */
function namespaceRoot(name: Node): string {
  let current = name;
  for (let inner = current.childForFieldName('qualifier'); inner;) {
    current = inner;
    inner = current.childForFieldName('qualifier');
  }
  return current.text;
}
