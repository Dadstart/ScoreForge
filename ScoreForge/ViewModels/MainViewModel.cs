using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace ScoreForge.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    [ObservableProperty]
    public partial ViewModelBase CurrentPage { get; set; }

    public MainViewModel()
    {
        CurrentPage = new HomeViewModel(this);
    }

    public void NavigateTo(ViewModelBase page) => CurrentPage = page;

    [RelayCommand]
    private void GoHome() => NavigateTo(new HomeViewModel(this));

    [RelayCommand]
    private void GoSettings() => NavigateTo(new SettingsViewModel(this));

    [RelayCommand]
    private void NewGame() => NavigateTo(new SetupViewModel(this));
}
