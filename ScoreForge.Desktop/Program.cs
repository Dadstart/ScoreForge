using System;
using Avalonia;
using ScoreForge.Services;

namespace ScoreForge.Desktop;

sealed class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        AppServices.Configure(new FileGameStore());
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .WithInterFont()
            .LogToTrace();
}
