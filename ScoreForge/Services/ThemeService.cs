using Avalonia;
using Avalonia.Styling;

namespace ScoreForge.Services;

public enum AppThemeMode
{
    System,
    Light,
    Dark
}

public static class ThemeService
{
    private static AppThemeMode _mode = AppThemeMode.System;

    public static AppThemeMode Mode
    {
        get => _mode;
        set
        {
            _mode = value;
            Apply();
        }
    }

    public static void Apply()
    {
        if (Application.Current is null)
            return;

        Application.Current.RequestedThemeVariant = _mode switch
        {
            AppThemeMode.Light => ThemeVariant.Light,
            AppThemeMode.Dark => ThemeVariant.Dark,
            _ => ThemeVariant.Default
        };
    }
}
