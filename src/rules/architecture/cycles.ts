import { LOOSE } from './components.js';
import type { DependencyGraph, FileEdge } from './graph.js';

/** One step of a cycle: a component, and a file in it that imports a file of the next component. */
export interface CycleStep {
  readonly component: string;
  readonly next: string;
  readonly edge: FileEdge;
}

/** Components that depend on each other in a loop, with the imports that make it. */
export interface Cycle {
  readonly components: readonly string[];
  readonly steps: readonly CycleStep[];
}

type ComponentEdges = Map<string, Map<string, FileEdge>>;

/** For each component, the components it imports from, each with the first import that shows it. */
function componentEdges(graph: DependencyGraph): ComponentEdges {
  const result: ComponentEdges = new Map();
  for (const edge of graph.edges) {
    const from = graph.componentOf.get(edge.from);
    const to = graph.componentOf.get(edge.to);
    if (from === undefined || to === undefined || from === to || from === LOOSE || to === LOOSE) {
      continue;
    }
    const targets = result.get(from) ?? new Map<string, FileEdge>();
    if (!targets.has(to)) {
      targets.set(to, edge);
    }
    result.set(from, targets);
  }
  return result;
}

/** Every component that `start` imports from, directly or through others (a breadth-first walk). */
function reachableFrom(start: string, edges: ComponentEdges): Set<string> {
  const seen = new Set<string>();
  // Iterating an array visits what is pushed while it runs.
  const queue = [start];
  for (const node of queue) {
    for (const next of edges.get(node)?.keys() ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * The groups of two or more components that can all reach each other. A project has tens of
 * components, so asking each one what it reaches is cheap and simpler than a linear-time algorithm.
 */
function stronglyConnected(edges: ComponentEdges): string[][] {
  const nodes = [...edges.keys()].sort();
  const reach = new Map(nodes.map((node) => [node, reachableFrom(node, edges)]));
  const grouped = new Set<string>();
  const groups: string[][] = [];
  for (const node of nodes) {
    const group = nodes.filter(
      (other) => reach.get(node)?.has(other) === true && reach.get(other)?.has(node) === true,
    );
    if (!grouped.has(node) && group.length > 1) {
      group.forEach((member) => grouped.add(member));
      groups.push(group);
    }
  }
  return groups;
}

/** The shortest way back to `start` through `members`, as the components visited after it. */
function shortestWayBack(
  start: string,
  members: ReadonlySet<string>,
  edges: ComponentEdges,
): string[] {
  const came = new Map<string, string>();
  const queue = [start];
  // Iterating an array visits what is pushed while it runs, so this is a breadth-first walk.
  for (const node of queue) {
    for (const next of [...(edges.get(node)?.keys() ?? [])].sort()) {
      if (!members.has(next)) {
        continue;
      }
      if (next === start) {
        const path = [node];
        for (let back = came.get(node); back !== undefined; back = came.get(back)) {
          path.unshift(back);
        }
        return path;
      }
      if (!came.has(next) && next !== start) {
        came.set(next, node);
        queue.push(next);
      }
    }
  }
  return [start];
}

/** Every group of components that depend on each other, each shown as one shortest cycle. */
export function findCycles(graph: DependencyGraph): Cycle[] {
  const edges = componentEdges(graph);
  return stronglyConnected(edges).map((group) => {
    const members = new Set(group);
    const start = group[0] ?? '';
    // `path` starts at `start`'s successor on the shortest loop; rebuild it as start, ..., last.
    const loop = [start, ...shortestWayBack(start, members, edges).filter((c) => c !== start)];
    const steps = loop.map((component, i): CycleStep => {
      const next = loop[(i + 1) % loop.length] ?? start;
      const edge = edges.get(component)?.get(next);
      return { component, next, edge: edge ?? { from: '', to: '', line: 1 } };
    });
    return { components: group, steps };
  });
}
