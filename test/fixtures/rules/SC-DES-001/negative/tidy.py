import os


class Tidy:
    def run(self, items, order):
        names = ", ".join(str(item).strip().lower() for item in items)
        where = os.path.join(order.file.name, "x")
        own = self.parts.engine.cooling.pump()
        data = order.customer.address.city.zip
        return names, where, own, data
