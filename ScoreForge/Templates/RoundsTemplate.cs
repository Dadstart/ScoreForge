namespace ScoreForge.Templates;

public sealed class RoundsTemplate : IGameTemplate
{
    public string Id => "rounds";
    public string Name => "Rounds";
    public string Description => "Enter a score for each player every round. Highest total wins.";
    public ScoringMode ScoringMode => ScoringMode.Rounds;
    public WinCondition WinCondition => WinCondition.HighestTotal;
    public int? DefaultTargetScore => null;
    public int? DefaultMaxRounds => null;
    public int MinPlayers => 2;
    public int MaxPlayers => 12;
}
