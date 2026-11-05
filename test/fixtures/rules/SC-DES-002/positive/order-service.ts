export class OrderService {
  constructor(private container: Container) {}

  place(order: Order): void {
    const payments = this.container.get(PaymentGateway);
    payments.charge(order);
  }
}
