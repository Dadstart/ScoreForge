export type ScoringMode = 'Instant' | 'Rounds';
export type WinCondition = 'HighestTotal' | 'LowestTotal' | 'FirstToTarget';

export interface GameTemplate {
  id: string;
  name: string;
  description: string;
  scoringMode: ScoringMode;
  winCondition: WinCondition;
  defaultTargetScore?: number | null;
  defaultMaxRounds?: number | null;
  minPlayers: number;
  maxPlayers: number;
}

export const templates: GameTemplate[] = [
  {
    id: 'free-play',
    name: 'Free Play',
    description:
      'Tap +/− to change scores instantly. Start alone; others join with the share code.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 12,
  },
  {
    id: 'rounds',
    name: 'Rounds',
    description:
      'Enter a score for each player every round. Start alone; others join with the share code. Highest total wins.',
    scoringMode: 'Rounds',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 12,
  },
  {
    id: 'rummy',
    name: 'Rummy',
    description:
      'Round-based scoring to a target (default 500). Start alone; others join with the share code.',
    scoringMode: 'Rounds',
    winCondition: 'FirstToTarget',
    defaultTargetScore: 500,
    minPlayers: 1,
    maxPlayers: 6,
  },
  {
    id: 'golf',
    name: 'Golf',
    description:
      'Score each hole as a round. Start alone; others join with the share code. Lowest total after 9 or 18 holes wins.',
    scoringMode: 'Rounds',
    winCondition: 'LowestTotal',
    defaultMaxRounds: 18,
    minPlayers: 1,
    maxPlayers: 8,
  },
  {
    id: 'cribbage',
    name: 'Cribbage',
    description:
      'Peg around a traditional board. Start alone; others join with the share code. First to 121 (or 61) wins.',
    scoringMode: 'Instant',
    winCondition: 'FirstToTarget',
    defaultTargetScore: 121,
    minPlayers: 1,
    maxPlayers: 3,
  },
  {
    id: 'monopoly',
    name: 'Opoly',
    description:
      'Roll, buy properties, pay rent, and follow Chance and Chest. Everyone starts with $1,500. The last player with cash wins.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 8,
  },
  {
    id: 'yaht',
    name: 'Yaht',
    description:
      'Roll five dice, keep any, and roll twice more. Score each box from the dice. Upper bonus at 63. Highest total wins.',
    scoringMode: 'Rounds',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 6,
  },
  {
    id: 'sorry',
    name: 'Sorry',
    description:
      'Race four pawns home on a shared board. Draw a card, slide on another color’s triangle, or bump someone back to Start.',
    scoringMode: 'Instant',
    winCondition: 'FirstToTarget',
    defaultTargetScore: 4,
    minPlayers: 1,
    maxPlayers: 4,
  },
  {
    id: 'backgammon',
    name: 'Backgammon',
    description:
      'Race 15 checkers home. Roll two dice, hit a blot, and bear off. White moves first. Double before you roll.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    id: 'checkers',
    name: 'Checkers',
    description:
      'American checkers on a shared board. Black moves first. Play a friend, pass the device, or face the computer. Jumps can be required or optional.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    id: 'chess',
    name: 'Chess',
    description:
      'Standard chess on a shared board. White moves first. Castle, take en passant, and promote. Checkmate wins. Stalemate and the drawn endings are a draw.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    id: 'canasta',
    name: 'Canasta',
    description:
      'Two decks and four jokers. Draw or take the pack, then meld. A canasta is seven of one rank. Partners sit opposite. First to 5,000 wins.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 4,
    defaultTargetScore: 5000,
  },
  {
    id: 'reversi',
    name: 'Reversi',
    description:
      'Outflank a line and flip those discs. Black moves first from the center four. The higher count wins when neither side can move.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 2,
  },
  {
    id: 'klondike',
    name: 'Klondike',
    description:
      'Classic solitaire. Build each suit from ace to king. Draw one or three, and undo a mistake.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: 'freecell',
    name: 'FreeCell',
    description:
      'All cards are dealt face up. Build each suit from ace to king. Park a card in a free cell, and move a run when there is room.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: 'pyramid',
    name: 'Pyramid',
    description:
      'Clear the pyramid. Pair uncovered cards that add to 13. A king comes off alone. Draw one card from the stock.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: 'tripeaks',
    name: 'TriPeaks',
    description:
      'Clear three peaks. Play an uncovered card one rank off the waste. A run scores, and a peak is worth 15.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: 'spider',
    name: 'Spider',
    description:
      'Two decks and ten columns. Move a same-suit run onto the next rank. Clear eight suits. One, two, or four suits.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 1,
  },
  {
    id: 'chinese-checkers',
    name: 'Chinese Checkers',
    description:
      'Race across the star. Two to six players, each with one or more colors, alone or in teams. Step or jump into the opposite corner. Later places keep playing.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 6,
  },
];

export function getTemplate(id: string): GameTemplate | undefined {
  const key = id.toLowerCase() === 'yahtzee' ? 'yaht' : id;
  return templates.find((t) => t.id.toLowerCase() === key.toLowerCase());
}
