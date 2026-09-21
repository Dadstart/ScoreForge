namespace ScoreForge.Templates;

public sealed class FreePlayTemplate : IGameTemplate
{
    public string Id => "free-play";
    public string Name => "Free Play";
    public string Description => "Tap +/− to change scores instantly. No target or rounds.";
    public ScoringMode ScoringMode => ScoringMode.Instant;
    public WinCondition WinCondition => WinCondition.HighestTotal;
    public int? DefaultTargetScore => null;
    public int? DefaultMaxRounds => null;
    public int MinPlayers => 1;
    public int MaxPlayers => 12;
}
