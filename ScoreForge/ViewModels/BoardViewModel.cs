using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using ScoreForge.Models;
using ScoreForge.Scoring;
using ScoreForge.Templates;

namespace ScoreForge.ViewModels;

public partial class StandingViewModel : ViewModelBase
{
    public Guid PlayerId { get; }
    public string Name { get; }
    public int Total { get; }
    public int Rank { get; }
    public bool IsLeader { get; }
    public bool IsWinner { get; }

    public StandingViewModel(PlayerStanding standing)
    {
        PlayerId = standing.PlayerId;
        Name = standing.PlayerName;
        Total = standing.Total;
        Rank = standing.Rank;
        IsLeader = standing.IsLeader;
        IsWinner = standing.IsWinner;
    }
}

public partial class RoundScoreEntryViewModel : ViewModelBase
{
    public Guid PlayerId { get; }
    public string PlayerName { get; }

    [ObservableProperty]
    public partial string ScoreText { get; set; } = "0";

    public RoundScoreEntryViewModel(Player player)
    {
        PlayerId = player.Id;
        PlayerName = player.Name;
    }

    public bool TryGetScore(out int score)
    {
        return int.TryParse(ScoreText, out score);
    }
}

public partial class RoundRowViewModel : ViewModelBase
{
    public int RoundNumber { get; }
    public IReadOnlyList<int?> Scores { get; }

    public RoundRowViewModel(int roundNumber, IReadOnlyList<int?> scores)
    {
        RoundNumber = roundNumber;
        Scores = scores;
    }
}

public partial class BoardViewModel : ViewModelBase
{
    private readonly MainViewModel _shell;
    private readonly Game _game;
    private readonly IGameTemplate _template;

    [ObservableProperty]
    public partial string Title { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string TemplateName { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string StatusBanner { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool IsInstantMode { get; set; }

    [ObservableProperty]
    public partial bool IsRoundsMode { get; set; }

    [ObservableProperty]
    public partial bool IsComplete { get; set; }

    [ObservableProperty]
    public partial bool IsEnteringRound { get; set; }

    [ObservableProperty]
    public partial string? ErrorMessage { get; set; }

    [ObservableProperty]
    public partial int CurrentRound { get; set; }

    public ObservableCollectionEx<StandingViewModel> Standings { get; } = [];
    public ObservableCollectionEx<RoundRowViewModel> RoundRows { get; } = [];
    public ObservableCollectionEx<RoundScoreEntryViewModel> RoundEntries { get; } = [];
    public ObservableCollectionEx<string> PlayerHeaders { get; } = [];

    public BoardViewModel(MainViewModel shell, Game game)
    {
        _shell = shell;
        _game = game;
        _template = GameTemplateCatalog.GetById(game.TemplateId)
            ?? throw new InvalidOperationException($"Unknown template '{game.TemplateId}'.");

        Title = game.Name;
        TemplateName = _template.Name;
        IsInstantMode = _template.ScoringMode == ScoringMode.Instant;
        IsRoundsMode = _template.ScoringMode == ScoringMode.Rounds;
        Refresh();
    }

    private void Refresh()
    {
        var snapshot = ScoreCalculator.Calculate(_game, _template);
        CurrentRound = snapshot.CurrentRound;
        IsComplete = snapshot.IsComplete;

        if (snapshot.IsComplete && _game.Status != GameStatus.Completed)
            _game.Status = GameStatus.Completed;

        Standings.Reset(snapshot.Standings.Select(s => new StandingViewModel(s)));
        PlayerHeaders.Reset(_game.Players.Select(p => p.Name));

        if (IsRoundsMode)
            RebuildRoundRows();

        StatusBanner = snapshot.IsComplete
            ? (snapshot.WinnerName is null
                ? "Game complete"
                : $"Winner: {snapshot.WinnerName}")
            : _template.WinCondition switch
            {
                WinCondition.FirstToTarget =>
                    $"First to {_game.TargetScore ?? _template.DefaultTargetScore} · Round {snapshot.CurrentRound}",
                WinCondition.LowestTotal when _game.MaxRounds is int holes =>
                    $"Hole {snapshot.CurrentRound} of {holes} · Lowest wins",
                WinCondition.LowestTotal => $"Round {snapshot.CurrentRound} · Lowest wins",
                _ => $"Round {snapshot.CurrentRound} · Highest wins"
            };

        if (IsInstantMode && !snapshot.IsComplete)
            StatusBanner = "Tap +/− to update scores";

        UndoLastCommand.NotifyCanExecuteChanged();
        BeginRoundCommand.NotifyCanExecuteChanged();
        AdjustScoreCommand.NotifyCanExecuteChanged();
        IncrementCommand.NotifyCanExecuteChanged();
        DecrementCommand.NotifyCanExecuteChanged();
    }

    private void RebuildRoundRows()
    {
        var maxRound = _game.Events
            .Where(e => e.RoundNumber.HasValue)
            .Select(e => e.RoundNumber!.Value)
            .DefaultIfEmpty(0)
            .Max();

        var rows = new List<RoundRowViewModel>();
        for (var round = 1; round <= maxRound; round++)
        {
            var scores = _game.Players.Select(player =>
            {
                var evt = _game.Events.FirstOrDefault(e =>
                    e.PlayerId == player.Id && e.RoundNumber == round);
                return evt is null ? (int?)null : evt.Points;
            }).ToList();
            rows.Add(new RoundRowViewModel(round, scores));
        }

        RoundRows.Reset(rows);
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

    private bool CanAdjustScore() => IsInstantMode && !IsComplete;

    [RelayCommand(CanExecute = nameof(CanAdjustScore))]
    private async Task AdjustScoreAsync((Guid PlayerId, int Delta) args)
    {
        if (!CanAdjustScore())
            return;

        _game.Events.Add(new ScoreEvent
        {
            PlayerId = args.PlayerId,
            Points = args.Delta
        });
        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    // Convenience wrappers for XAML CommandParameter patterns
    [RelayCommand(CanExecute = nameof(CanAdjustScore))]
    private async Task IncrementAsync(StandingViewModel? standing)
    {
        if (standing is null)
            return;
        await AdjustScoreAsync((standing.PlayerId, 1)).ConfigureAwait(true);
    }

    [RelayCommand(CanExecute = nameof(CanAdjustScore))]
    private async Task DecrementAsync(StandingViewModel? standing)
    {
        if (standing is null)
            return;
        await AdjustScoreAsync((standing.PlayerId, -1)).ConfigureAwait(true);
    }

    private bool CanBeginRound() => IsRoundsMode && !IsComplete && !IsEnteringRound;

    [RelayCommand(CanExecute = nameof(CanBeginRound))]
    private void BeginRound()
    {
        RoundEntries.Reset(_game.Players.Select(p => new RoundScoreEntryViewModel(p)));
        IsEnteringRound = true;
        SubmitRoundCommand.NotifyCanExecuteChanged();
        CancelRoundCommand.NotifyCanExecuteChanged();
        BeginRoundCommand.NotifyCanExecuteChanged();
    }

    [RelayCommand]
    private void CancelRound()
    {
        IsEnteringRound = false;
        RoundEntries.Clear();
        BeginRoundCommand.NotifyCanExecuteChanged();
    }

    [RelayCommand]
    private async Task SubmitRoundAsync()
    {
        if (!IsEnteringRound)
            return;

        var scores = new List<(Guid PlayerId, int Points)>();
        foreach (var entry in RoundEntries)
        {
            if (!entry.TryGetScore(out var score))
            {
                ErrorMessage = $"Invalid score for {entry.PlayerName}.";
                return;
            }

            scores.Add((entry.PlayerId, score));
        }

        var round = ScoreCalculator.NextRoundNumber(_game);
        foreach (var (playerId, points) in scores)
        {
            _game.Events.Add(new ScoreEvent
            {
                PlayerId = playerId,
                Points = points,
                RoundNumber = round
            });
        }

        IsEnteringRound = false;
        RoundEntries.Clear();
        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    private bool CanUndo() => _game.Events.Count > 0 && !IsEnteringRound;

    [RelayCommand(CanExecute = nameof(CanUndo))]
    private async Task UndoLastAsync()
    {
        if (_game.Events.Count == 0)
            return;

        if (IsRoundsMode)
        {
            var lastRound = _game.Events
                .Where(e => e.RoundNumber.HasValue)
                .Select(e => e.RoundNumber!.Value)
                .DefaultIfEmpty(0)
                .Max();
            if (lastRound > 0)
                _game.Events.RemoveAll(e => e.RoundNumber == lastRound);
            else if (_game.Events.Count > 0)
                _game.Events.RemoveAt(_game.Events.Count - 1);
        }
        else
        {
            _game.Events.RemoveAt(_game.Events.Count - 1);
        }

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
        IsEnteringRound = false;
        RoundEntries.Clear();
        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task MarkCompleteAsync()
    {
        _game.Status = GameStatus.Completed;
        Refresh();
        await PersistAsync().ConfigureAwait(true);
    }

    [RelayCommand]
    private void BackHome() => _shell.NavigateTo(new HomeViewModel(_shell));
}
