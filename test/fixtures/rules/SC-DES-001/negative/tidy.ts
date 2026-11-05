import * as path from 'node:path';

export class Tidy {
  run(items: Item[], order: Order): unknown[] {
    const names = items.filter(Boolean).map((item) => item.name).join(', ');
    const where = path.dirname(order.file.name).length;
    const own = this.parts.engine.cooling.pump();
    const data = order.customer.address.city.zip;
    return [names, where, own, data];
  }
}
