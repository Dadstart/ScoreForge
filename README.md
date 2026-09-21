# ScoreForge

Cross-platform score-keeping app built with [Avalonia](https://avaloniaui.net/) 12 and .NET 10.

## Platforms

- **Desktop** — Windows, macOS, and Linux
- **Browser** — WebAssembly (WASM)

## Game templates

| Template | Scoring | Win condition |
| --- | --- | --- |
| Free Play | Instant +/− | Highest total |
| Rounds | Round entry | Highest total |
| Rummy | Round entry | First to target (default 500) |
| Golf | Holes as rounds | Lowest total after 9 or 18 holes |

Games autosave locally (AppData JSON on desktop, `localStorage` in the browser). Undo, reset, and mark-complete are available on the scoreboard.

## Prerequisites

- .NET SDK 10.0 (see `global.json`)
- For browser: `dotnet workload install wasm-tools` (links Skia into the WASM build)

## Run

```bash
# Desktop
dotnet run --project ScoreForge.Desktop

# Browser (opens a local WASM host)
# Requires: dotnet workload install wasm-tools
dotnet run --project ScoreForge.Browser
```

If the browser stays on the “Powered by Avalonia” splash, install the WASM workload, clean, and rebuild:

```bash
dotnet workload install wasm-tools
dotnet clean ScoreForge.Browser/ScoreForge.Browser.csproj
dotnet run --project ScoreForge.Browser
```

## Test

```bash
dotnet test
```

## Solution layout

- `ScoreForge/` — shared UI, view models, domain, and scoring engine
- `ScoreForge.Desktop/` — desktop host + file store
- `ScoreForge.Browser/` — browser host + localStorage store
- `tests/ScoreForge.Tests/` — scoring and persistence tests
