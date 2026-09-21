# ScoreForge

Cross-platform score-keeping app. The active client is an **Expo (React Native + TypeScript)** app under [`mobile/`](mobile/).

## Run (Expo)

```bash
cd mobile
npm install
npm run web          # browser
npm start            # Expo Dev Tools — then press w / a / i, or scan with Expo Go
```

Phone testing: install **Expo Go**, run `npm start`, scan the QR code (same Wi‑Fi).

## Game templates

| Template | Scoring | Win condition |
| --- | --- | --- |
| Free Play | Instant +/− | Highest total |
| Rounds | Round entry | Highest total |
| Rummy | Round entry | First to target (default 500) |
| Golf | Holes as rounds | Lowest total after 9 or 18 holes |
| Cribbage | Peg board (front/rear pegs) | First to 121 (or 61) |

Games autosave in AsyncStorage (device / browser). Cribbage shows fireworks when someone wins.

## Project layout

- `mobile/` — **Expo app** (primary)
- `ScoreForge*`, `tests/` — previous Avalonia/.NET prototype (legacy; not required to run the app)
- `docs/ARCHITECTURE.md` — architecture notes

## Store builds (later)

Use [EAS Build](https://docs.expo.dev/build/introduction/) from `mobile/` when you are ready for App Store / Google Play.
