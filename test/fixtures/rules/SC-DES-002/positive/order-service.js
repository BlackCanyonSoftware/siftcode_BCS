export class OrderService {
  place(order) {
    const payments = container.resolve(PaymentGateway);
    return payments.charge(order);
  }
}
