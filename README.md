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

Games sync through **Cloud Firestore** using the share code as the game id. Your device remembers codes you create or join. Each player only scores their own points. Cribbage shows fireworks when someone wins.

## Firebase (cloud sync)

1. Create a Firebase project with **Cloud Firestore** and **Anonymous** Authentication enabled.
2. Copy web config into [`mobile/.env`](mobile/.env) (see [`.env.example`](mobile/.env.example)).
3. Deploy rules from `mobile/`:

```bash
cd mobile
npm run deploy:rules
```

4. Deploy the web app: `npm run deploy:web` (or `npm run deploy:all` for hosting + rules).

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

## Deploy web (Firebase Hosting)

From [`mobile/`](mobile/), with [Firebase CLI](https://firebase.google.com/docs/cli) installed and logged in (`firebase login`):

```bash
cd mobile
npm run deploy:web
```

That runs `expo export --platform web` into `dist/`, then deploys Hosting for project `scoreforge-494614` (see [`mobile/.firebaserc`](mobile/.firebaserc)). SPA rewrites send all routes to `index.html` so Join deep links work.

Preview the export locally first:

```bash
npm run export:web
npx serve dist
```

Public URL after deploy is typically `https://scoreforge-494614.web.app` (or your custom domain).

## CI

GitHub Actions runs `npm ci` and TypeScript checking in `mobile/` (see [`.github/workflows/build.yml`](.github/workflows/build.yml)).

## Store builds (later)

Use [EAS Build](https://docs.expo.dev/build/introduction/) from `mobile/` when you are ready for App Store / Google Play.
