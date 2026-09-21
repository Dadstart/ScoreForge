namespace ScoreForge.Models;

public sealed class ScoreEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PlayerId { get; set; }
    public int Points { get; set; }
    public int? RoundNumber { get; set; }
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
}
