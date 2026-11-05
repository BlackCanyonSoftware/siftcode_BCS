import type { Node } from 'web-tree-sitter';
import type { ClassCohesion, ClassFact, ClassKind } from '../model/types.js';
import type { GrammarId } from '../registry.js';

/** What a class has in it, before it is summed up. */
interface ClassParts {
  readonly methods: MethodInfo[];
  /** Fields, properties, and attributes, by name. */
  readonly fields: Set<string>;
}

interface MethodInfo {
  readonly name: string;
  /** Static methods have no instance state, so they do not take part in cohesion. */
  readonly isStatic: boolean;
  /** Names of the class's own members this method refers to (`this.x`, `self.x`, a bare field). */
  readonly uses: ReadonlySet<string>;
}

const CLASS_TYPES: Readonly<Record<GrammarId, Readonly<Record<string, ClassKind>>>> = {
  javascript: { class_declaration: 'class' },
  typescript: { class_declaration: 'class', abstract_class_declaration: 'class' },
  tsx: { class_declaration: 'class', abstract_class_declaration: 'class' },
  python: { class_definition: 'class' },
  csharp: {
    class_declaration: 'class',
    struct_declaration: 'struct',
    record_declaration: 'record',
    record_struct_declaration: 'struct',
  },
};

/** Finds every named class, struct, and record and sums up its methods, fields, and cohesion. */
export function extractClasses(grammar: GrammarId, root: Node): ClassFact[] {
  const kinds = CLASS_TYPES[grammar];
  const classes: ClassFact[] = [];
  for (const node of root.descendantsOfType(Object.keys(kinds))) {
    const name = node.childForFieldName('name')?.text;
    const kind = kinds[node.type];
    if (name === undefined || kind === undefined) {
      continue;
    }
    const parts = collectParts(grammar, node);
    classes.push({
      name,
      kind,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      methods: parts.methods.length,
      fields: parts.fields.size,
      cohesion: cohesionOf(parts.methods),
    });
  }
  return classes;
}

function collectParts(grammar: GrammarId, node: Node): ClassParts {
  const parts: ClassParts = { methods: [], fields: new Set() };
  const members = node.childForFieldName('body')?.namedChildren ?? [];
  if (grammar === 'csharp') {
    addCsharpMembers(parts, node, members);
    return parts;
  }
  const addMember = grammar === 'python' ? addPythonMember : addJavascriptMember;
  for (const member of members) {
    addMember(parts, member);
  }
  return parts;
}

function addField(parts: ClassParts, name: Node | null): void {
  if (name) {
    parts.fields.add(name.text);
  }
}

/** How a language writes "a member of this object": `this.x`, `self.x`. */
interface SelfAccess {
  readonly nodeType: string;
  readonly objectField: string;
  readonly nameField: string;
  readonly isSelf: (object: Node) => boolean;
}

const JAVASCRIPT_SELF: SelfAccess = {
  nodeType: 'member_expression',
  objectField: 'object',
  nameField: 'property',
  isSelf: (object) => object.type === 'this',
};

function pythonSelf(receiver: string | undefined): SelfAccess {
  return {
    nodeType: 'attribute',
    objectField: 'object',
    nameField: 'attribute',
    isSelf: (object) => object.type === 'identifier' && object.text === receiver,
  };
}

function addJavascriptMember(parts: ClassParts, member: Node): void {
  if (member.type === 'field_definition' || member.type === 'public_field_definition') {
    addField(parts, member.childForFieldName('property') ?? member.childForFieldName('name'));
  } else if (member.type === 'method_definition') {
    const name = member.childForFieldName('name')?.text ?? '';
    const uses = attributeUses(member, JAVASCRIPT_SELF, parts.fields);
    if (name !== 'constructor') {
      const isStatic = member.children.some((child) => child.type === 'static');
      parts.methods.push({ name, isStatic, uses });
    }
  }
}

function addPythonMember(parts: ClassParts, member: Node): void {
  const decorated = member.type === 'decorated_definition';
  const definition = decorated ? member.childForFieldName('definition') : member;
  if (definition?.type === 'function_definition') {
    addPythonMethod(parts, definition, decorated ? member : undefined);
  } else if (member.type === 'expression_statement') {
    const assignment = member.namedChildren[0];
    const target = assignment?.type === 'assignment' ? assignment.childForFieldName('left') : null;
    if (target?.type === 'identifier') {
      addField(parts, target);
    }
  }
}

function addPythonMethod(parts: ClassParts, definition: Node, decorated: Node | undefined): void {
  const name = definition.childForFieldName('name')?.text ?? '';
  const uses = attributeUses(definition, pythonSelf(firstParameterName(definition)), parts.fields);
  if (name === '__init__') {
    return; // the constructor: its assignments define attributes, but it is not counted as a method
  }
  const decorators = decorated?.namedChildren.filter((child) => child.type === 'decorator') ?? [];
  const isStatic = decorators.some((decorator) => /staticmethod|classmethod/.test(decorator.text));
  parts.methods.push({ name, isStatic, uses });
}

function firstParameterName(definition: Node): string | undefined {
  const first = definition.childForFieldName('parameters')?.namedChildren[0];
  if (!first) {
    return undefined;
  }
  return first.type === 'identifier' ? first.text : first.namedChildren[0]?.text;
}

/**
 * Names of members reached through the object that stands for "this", and, as a side effect, the
 * names assigned that way, which are added to `fields`.
 */
function attributeUses(method: Node, access: SelfAccess, fields: Set<string>): Set<string> {
  const uses = new Set<string>();
  for (const node of method.descendantsOfType([access.nodeType])) {
    const object = node.childForFieldName(access.objectField);
    const name = node.childForFieldName(access.nameField)?.text;
    if (object && name !== undefined && access.isSelf(object)) {
      uses.add(name);
      if (isAssignmentTarget(node)) {
        fields.add(name);
      }
    }
  }
  return uses;
}

function isAssignmentTarget(node: Node): boolean {
  const parent = node.parent;
  const assigns =
    parent?.type === 'assignment_expression' ||
    parent?.type === 'assignment' ||
    parent?.type === 'augmented_assignment';
  return assigns && parent.childForFieldName('left')?.id === node.id;
}

function addCsharpMembers(parts: ClassParts, classNode: Node, members: readonly Node[]): void {
  // Primary constructor parameters (`class C(int a)`) behave like fields.
  const primary = classNode.namedChildren.find((child) => child.type === 'parameter_list');
  primary?.namedChildren.forEach((parameter) => {
    addField(parts, parameter.childForFieldName('name'));
  });

  const methods = members.filter((member) => member.type === 'method_declaration');
  for (const member of members) {
    if (member.type === 'field_declaration' || member.type === 'event_field_declaration') {
      member.descendantsOfType(['variable_declarator']).forEach((declarator) => {
        addField(parts, declarator.childForFieldName('name'));
      });
    } else if (member.type === 'property_declaration') {
      addField(parts, member.childForFieldName('name'));
    }
  }

  const memberNames = new Set([...parts.fields, ...methods.map(csharpMethodName)]);
  for (const method of methods) {
    parts.methods.push({
      name: csharpMethodName(method),
      isStatic: method.children.some(
        (child) => child.type === 'modifier' && child.text === 'static',
      ),
      uses: csharpUses(method, memberNames),
    });
  }
}

const csharpMethodName = (method: Node): string => method.childForFieldName('name')?.text ?? '';

/** Bare identifiers in a C# method that name one of the class's own members. */
function csharpUses(method: Node, memberNames: ReadonlySet<string>): Set<string> {
  const uses = new Set<string>();
  for (const identifier of method.descendantsOfType(['identifier'])) {
    if (!memberNames.has(identifier.text)) {
      continue;
    }
    const parent = identifier.parent;
    const isName = parent?.childForFieldName('name')?.id === identifier.id;
    // Only `this.x` and a bare `x` refer to the class's own members. The `name` of anything else is
    // a declaration (a local, a parameter, the method itself) or a member of another object.
    const isOwnMemberAccess =
      parent?.type === 'member_access_expression' &&
      (parent.childForFieldName('expression')?.type ?? 'this') === 'this';
    if (!isName || isOwnMemberAccess) {
      uses.add(identifier.text);
    }
  }
  return uses;
}

/**
 * LCOM4: join methods that use the same member, or where one calls another, and count the
 * groups. Only instance methods that use class state (or are used by one that does) take part.
 */
function cohesionOf(methods: readonly MethodInfo[]): ClassCohesion {
  const instance = methods.filter((method) => !method.isStatic);
  const indexByName = new Map(instance.map((method, index) => [method.name, index]));
  const parent = instance.map((_, index) => index);
  const fieldNode = new Map<string, number>();
  const participates = new Set<number>();

  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) {
      root = parent[root] ?? root;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  const nodeFor = (field: string): number => {
    let node = fieldNode.get(field);
    if (node === undefined) {
      node = parent.length;
      parent.push(node);
      fieldNode.set(field, node);
    }
    return node;
  };

  instance.forEach((method, index) => {
    for (const used of method.uses) {
      const other = indexByName.get(used);
      union(index, other ?? nodeFor(used));
      participates.add(index);
      if (other !== undefined) {
        participates.add(other);
      }
    }
  });

  return {
    methods: participates.size,
    components: new Set([...participates].map(find)).size,
  };
}
