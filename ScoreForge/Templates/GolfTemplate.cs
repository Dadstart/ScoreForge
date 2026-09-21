namespace ScoreForge.Templates;

public sealed class GolfTemplate : IGameTemplate
{
    public string Id => "golf";
    public string Name => "Golf";
    public string Description => "Score each hole as a round. Lowest total after 9 or 18 holes wins.";
    public ScoringMode ScoringMode => ScoringMode.Rounds;
    public WinCondition WinCondition => WinCondition.LowestTotal;
    public int? DefaultTargetScore => null;
    public int? DefaultMaxRounds => 18;
    public int MinPlayers => 1;
    public int MaxPlayers => 8;
}
