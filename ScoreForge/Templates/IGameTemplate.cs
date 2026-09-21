namespace ScoreForge.Templates;

public interface IGameTemplate
{
    string Id { get; }
    string Name { get; }
    string Description { get; }
    ScoringMode ScoringMode { get; }
    WinCondition WinCondition { get; }
    int? DefaultTargetScore { get; }
    int? DefaultMaxRounds { get; }
    int MinPlayers { get; }
    int MaxPlayers { get; }
}
