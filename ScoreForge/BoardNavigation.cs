using ScoreForge.Models;
using ScoreForge.ViewModels;

namespace ScoreForge;

public static class BoardNavigation
{
    public static ViewModelBase CreateBoard(MainViewModel shell, Game game) =>
        string.Equals(game.TemplateId, "cribbage", StringComparison.OrdinalIgnoreCase)
            ? new CribbageBoardViewModel(shell, game)
            : new BoardViewModel(shell, game);
}
