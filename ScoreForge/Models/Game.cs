namespace ScoreForge.Models;

public sealed class Game
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string TemplateId { get; set; } = string.Empty;
    public List<Player> Players { get; set; } = [];
    public List<ScoreEvent> Events { get; set; } = [];
    public GameStatus Status { get; set; } = GameStatus.InProgress;
    public int? TargetScore { get; set; }
    public int? MaxRounds { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
