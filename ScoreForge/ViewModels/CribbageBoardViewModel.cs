using Avalonia.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ScoreForge.Models;
using ScoreForge.Scoring;
using ScoreForge.Templates;

namespace ScoreForge.ViewModels;

public partial class CribbagePlayerViewModel : ViewModelBase
{
    public Guid PlayerId { get; }
    public string Name { get; }
    public IBrush PegBrush { get; }
    public Color PegColor { get; }
    public int TrackIndex { get; }

    [ObservableProperty]
    public partial int FrontPeg { get; set; }

    [ObservableProperty]
    public partial int RearPeg { get; set; }

    [ObservableProperty]
    public partial int Total { get; set; }

    [ObservableProperty]
    public partial bool IsSelected { get; set; }

    [ObservableProperty]
    public partial bool IsWinner { get; set; }

    public CribbagePlayerViewModel(Guid playerId, string name, Color pegColor, int trackIndex)
    {
        PlayerId = playerId;
        Name = name;
        PegColor = pegColor;
        PegBrush = new SolidColorBrush(pegColor);
        TrackIndex = trackIndex;
    }
}

public partial class CribbageBoardViewModel : ViewModelBase
{
    private static readonly Color[] PegPalette =
    [
        Color.FromRgb(236, 232, 220), // ivory
        Color.FromRgb(196, 48, 43),   // red
        Color.FromRgb(46, 110, 180)   // blue
    ];

    private readonly MainViewModel _shell;
    private readonly Game _game;
    private readonly IGameTemplate _template;

    [ObservableProperty]
    public partial string Title { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string StatusBanner { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool IsComplete { get; set; }

    [ObservableProperty]
    public partial bool ShowCelebration { get; set; }

    [ObservableProperty]
    public partial string? WinnerName { get; set; }

    [ObservableProperty]
    public partial string? ErrorMessage { get; set; }

    [ObservableProperty]
    public partial int TargetScore { get; set; } = 121;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(PegPointsCommand))]
    public partial CribbagePlayerViewModel? SelectedPlayer { get; set; }

    public ObservableCollectionEx<CribbagePlayerViewModel> Players { get; } = [];

    public IReadOnlyList<int> QuickScores { get; } = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16];

    public CribbageBoardViewModel(MainViewModel shell, Game game)
    {
        _shell = shell;
        _game = game;
        _template = GameTemplateCatalog.GetById(game.TemplateId)
            ?? throw new InvalidOperationException($"Unknown template '{game.TemplateId}'.");

        Title = game.Name;
        TargetScore = game.TargetScore ?? _template.DefaultTargetScore ?? 121;

        for (var i = 0; i < game.Players.Count; i++)
        {
            var player = game.Players[i];
            Players.Add(new CribbagePlayerViewModel(
                player.Id,
                player.Name,
                PegPalette[i % PegPalette.Length],
                i));
        }

        SelectedPlayer = Players.FirstOrDefault();
        if (SelectedPlayer is not null)
            SelectedPlayer.IsSelected = true;

        Refresh(allowCelebration: false);
    }

    partial void OnSelectedPlayerChanged(CribbagePlayerViewModel? oldValue, CribbagePlayerViewModel? newValue)
    {
        if (oldValue is not null)
            oldValue.IsSelected = false;
        if (newValue is not null)
            newValue.IsSelected = true;
    }

    private void Refresh(bool allowCelebration = true)
    {
        var wasComplete = IsComplete;
        var snapshot = ScoreCalculator.Calculate(_game, _template);
        IsComplete = snapshot.IsComplete;
        WinnerName = snapshot.WinnerName;

        if (snapshot.IsComplete && _game.Status != GameStatus.Completed)
            _game.Status = GameStatus.Completed;

        foreach (var playerVm in Players)
        {
            var events = _game.Events.Where(e => e.PlayerId == playerVm.PlayerId).ToList();
            var total = events.Sum(e => e.Points);
            var previous = events.Count <= 1
                ? 0
                : events.Take(events.Count - 1).Sum(e => e.Points);

            playerVm.Total = total;
            playerVm.FrontPeg = Math.Clamp(total, 0, TargetScore);
            playerVm.RearPeg = Math.Clamp(previous, 0, TargetScore);
            playerVm.IsWinner = snapshot.Standings.Any(s => s.PlayerId == playerVm.PlayerId && s.IsWinner);
        }

        StatusBanner = snapshot.IsComplete
            ? (snapshot.WinnerName is null ? "Game complete" : $"{snapshot.WinnerName} wins!")
            : $"Race to {TargetScore} · Select a player and peg points";

        // Celebrate when a game newly reaches a win (not when resuming an already-finished game).
        if (allowCelebration && snapshot.IsComplete && !wasComplete && snapshot.WinnerName is not null)
            ShowCelebration = true;
        else if (!snapshot.IsComplete)
            ShowCelebration = false;

        PegPointsCommand.NotifyCanExecuteChanged();
        UndoLastCommand.NotifyCanExecuteChanged();
    }

    private async Task PersistAsync()
    {
        try
        {
            await AppServices.GameStore.SaveAsync(_game).ConfigureAwait(true);
            ErrorMessage = null;
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Autosave failed: {ex.Message}";
        }
    }

    [RelayCommand]
    private void SelectPlayer(CribbagePlayerViewModel? player)
    {
        if (player is null)
            return;
        SelectedPlayer = player;
    }

    private bool CanPegPoints() => !IsComplete && SelectedPlayer is not null;

    [RelayCommand(CanExecute = nameof(CanPegPoints))]
    private async Task PegPointsAsync(int points)
    {
        if (!CanPegPoints() || SelectedPlayer is null || points == 0)
            return;

        var next = SelectedPlayer.Total + points;
        if (next < 0)
            points = -SelectedPlayer.Total;
        if (points == 0)
            return;

        _game.Events.Add(new ScoreEvent
        {
            PlayerId = SelectedPlayer.PlayerId,
            Points = points
        });

        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    private bool CanUndo() => _game.Events.Count > 0;

    [RelayCommand(CanExecute = nameof(CanUndo))]
    private async Task UndoLastAsync()
    {
        if (_game.Events.Count == 0)
            return;

        _game.Events.RemoveAt(_game.Events.Count - 1);

        if (_game.Status == GameStatus.Completed)
        {
            var snapshot = ScoreCalculator.Calculate(_game, _template);
            if (!snapshot.IsComplete)
                _game.Status = GameStatus.InProgress;
        }

        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task ResetScoresAsync()
    {
        _game.Events.Clear();
        _game.Status = GameStatus.InProgress;
        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    [RelayCommand]
    private void DismissCelebration() => ShowCelebration = false;

    [RelayCommand]
    private void BackHome() => _shell.NavigateTo(new HomeViewModel(_shell));
}
