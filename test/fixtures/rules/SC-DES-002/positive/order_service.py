class OrderService:
    def __init__(self, container):
        self.container = container

    def place(self, order):
        payments = self.container.resolve(PaymentGateway)
        return payments.charge(order)
