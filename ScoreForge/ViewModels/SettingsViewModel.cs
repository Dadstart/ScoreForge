using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ScoreForge.Services;

namespace ScoreForge.ViewModels;

public partial class SettingsViewModel : ViewModelBase
{
    private readonly MainViewModel _shell;

    [ObservableProperty]
    public partial AppThemeMode SelectedTheme { get; set; }

    public IReadOnlyList<AppThemeMode> Themes { get; } =
    [
        AppThemeMode.System,
        AppThemeMode.Light,
        AppThemeMode.Dark
    ];

    public SettingsViewModel(MainViewModel shell)
    {
        _shell = shell;
        SelectedTheme = ThemeService.Mode;
    }

    partial void OnSelectedThemeChanged(AppThemeMode value)
    {
        ThemeService.Mode = value;
    }

    [RelayCommand]
    private void Back() => _shell.NavigateTo(new HomeViewModel(_shell));
}
