using System.Runtime.Versioning;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Browser;
using ScoreForge;
using ScoreForge.Browser;

internal sealed partial class Program
{
    private static Task Main(string[] args)
    {
        AppServices.Configure(new BrowserLocalStorageGameStore());
        return BuildAvaloniaApp()
            .WithInterFont()
            .StartBrowserAppAsync("out");
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>();
}
