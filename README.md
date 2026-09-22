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

## How play works

1. **New Game** — pick a template, enter **your name**, start alone.
2. Share the **code** or **QR** shown on Home / the board.
3. Guests use **Join with code** (or scan the QR) with their display name.
4. Each device only scores **that player’s** points (matched by display name).

Deep link: `scoreforge://join?code=XXXXXX` (Expo Go uses the Expo URL equivalent).

Games autosave in AsyncStorage on this device/browser. **Cross-device sync is not wired yet** — join currently finds games stored locally. Cribbage shows fireworks when someone wins.

## Game templates

| Template | Scoring | Win condition |
| --- | --- | --- |
| Free Play | Instant +/− (own score only) | Highest total |
| Rounds | Add my score per round | Highest total |
| Rummy | Add my score per round | First to target (default 500) |
| Golf | Add my score per hole | Lowest total after 9 or 18 holes |
| Cribbage | Peg own track only | First to 121 (or 61) |

## Project layout

- [`mobile/`](mobile/) — Expo app (primary)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture notes

## CI

GitHub Actions runs `npm ci` and TypeScript checking in `mobile/` (see [`.github/workflows/build.yml`](.github/workflows/build.yml)).

## Store builds (later)

Use [EAS Build](https://docs.expo.dev/build/introduction/) from `mobile/` when you are ready for App Store / Google Play.
