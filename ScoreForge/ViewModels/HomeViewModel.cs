using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ScoreForge.Models;
using ScoreForge.Templates;

namespace ScoreForge.ViewModels;

public partial class GameListItemViewModel : ViewModelBase
{
    public Guid Id { get; }
    public string Name { get; }
    public string TemplateName { get; }
    public string StatusText { get; }
    public string UpdatedText { get; }
    public Game Game { get; }

    public GameListItemViewModel(Game game)
    {
        Game = game;
        Id = game.Id;
        Name = string.IsNullOrWhiteSpace(game.Name) ? "Untitled game" : game.Name;
        TemplateName = GameTemplateCatalog.GetById(game.TemplateId)?.Name ?? game.TemplateId;
        StatusText = game.Status == GameStatus.Completed ? "Completed" : "In progress";
        UpdatedText = game.UpdatedAt.ToLocalTime().ToString("g");
    }
}

public partial class HomeViewModel : ViewModelBase
{
    private readonly MainViewModel _shell;

    [ObservableProperty]
    public partial bool IsBusy { get; set; }

    [ObservableProperty]
    public partial string? ErrorMessage { get; set; }

    public ObservableCollectionEx<GameListItemViewModel> Games { get; } = [];

    public HomeViewModel(MainViewModel shell)
    {
        _shell = shell;
        _ = LoadAsync();
    }

    [RelayCommand]
    private async Task LoadAsync()
    {
        IsBusy = true;
        ErrorMessage = null;
        try
        {
            var games = await AppServices.GameStore.LoadAllAsync().ConfigureAwait(true);
            Games.Clear();
            foreach (var game in games.OrderByDescending(g => g.UpdatedAt))
                Games.Add(new GameListItemViewModel(game));
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Could not load games: {ex.Message}";
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private void NewGame() => _shell.NavigateTo(new SetupViewModel(_shell));

    [RelayCommand]
    private void Resume(GameListItemViewModel? item)
    {
        if (item is null)
            return;
        _shell.NavigateTo(BoardNavigation.CreateBoard(_shell, item.Game));
    }

    [RelayCommand]
    private async Task DeleteAsync(GameListItemViewModel? item)
    {
        if (item is null)
            return;

        try
        {
            await AppServices.GameStore.DeleteAsync(item.Id).ConfigureAwait(true);
            Games.Remove(item);
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Could not delete game: {ex.Message}";
        }
    }
}
