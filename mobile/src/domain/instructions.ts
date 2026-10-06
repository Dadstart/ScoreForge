import { cardInfo, type CardKind } from './sorry';

export type GameInstructions = {
  title: string;
  lines: string[];
};

const SORRY_CARDS: CardKind[] = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 'sorry'];

const INSTRUCTIONS: Record<string, GameInstructions> = {
  'free-play': {
    title: 'Free Play',
    lines: [
      'Tap + or − on your own card. Each tap changes your score by one.',
      'You can change only your own score. Everyone else scores on their own device.',
      'Highest total wins.',
      'Share the code so other players can join.',
    ],
  },
  rounds: {
    title: 'Rounds',
    lines: [
      'Each round, enter your own score. The others enter theirs on their devices.',
      'Highest total wins.',
      'Undo removes your latest score.',
    ],
  },
  rummy: {
    title: 'Rummy',
    lines: [
      'Enter your own score at the end of each round.',
      'First to the target wins. A new game starts at 500 unless you change it.',
      'You can change only your own score.',
    ],
  },
  golf: {
    title: 'Golf',
    lines: [
      'Each hole is a round. Enter your own score for that hole.',
      'Lowest total wins.',
      'A game is 9 or 18 holes, whichever you chose at the start.',
    ],
  },
  cribbage: {
    title: 'Cribbage',
    lines: [
      'This board pegs points. Deal and play the cards at the table.',
      'Tap a number to add that many points to your own peg.',
      'First to 121 wins, or to 61 if you set a short game.',
      'Undo peg takes back your last points.',
    ],
  },
  monopoly: {
    title: 'Monopoly',
    lines: [
      'Everyone starts with $1,500. Add a player from the game; they start with $1,500 and a free token. Edit a player to pick a Monopoly piece, or any emoji from your keyboard.',
      'Choose who is paying and who is receiving, then enter the amount.',
      'Open a property to look up the rent for its houses, hotel, railroads, or utilities.',
      'You change your own cash. The richest player wins.',
    ],
  },
  yahtzee: {
    title: 'Yahtzee',
    lines: [
      'Roll five dice. Tap a die to keep it, then roll again. You get three rolls.',
      'Score the roll in an open box. The gold chips show what this roll is worth.',
      'A zero asks you to confirm before it scratches the box.',
      'The upper section pays a 35 bonus once those boxes total 63 or more.',
      'Five of a kind scores 50 in Yahtzee. Each later one adds 100, and must fill the matching upper box while that box is open.',
      'If that upper box is already filled, score any open lower box for its full points. If the lower section is full, scratch an open upper box for zero.',
      'Highest total wins.',
    ],
  },
  sorry: {
    title: 'Sorry',
    lines: [
      'Draw a card, then tap one of the moves it offers.',
      'Each player has four pawns. First to get all four home wins.',
      'Landing on an opponent sends that pawn back to Start.',
      'A triangle of another color slides you ahead. Your own triangles do not.',
      'A pawn that would pass its own start turns into the safety lane instead.',
      ...SORRY_CARDS.map((card) => {
        const info = cardInfo(card);
        return `${info.title} — ${info.detail}`;
      }),
    ],
  },
  backgammon: {
    title: 'Backgammon',
    lines: [
      'White moves toward the low numbers and bears off from points 1–6. Black moves the other way and bears off from 19–24.',
      'White moves first. Lit checkers can move. The chips list each option, with the die and a hit when there is one. Tap a chip, or tap the checker and then the point.',
      'Play both dice when you can. If only one number fits, play the larger one. Doubles are four moves.',
      'A lone checker is a blot. A hit sends it to the bar, and it must re-enter before anything else moves.',
      'You may offer the doubling cube before you roll.',
    ],
  },
  checkers: {
    title: 'Checkers',
    lines: [
      'American checkers. Black moves first.',
      'Tap a piece, then a highlighted square. Men move diagonally forward. Kings move one square on any diagonal.',
      'When jumps are required, you must capture if you can. A piece that jumps keeps jumping.',
      'A man that reaches the far row becomes a king. If it got there by a jump and another jump is open, it continues as a king.',
      'You win by taking every opposing piece, or by leaving the other player with no move.',
    ],
  },
  klondike: {
    title: 'Klondike',
    lines: [
      'Build each foundation up by suit, from ace to king.',
      'On the columns, build down in alternating colors. An empty column takes a king.',
      'Tap the stock to draw. Draw one, or draw three and play only the top waste card.',
      'Tap a card to pick it up, then tap where it goes. A second tap on a card sends it home when it fits.',
      'Undo takes back the last move.',
    ],
  },
  pyramid: {
    title: 'Pyramid',
    lines: [
      'Clear the pyramid.',
      'A card is free when nothing covers it. The waste card is free too.',
      'Remove a king by itself, or two free cards that add to 13.',
      'Draw one card from the stock when you need a new waste card.',
      'The deal is won when every pyramid card is gone. Cards left in the stock do not matter.',
    ],
  },
  tripeaks: {
    title: 'TriPeaks',
    lines: [
      'Clear the three peaks.',
      'A card is free when both cards covering it are gone.',
      'Play a free card one rank higher or lower than the waste. Aces and kings do not meet.',
      'Cards played in a row score more. Drawing a new card starts that run over.',
      'Clearing a peak is worth 15. The deal is won when every peak card is gone.',
    ],
  },
  spider: {
    title: 'Spider',
    lines: [
      'Ten columns and two decks. Build down.',
      'A same-suit run moves together. It can land on the next higher rank of any suit, or on an empty column.',
      'A king-through-ace run of one suit leaves the table. Clear eight suits to win.',
      'Deal a new row only when every column has a card.',
      'The game is one, two, or four suits, chosen when you started.',
    ],
  },
  'chinese-checkers': {
    title: 'Chinese Checkers',
    lines: [
      'Step to a neighboring hole, or jump over an adjacent piece. Jumped pieces stay where they are.',
      'You may keep jumping, and you may stop a chain whenever you want.',
      'Pieces may rest in the center, in their own camp, or in the opposite camp. They cannot stop in someone else’s point.',
      'Fill the opposite corner. A player who finishes is skipped, and the others keep playing for the next place.',
      'Two to six players. Each seat may control one or more colors, alone or in teams.',
    ],
  },
};

export function gameInstructions(templateId: string): GameInstructions | undefined {
  return INSTRUCTIONS[templateId.toLowerCase()];
}
