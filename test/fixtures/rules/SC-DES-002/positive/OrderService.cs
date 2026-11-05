using Microsoft.Extensions.DependencyInjection;

public class OrderService
{
    private readonly IServiceProvider _provider;

    public OrderService(IServiceProvider provider)
    {
        _provider = provider;
    }

    public void Place(Order order)
    {
        var payments = _provider.GetRequiredService<IPaymentGateway>();
        payments.Charge(order);
        var audit = ServiceLocator.Current.GetInstance<IAuditLog>();
        audit.Write(order);
    }
}
