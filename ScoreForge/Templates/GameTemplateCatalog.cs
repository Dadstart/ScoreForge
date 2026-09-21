namespace ScoreForge.Templates;

public static class GameTemplateCatalog
{
    private static readonly IReadOnlyList<IGameTemplate> Templates =
    [
        new FreePlayTemplate(),
        new RoundsTemplate(),
        new RummyTemplate(),
        new GolfTemplate(),
        new CribbageTemplate()
    ];

    public static IReadOnlyList<IGameTemplate> All => Templates;

    public static IGameTemplate? GetById(string id) =>
        Templates.FirstOrDefault(t => string.Equals(t.Id, id, StringComparison.OrdinalIgnoreCase));
}
