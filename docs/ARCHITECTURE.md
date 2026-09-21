# ScoreForge architecture

ScoreForge is a score-keeping product. The **active implementation** is an Expo (React Native + TypeScript) app in [`mobile/`](../mobile/).

An earlier Avalonia/.NET prototype was removed from the tree; see git history if needed.

## Active stack (Expo)

```
mobile/
├── App.tsx                 # navigation shell
├── src/
│   ├── domain/             # models, templates, ScoreCalculator
│   ├── storage/            # AsyncStorage game store
│   ├── screens/            # Home, Setup, Board, Cribbage, Settings
│   └── components/         # CribbageBoard (SVG), FireworksOverlay
```

### Startup / navigation

React Navigation native stack:

- **Home** — list / resume / delete games
- **Setup** — pick template, players, target/holes
- **Board** — Free Play + Rounds / Rummy / Golf
- **Cribbage** — pegboard + quick scores + win fireworks
- **Settings** — notes / future theme options

### Domain

Ported from the Avalonia design: event-sourced `Game` + `ScoreEvent`s, template catalog, pure `calculate()` for standings and completion.

| Template | Mode | Win |
| --- | --- | --- |
| Free Play | Instant | Highest |
| Rounds | Rounds | Highest |
| Rummy | Rounds | First to target (500) |
| Golf | Rounds | Lowest after N holes |
| Cribbage | Instant pegging | First to 121 |

### Persistence

`AsyncStorage` key `scoreforge.games` — works in Expo Go, native builds, and web.

### Platforms

| Target | How |
| --- | --- |
| Web browser | `npm run web` in `mobile/` |
| Android / iOS (dev) | Expo Go + `npm start` |
| Stores | EAS Build later |

## Legacy Avalonia notes

The Avalonia solution (shared MVVM core, desktop file store, browser `localStorage`) lived in earlier commits on this branch and is no longer part of the working tree.
