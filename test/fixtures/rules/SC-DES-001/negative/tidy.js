import path from 'node:path';

export class Tidy {
  run(items, order) {
    // Idiomatic chaining: array methods are not reaching through objects.
    const names = items.filter(Boolean).map((item) => item.name).join(', ');
    // The root is an imported module, reached by name.
    const where = path.dirname(order.file.name).length;
    // The first member after `this` is the object's own component.
    const own = this.parts.engine.cooling.pump();
    // Only property reads, no method call: a weaker case, reported only on request.
    const data = order.customer.address.city.zip;
    return [names, where, own, data];
  }
}
