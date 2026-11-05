using System.IO;
using System.Linq;

public class Tidy
{
    private Parts parts;

    public object Run(Item[] items, Order order)
    {
        var names = items.Where(i => i != null).Select(i => i.Name).ToList();
        var where = System.IO.Path.Combine(order.File.Name, "x");
        var own = this.parts.Engine.Cooling.Pump();
        var data = order.Customer.Address.City.Zip;
        return names;
    }
}
