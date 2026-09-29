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
    name: 'Monopoly',
    description:
      'Track cash from $1,500. Add or subtract any amount, or look up rent from the property and its houses or hotel.',
    scoringMode: 'Instant',
    winCondition: 'HighestTotal',
    minPlayers: 1,
    maxPlayers: 8,
  },
  {
    id: 'yahtzee',
    name: 'Yahtzee',
    description:
      'Fill any column on the score card. Upper bonus at 63, Yahtzee bonus +100. Highest total wins.',
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
];

export function getTemplate(id: string): GameTemplate | undefined {
  return templates.find((t) => t.id.toLowerCase() === id.toLowerCase());
}
