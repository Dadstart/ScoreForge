namespace ScoreForge.Templates;

public sealed class CribbageTemplate : IGameTemplate
{
    public string Id => "cribbage";
    public string Name => "Cribbage";
    public string Description => "Peg around a traditional board. First to 121 (or 61) wins. Front and rear pegs track each hand.";
    public ScoringMode ScoringMode => ScoringMode.Instant;
    public WinCondition WinCondition => WinCondition.FirstToTarget;
    public int? DefaultTargetScore => 121;
    public int? DefaultMaxRounds => null;
    public int MinPlayers => 2;
    public int MaxPlayers => 3;
}
