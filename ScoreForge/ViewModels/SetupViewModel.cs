using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ScoreForge.Models;
using ScoreForge.Templates;

namespace ScoreForge.ViewModels;

public partial class SetupPlayerViewModel : ViewModelBase
{
    [ObservableProperty]
    public partial string Name { get; set; } = string.Empty;
}

public partial class SetupViewModel : ViewModelBase
{
    private readonly MainViewModel _shell;

    public IReadOnlyList<IGameTemplate> Templates { get; } = GameTemplateCatalog.All;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(StartGameCommand))]
    public partial IGameTemplate? SelectedTemplate { get; set; }

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(StartGameCommand))]
    public partial string GameName { get; set; } = string.Empty;

    [ObservableProperty]
    public partial decimal? TargetScore { get; set; }

    [ObservableProperty]
    public partial decimal MaxRounds { get; set; } = 18;

    [ObservableProperty]
    public partial bool ShowTargetScore { get; set; }

    [ObservableProperty]
    public partial bool ShowMaxRounds { get; set; }

    [ObservableProperty]
    public partial string? ValidationMessage { get; set; }

    public ObservableCollectionEx<SetupPlayerViewModel> Players { get; } = [];

    public SetupViewModel(MainViewModel shell)
    {
        _shell = shell;
        SelectedTemplate = Templates[0];
        Players.Add(new SetupPlayerViewModel { Name = "Player 1" });
        Players.Add(new SetupPlayerViewModel { Name = "Player 2" });
        ApplyTemplateDefaults();
    }

    partial void OnSelectedTemplateChanged(IGameTemplate? value) => ApplyTemplateDefaults();

    private void ApplyTemplateDefaults()
    {
        if (SelectedTemplate is null)
            return;

        ShowTargetScore = SelectedTemplate.WinCondition == WinCondition.FirstToTarget
            || SelectedTemplate.DefaultTargetScore.HasValue;
        ShowMaxRounds = SelectedTemplate.Id == "golf"
            || SelectedTemplate.DefaultMaxRounds.HasValue;
        TargetScore = SelectedTemplate.DefaultTargetScore;
        MaxRounds = SelectedTemplate.DefaultMaxRounds ?? 18;

        if (string.IsNullOrWhiteSpace(GameName))
            GameName = SelectedTemplate.Name;
    }

    [RelayCommand]
    private void AddPlayer()
    {
        if (SelectedTemplate is null)
            return;
        if (Players.Count >= SelectedTemplate.MaxPlayers)
        {
            ValidationMessage = $"This template allows at most {SelectedTemplate.MaxPlayers} players.";
            return;
        }

        Players.Add(new SetupPlayerViewModel { Name = $"Player {Players.Count + 1}" });
        ValidationMessage = null;
        StartGameCommand.NotifyCanExecuteChanged();
    }

    [RelayCommand]
    private void RemovePlayer(SetupPlayerViewModel? player)
    {
        if (player is null || Players.Count <= 1)
            return;
        Players.Remove(player);
        ValidationMessage = null;
        StartGameCommand.NotifyCanExecuteChanged();
    }

    [RelayCommand]
    private void Cancel() => _shell.NavigateTo(new HomeViewModel(_shell));

    private bool CanStartGame()
    {
        if (SelectedTemplate is null)
            return false;
        if (Players.Count < SelectedTemplate.MinPlayers || Players.Count > SelectedTemplate.MaxPlayers)
            return false;
        if (Players.Any(p => string.IsNullOrWhiteSpace(p.Name)))
            return false;
        return true;
    }

    [RelayCommand(CanExecute = nameof(CanStartGame))]
    private async Task StartGameAsync()
    {
        if (SelectedTemplate is null)
            return;

        if (Players.Count < SelectedTemplate.MinPlayers)
        {
            ValidationMessage = $"Add at least {SelectedTemplate.MinPlayers} players.";
            return;
        }

        var game = new Game
        {
            Name = string.IsNullOrWhiteSpace(GameName) ? SelectedTemplate.Name : GameName.Trim(),
            TemplateId = SelectedTemplate.Id,
            Players = Players
                .Where(p => !string.IsNullOrWhiteSpace(p.Name))
                .Select(p => new Player { Name = p.Name.Trim() })
                .ToList(),
            TargetScore = ShowTargetScore && TargetScore is decimal target
                ? (int)target
                : null,
            MaxRounds = ShowMaxRounds ? (int)MaxRounds : null
        };

        try
        {
            await AppServices.GameStore.SaveAsync(game).ConfigureAwait(true);
            _shell.NavigateTo(BoardNavigation.CreateBoard(_shell, game));
        }
        catch (Exception ex)
        {
            ValidationMessage = $"Could not save game: {ex.Message}";
        }
    }
}
