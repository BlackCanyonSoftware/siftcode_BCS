// Not named like a composition root, but the function that does the wiring is.
export function configureServices(container) {
  const gateway = container.resolve(PaymentGateway);
  container.register(OrderService, new OrderService(gateway));
}
