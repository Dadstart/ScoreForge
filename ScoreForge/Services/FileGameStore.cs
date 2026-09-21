using System.Text.Json;
using ScoreForge.Models;

namespace ScoreForge.Services;

public sealed class FileGameStore : IGameStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly string _filePath;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public FileGameStore(string? directory = null)
    {
        var root = directory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "ScoreForge");
        Directory.CreateDirectory(root);
        _filePath = Path.Combine(root, "games.json");
    }

    public async Task<IReadOnlyList<Game>> LoadAllAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!File.Exists(_filePath))
                return [];

            await using var stream = File.OpenRead(_filePath);
            var games = await JsonSerializer.DeserializeAsync<List<Game>>(stream, JsonOptions, cancellationToken)
                .ConfigureAwait(false);
            return games ?? [];
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task SaveAsync(Game game, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var games = await ReadUnlockedAsync(cancellationToken).ConfigureAwait(false);
            var index = games.FindIndex(g => g.Id == game.Id);
            game.UpdatedAt = DateTimeOffset.UtcNow;
            if (index >= 0)
                games[index] = game;
            else
                games.Add(game);

            await WriteUnlockedAsync(games, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task DeleteAsync(Guid gameId, CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var games = await ReadUnlockedAsync(cancellationToken).ConfigureAwait(false);
            games.RemoveAll(g => g.Id == gameId);
            await WriteUnlockedAsync(games, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<Game>> ReadUnlockedAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_filePath))
            return [];

        await using var stream = File.OpenRead(_filePath);
        var games = await JsonSerializer.DeserializeAsync<List<Game>>(stream, JsonOptions, cancellationToken)
            .ConfigureAwait(false);
        return games ?? [];
    }

    private async Task WriteUnlockedAsync(List<Game> games, CancellationToken cancellationToken)
    {
        await using var stream = File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, games, JsonOptions, cancellationToken).ConfigureAwait(false);
    }
}
