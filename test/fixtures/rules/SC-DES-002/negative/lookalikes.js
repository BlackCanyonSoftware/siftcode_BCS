import path from 'node:path';

// Calls that share a name with a locator method but are something else.
export const full = path.resolve('a', 'b');
export const done = Promise.resolve(1);

const cache = new Map();
export const hit = cache.get('key');
export const plugin = registry.get('plugin');
export const bag = settings.get('theme');
