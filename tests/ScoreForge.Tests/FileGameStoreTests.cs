using ScoreForge.Models;
using ScoreForge.Services;
using Xunit;

namespace ScoreForge.Tests;

public class FileGameStoreTests
{
    [Fact]
    public async Task SaveLoadAndDelete_RoundTrip()
    {
        var dir = Path.Combine(Path.GetTempPath(), "ScoreForgeTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        try
        {
            var store = new FileGameStore(dir);
            var game = new Game
            {
                Name = "Test Match",
                TemplateId = "rounds",
                Players = [new Player { Name = "A" }, new Player { Name = "B" }]
            };

            await store.SaveAsync(game);
            var loaded = await store.LoadAllAsync();
            Assert.Single(loaded);
            Assert.Equal("Test Match", loaded[0].Name);

            await store.DeleteAsync(game.Id);
            loaded = await store.LoadAllAsync();
            Assert.Empty(loaded);
        }
        finally
        {
            if (Directory.Exists(dir))
                Directory.Delete(dir, recursive: true);
        }
    }
}
