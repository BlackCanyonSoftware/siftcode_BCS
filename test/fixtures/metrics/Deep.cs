public class Nest
{
    public int Deep(bool a, int[] b, bool c)
    {
        if (a)
        {
            foreach (var x in b)
            {
                while (x > 0)
                {
                    if (c)
                    {
                        return x;
                    }
                }
            }
        }
        return 0;
    }
}
