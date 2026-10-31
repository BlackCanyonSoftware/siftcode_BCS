def long_function(items):
    total = 0
    for item in items:
        total += item.price
        total += item.tax
    return total


class Cart:
    def long_method(self, items):
        total = 0
        for item in items:
            total += item.price
            total += item.tax
        return total

    def short_method(self):
        return 1


square = lambda value: value * value
