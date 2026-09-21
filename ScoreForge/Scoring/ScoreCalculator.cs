using ScoreForge.Models;
using ScoreForge.Templates;

namespace ScoreForge.Scoring;

public sealed record PlayerStanding(
    Guid PlayerId,
    string PlayerName,
    int Total,
    int Rank,
    bool IsLeader,
    bool IsWinner);

public sealed record GameSnapshot(
    IReadOnlyList<PlayerStanding> Standings,
    int CurrentRound,
    bool IsComplete,
    string? WinnerName);

public static class ScoreCalculator
{
    public static GameSnapshot Calculate(Game game, IGameTemplate template)
    {
        var totals = game.Players.ToDictionary(
            p => p.Id,
            p => game.Events.Where(e => e.PlayerId == p.Id).Sum(e => e.Points));

        var currentRound = game.Events
            .Where(e => e.RoundNumber.HasValue)
            .Select(e => e.RoundNumber!.Value)
            .DefaultIfEmpty(0)
            .Max();

        var ordered = OrderPlayers(game.Players, totals, template.WinCondition);
        var isComplete = game.Status == GameStatus.Completed
            || DetectCompletion(game, template, totals, currentRound);

        var winnerIds = isComplete
            ? GetWinnerIds(ordered, totals, template, game)
            : [];

        var standings = ordered.Select((player, index) =>
        {
            var total = totals[player.Id];
            var isWinner = winnerIds.Contains(player.Id);
            var isLeader = index == 0 && ordered.Count > 0
                && totals[ordered[0].Id] == total;
            return new PlayerStanding(
                player.Id,
                player.Name,
                total,
                index + 1,
                isLeader && !isComplete,
                isWinner);
        }).ToList();

        var winnerName = standings.FirstOrDefault(s => s.IsWinner)?.PlayerName;

        return new GameSnapshot(standings, currentRound, isComplete, winnerName);
    }

    public static int NextRoundNumber(Game game)
    {
        var max = game.Events
            .Where(e => e.RoundNumber.HasValue)
            .Select(e => e.RoundNumber!.Value)
            .DefaultIfEmpty(0)
            .Max();
        return max + 1;
    }

    private static List<Player> OrderPlayers(
        IEnumerable<Player> players,
        IReadOnlyDictionary<Guid, int> totals,
        WinCondition winCondition)
    {
        var list = players.ToList();
        return winCondition switch
        {
            WinCondition.LowestTotal => list
                .OrderBy(p => totals[p.Id])
                .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .ToList(),
            _ => list
                .OrderByDescending(p => totals[p.Id])
                .ThenBy(p => p.Name, StringComparer.OrdinalIgnoreCase)
                .ToList()
        };
    }

    private static bool DetectCompletion(
        Game game,
        IGameTemplate template,
        IReadOnlyDictionary<Guid, int> totals,
        int currentRound)
    {
        if (template.WinCondition == WinCondition.FirstToTarget)
        {
            var target = game.TargetScore ?? template.DefaultTargetScore;
            if (target is int t && totals.Values.Any(v => v >= t))
                return true;
        }

        var maxRounds = game.MaxRounds ?? template.DefaultMaxRounds;
        if (maxRounds is int rounds && currentRound >= rounds)
            return true;

        return false;
    }

    private static HashSet<Guid> GetWinnerIds(
        IReadOnlyList<Player> ordered,
        IReadOnlyDictionary<Guid, int> totals,
        IGameTemplate template,
        Game game)
    {
        if (ordered.Count == 0)
            return [];

        if (template.WinCondition == WinCondition.FirstToTarget)
        {
            var target = game.TargetScore ?? template.DefaultTargetScore ?? int.MaxValue;
            var reached = ordered.Where(p => totals[p.Id] >= target).ToList();
            if (reached.Count == 0)
                return [];

            var best = reached.Max(p => totals[p.Id]);
            return reached.Where(p => totals[p.Id] == best).Select(p => p.Id).ToHashSet();
        }

        var winningTotal = totals[ordered[0].Id];
        return ordered.Where(p => totals[p.Id] == winningTotal).Select(p => p.Id).ToHashSet();
    }
}
