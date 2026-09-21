using ScoreForge.Models;

namespace ScoreForge.Services;

public interface IGameStore
{
    Task<IReadOnlyList<Game>> LoadAllAsync(CancellationToken cancellationToken = default);
    Task SaveAsync(Game game, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid gameId, CancellationToken cancellationToken = default);
}
