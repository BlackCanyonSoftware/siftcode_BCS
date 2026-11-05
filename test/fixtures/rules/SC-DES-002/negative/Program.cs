using Microsoft.Extensions.DependencyInjection;

// The composition root: resolving the application's entry point here is how it is wired together.
public static class Program
{
    public static void Main()
    {
        var provider = BuildProvider();
        var app = provider.GetRequiredService<IApplication>();
        app.Run();
    }
}
