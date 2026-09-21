using System.Text.Json.Serialization;
using ScoreForge.Models;

namespace ScoreForge.Browser;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(List<Game>))]
[JsonSerializable(typeof(Game))]
internal partial class GameJsonContext : JsonSerializerContext;
