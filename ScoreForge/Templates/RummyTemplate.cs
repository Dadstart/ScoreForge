namespace ScoreForge.Templates;

public sealed class RummyTemplate : IGameTemplate
{
    public string Id => "rummy";
    public string Name => "Rummy";
    public string Description => "Round-based scoring. First player to reach the target (default 500) wins.";
    public ScoringMode ScoringMode => ScoringMode.Rounds;
    public WinCondition WinCondition => WinCondition.FirstToTarget;
    public int? DefaultTargetScore => 500;
    public int? DefaultMaxRounds => null;
    public int MinPlayers => 2;
    public int MaxPlayers => 6;
}
