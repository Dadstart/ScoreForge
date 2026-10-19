# ScoreForge architecture

ScoreForge is a score-keeping product. The **active implementation** is an Expo (React Native + TypeScript) app in [`mobile/`](../mobile/).

An earlier Avalonia/.NET prototype was removed from the tree; see git history if needed.

## Active stack (Expo)

```
mobile/
├── App.tsx                    # navigation + deep linking
├── firestore.rules            # Cloud Firestore security rules
├── firebase.json              # Hosting + Firestore config
├── src/
│   ├── firebase/              # app init + anonymous auth
│   ├── domain/                # models, templates, scoreCalculator, localPlayer
│   ├── storage/               # Firestore game store + known codes + displayName
│   ├── linking/               # share URL create/parse for QR + deep links
│   ├── navigation/            # types + React Navigation linking config
│   ├── screens/               # Home, Setup, Join, Board, Cribbage, Opoly, Yaht, Sorry, Backgammon, Checkers, Chess, Reversi, Chinese Checkers, Klondike, FreeCell, Pyramid, TriPeaks, Spider
│   └── components/            # CribbageBoard, OpolyBoard, YahtScoreboard, SorryBoard, BackgammonBoard, CheckersBoard, ChessBoard, ReversiBoard, ChineseCheckersBoard, solitaire boards, FireworksOverlay, ShareCodePanel
```

### Startup / navigation

React Navigation native stack with `expo-linking` prefixes (`scoreforge://` and Expo URL):

| Screen | Role |
| --- | --- |
| **Home** | List known share codes; resume / delete |
| **Setup** | Template + host name → `createAndSaveGame` in Firestore |
| **Join** | Display name + code → fetch cloud game, add player |
| **Board** | Live subscribe; Free Play / Rounds / Rummy / Golf |
| **Cribbage** | Live subscribe; own-peg scoring + fireworks |
| **Opoly** | Live subscribe; own cash, optional board |
| **Yaht** | Live subscribe; score any column |
| **Sorry** | Live subscribe; shared board, deck, and turn |
| **Backgammon** | Live subscribe; shared board, dice, and cube |
| **Checkers** | Live subscribe; shared board and turn |
| **Chess** | Live subscribe; shared board and turn |
| **Reversi** | Live subscribe; shared board and turn |
| **Chinese Checkers** | Live subscribe; shared star, seats, and turn |
| **Klondike** | Live subscribe; solitaire layout, stock, and undo |
| **FreeCell** | Live subscribe; free cells, cascades, and foundations |
| **Pyramid** | Live subscribe; pyramid layout, stock, and undo |
| **TriPeaks** | Live subscribe; three peaks, stock, and undo |
| **Spider** | Live subscribe; ten columns, stock, and undo |

Deep link: `join?code=XXXXXX`. QR encodes `Linking.createURL('join', { queryParams: { code } })`.

### Cloud sync model

```mermaid
sequenceDiagram
  participant Host
  participant FS as CloudFirestore
  participant Guest
  Host->>FS: create games/SHARECODE
  Host-->>Guest: Code or QR
  Guest->>FS: get games/SHARECODE add player
  Host->>FS: save games/SHARECODE revision+1
  FS-->>Guest: onSnapshot
  Guest->>FS: save games/SHARECODE revision+1
  FS-->>Host: onSnapshot
```

| Path | Contents |
| --- | --- |
| `games/{shareCode}` | The whole game: players, score events, board state, revision |
| `games/{shareCode}/events/{eventId}` | Legacy copies only. Readable until events move onto the parent, then denied |
| AsyncStorage `scoreforge.knownShareCodes` | Codes this device created or joined |
| AsyncStorage `scoreforge.displayName` | Local player name for own-score UI |

- Document id **is** the share code (easy join via `get`).
- **List** queries on `games` are denied in rules (cannot enumerate all games).
- Auth: silent **anonymous** Firebase Auth (enable in console). A separate-devices seat stores that uid. Pass-and-play seats do not.
- Each save replaces the game document and must advance `revision` by 1.
- Board fields are optional in the rules, so an older client can still save after a new game is added. The current client writes every board key.

### Domain

`Game` holds players, score events, and the active board. The template catalog and `calculate()` are pure.

Own-score pads match this device to a player by uid, or by display name when the seat has no uid. Only that player's scores can be changed. Separate-devices board games use the same seat check for the turn. Pass-and-play does not.

All templates start with `minPlayers: 1`; others join via code.

| Template | Mode | Win |
| --- | --- | --- |
| Free Play | Instant | Highest |
| Rounds | Per-player round scores | Highest |
| Rummy | Per-player round scores | First to target (500) |
| Golf | Per-player hole scores | Lowest after N holes |
| Cribbage | Instant pegging | First to 121 |
| Opoly | Instant cash | Highest |
| Yaht | Score-card boxes | Highest |
| Sorry | Board pawns home | First to 4 |
| Backgammon | Shared board | Bear off all 15 checkers |
| Checkers | Shared board | Capture all pieces, or leave no move |
| Chess | Shared board | Checkmate. Stalemate and the drawn endings are a draw |
| Reversi | Shared board | Higher disc count. An equal count is a draw |
| Chinese Checkers | Shared star | Fill the opposite corner; later places play on |
| Klondike | Solitaire layout | All 52 cards on the foundations |
| FreeCell | Free cells and cascades | All 52 cards on the foundations |
| Pyramid | Solitaire layout | Clear the pyramid |
| TriPeaks | Solitaire layout | Clear the three peaks |
| Spider | Solitaire layout | Clear eight suits |

### Platforms

| Target | How |
| --- | --- |
| Web (dev) | `npm run web` |
| Web (public) | `npm run deploy:web` / `deploy:all` |
| Android / iOS (dev) | Expo Go + `npm start` |
| Stores | EAS Build later |

### Deploy checklist

1. Firestore database created  
2. Authentication → **Anonymous** enabled  
3. `mobile/.env` filled with web app config  
4. `npm run deploy:rules` then `npm run deploy:web`

## Legacy Avalonia notes

The Avalonia solution lived in earlier commits and is no longer part of the working tree.
