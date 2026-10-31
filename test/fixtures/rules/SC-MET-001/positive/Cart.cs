public class Cart
{
    public int LongMethod(int[] items)
    {
        var total = 0;
        foreach (var item in items)
        {
            total += item;
        }
        return total;
    }

    public int Short(int a) => a;

    public int Outer()
    {
        int Helper(int x)
        {
            var y = x * 2;
            y += 1;
            y += 2;
            return y;
        }
        return Helper(1);
    }
}
