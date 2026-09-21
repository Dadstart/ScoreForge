using System.Runtime.Versioning;
using System.Text.Json;
using ScoreForge.Models;
using ScoreForge.Services;

namespace ScoreForge.Browser;

[SupportedOSPlatform("browser")]
public sealed class BrowserLocalStorageGameStore : IGameStore
{
    private const string StorageKey = "scoreforge.games";

    public Task<IReadOnlyList<Game>> LoadAllAsync(CancellationToken cancellationToken = default)
    {
        var json = BrowserLocalStorage.GetItem(StorageKey);
        if (string.IsNullOrWhiteSpace(json))
            return Task.FromResult<IReadOnlyList<Game>>([]);

        var games = JsonSerializer.Deserialize(json, GameJsonContext.Default.ListGame) ?? [];
        return Task.FromResult<IReadOnlyList<Game>>(games);
    }

    public async Task SaveAsync(Game game, CancellationToken cancellationToken = default)
    {
        var games = (await LoadAllAsync(cancellationToken).ConfigureAwait(false)).ToList();
        var index = games.FindIndex(g => g.Id == game.Id);
        game.UpdatedAt = DateTimeOffset.UtcNow;
        if (index >= 0)
            games[index] = game;
        else
            games.Add(game);

        BrowserLocalStorage.SetItem(StorageKey, JsonSerializer.Serialize(games, GameJsonContext.Default.ListGame));
    }

    public async Task DeleteAsync(Guid gameId, CancellationToken cancellationToken = default)
    {
        var games = (await LoadAllAsync(cancellationToken).ConfigureAwait(false)).ToList();
        games.RemoveAll(g => g.Id == gameId);
        BrowserLocalStorage.SetItem(StorageKey, JsonSerializer.Serialize(games, GameJsonContext.Default.ListGame));
    }
}
