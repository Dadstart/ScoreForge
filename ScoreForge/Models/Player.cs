namespace ScoreForge.Models;

public sealed class Player
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
}
