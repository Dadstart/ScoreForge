using ScoreForge.Models;
using ScoreForge.Scoring;
using ScoreForge.Templates;
using Xunit;

namespace ScoreForge.Tests;

public class ScoreCalculatorTests
{
    [Fact]
    public void FreePlay_SumsInstantDeltas()
    {
        var template = new FreePlayTemplate();
        var alice = new Player { Name = "Alice" };
        var bob = new Player { Name = "Bob" };
        var game = new Game
        {
            TemplateId = template.Id,
            Players = [alice, bob],
            Events =
            [
                new ScoreEvent { PlayerId = alice.Id, Points = 1 },
                new ScoreEvent { PlayerId = alice.Id, Points = 1 },
                new ScoreEvent { PlayerId = bob.Id, Points = -1 },
                new ScoreEvent { PlayerId = bob.Id, Points = 5 }
            ]
        };

        var snapshot = ScoreCalculator.Calculate(game, template);

        Assert.Equal(2, snapshot.Standings.First(s => s.PlayerName == "Alice").Total);
        Assert.Equal(4, snapshot.Standings.First(s => s.PlayerName == "Bob").Total);
        Assert.Equal("Bob", snapshot.Standings[0].PlayerName);
        Assert.False(snapshot.IsComplete);
    }

    [Fact]
    public void Rounds_TracksRoundTotalsAndNextRound()
    {
        var template = new RoundsTemplate();
        var alice = new Player { Name = "Alice" };
        var bob = new Player { Name = "Bob" };
        var game = new Game
        {
            TemplateId = template.Id,
            Players = [alice, bob],
            Events =
            [
                new ScoreEvent { PlayerId = alice.Id, Points = 10, RoundNumber = 1 },
                new ScoreEvent { PlayerId = bob.Id, Points = 7, RoundNumber = 1 },
                new ScoreEvent { PlayerId = alice.Id, Points = 3, RoundNumber = 2 },
                new ScoreEvent { PlayerId = bob.Id, Points = 12, RoundNumber = 2 }
            ]
        };

        var snapshot = ScoreCalculator.Calculate(game, template);

        Assert.Equal(2, snapshot.CurrentRound);
        Assert.Equal(13, snapshot.Standings.First(s => s.PlayerName == "Alice").Total);
        Assert.Equal(19, snapshot.Standings.First(s => s.PlayerName == "Bob").Total);
        Assert.Equal(3, ScoreCalculator.NextRoundNumber(game));
    }

    [Fact]
    public void Rummy_CompletesWhenTargetReached()
    {
        var template = new RummyTemplate();
        var alice = new Player { Name = "Alice" };
        var bob = new Player { Name = "Bob" };
        var game = new Game
        {
            TemplateId = template.Id,
            Players = [alice, bob],
            TargetScore = 500,
            Events =
            [
                new ScoreEvent { PlayerId = alice.Id, Points = 200, RoundNumber = 1 },
                new ScoreEvent { PlayerId = bob.Id, Points = 100, RoundNumber = 1 },
                new ScoreEvent { PlayerId = alice.Id, Points = 300, RoundNumber = 2 },
                new ScoreEvent { PlayerId = bob.Id, Points = 50, RoundNumber = 2 }
            ]
        };

        var snapshot = ScoreCalculator.Calculate(game, template);

        Assert.True(snapshot.IsComplete);
        Assert.Equal("Alice", snapshot.WinnerName);
        Assert.Contains(snapshot.Standings, s => s.PlayerName == "Alice" && s.IsWinner);
    }

    [Fact]
    public void Golf_LowestWinsAfterMaxRounds()
    {
        var template = new GolfTemplate();
        var alice = new Player { Name = "Alice" };
        var bob = new Player { Name = "Bob" };
        var game = new Game
        {
            TemplateId = template.Id,
            Players = [alice, bob],
            MaxRounds = 2,
            Events =
            [
                new ScoreEvent { PlayerId = alice.Id, Points = 4, RoundNumber = 1 },
                new ScoreEvent { PlayerId = bob.Id, Points = 5, RoundNumber = 1 },
                new ScoreEvent { PlayerId = alice.Id, Points = 3, RoundNumber = 2 },
                new ScoreEvent { PlayerId = bob.Id, Points = 4, RoundNumber = 2 }
            ]
        };

        var snapshot = ScoreCalculator.Calculate(game, template);

        Assert.True(snapshot.IsComplete);
        Assert.Equal("Alice", snapshot.WinnerName);
        Assert.Equal(7, snapshot.Standings.First(s => s.IsWinner).Total);
    }

    [Fact]
    public void Catalog_ContainsExpectedTemplates()
    {
        Assert.Equal(4, GameTemplateCatalog.All.Count);
        Assert.NotNull(GameTemplateCatalog.GetById("free-play"));
        Assert.NotNull(GameTemplateCatalog.GetById("rounds"));
        Assert.NotNull(GameTemplateCatalog.GetById("rummy"));
        Assert.NotNull(GameTemplateCatalog.GetById("golf"));
    }
}
