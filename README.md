# ScoreForge

Cross-platform score-keeping app. The active client is an **Expo (React Native + TypeScript)** app under [`mobile/`](mobile/).

## Run (Expo)

Pick **one** command (both start the same Metro server on port 5555):

```bash
cd mobile
npm install

# Browser only
npm run web

# OR Expo Dev Tools (then press w for web, or scan QR with Expo Go on a phone)
npm start
```

Do not run both at once — that causes “port in use.”

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
- `docs/ARCHITECTURE.md` — architecture notes

## CI

GitHub Actions runs `npm ci` and TypeScript checking in `mobile/` (see `.github/workflows/build.yml`).

## Store builds (later)

Use [EAS Build](https://docs.expo.dev/build/introduction/) from `mobile/` when you are ready for App Store / Google Play.
