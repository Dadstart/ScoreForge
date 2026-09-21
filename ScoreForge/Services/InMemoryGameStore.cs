using ScoreForge.Models;

namespace ScoreForge.Services;

/// <summary>
/// Fallback store used before platform hosts register a real implementation (e.g. designer).
/// </summary>
public sealed class InMemoryGameStore : IGameStore
{
    private readonly List<Game> _games = [];
    private readonly object _lock = new();

    public Task<IReadOnlyList<Game>> LoadAllAsync(CancellationToken cancellationToken = default)
    {
        lock (_lock)
            return Task.FromResult<IReadOnlyList<Game>>(_games.Select(Clone).ToList());
    }

    public Task SaveAsync(Game game, CancellationToken cancellationToken = default)
    {
        lock (_lock)
        {
            var index = _games.FindIndex(g => g.Id == game.Id);
            var copy = Clone(game);
            copy.UpdatedAt = DateTimeOffset.UtcNow;
            if (index >= 0)
                _games[index] = copy;
            else
                _games.Add(copy);
        }

        return Task.CompletedTask;
    }

    public Task DeleteAsync(Guid gameId, CancellationToken cancellationToken = default)
    {
        lock (_lock)
            _games.RemoveAll(g => g.Id == gameId);
        return Task.CompletedTask;
    }

    private static Game Clone(Game game) => new()
    {
        Id = game.Id,
        Name = game.Name,
        TemplateId = game.TemplateId,
        Players = game.Players.Select(p => new Player { Id = p.Id, Name = p.Name }).ToList(),
        Events = game.Events.Select(e => new ScoreEvent
        {
            Id = e.Id,
            PlayerId = e.PlayerId,
            Points = e.Points,
            RoundNumber = e.RoundNumber,
            Timestamp = e.Timestamp
        }).ToList(),
        Status = game.Status,
        TargetScore = game.TargetScore,
        MaxRounds = game.MaxRounds,
        CreatedAt = game.CreatedAt,
        UpdatedAt = game.UpdatedAt
    };
}
