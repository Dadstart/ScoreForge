using ScoreForge.Services;
using ScoreForge.ViewModels;

namespace ScoreForge;

public static class AppServices
{
    public static IGameStore GameStore { get; private set; } = new InMemoryGameStore();
    public static MainViewModel? Shell { get; set; }

    public static void Configure(IGameStore gameStore)
    {
        GameStore = gameStore;
    }
}
