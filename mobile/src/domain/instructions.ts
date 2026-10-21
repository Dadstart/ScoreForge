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
    title: 'Opoly',
    lines: [
      'Everyone starts with $1,500. The first player rolls. The dice move that token.',
      'Passing GO collects $200. Doubles means roll again. Three doubles in a row sends you straight to jail — do not pass GO, do not collect $200.',
      'An unowned property can be bought or put up for auction. Landing on someone else’s property pays them rent. A full color group with no houses charges double rent.',
      'On your turn, tap one of your properties on the board. Buy or sell a house or hotel, or mortgage the deed. Build and sell evenly. The bank has 32 houses and 12 hotels; buildings show on the board. Mortgage a property for half its price after the houses on that color are sold.',
      'If you cannot pay a debt, mortgage or sell buildings first. Otherwise declare bankruptcy — deeds go to the player you owe, or back to the bank.',
      'In jail, roll doubles to leave, pay $50, or use a Get Out of Jail Free card. The third miss makes you pay $50 and move.',
      'Income Tax is $200 or 10% of your worth. Trade deeds and cash on your turn. Chance and Chest play themselves.',
      'The last player with cash wins. Marking the game complete crowns the richest player.',
    ],
  },
  yaht: {
    title: 'Yaht',
    lines: [
      'Roll five dice. Tap a die to keep it, then roll again. You get three rolls.',
      'Score the roll in an open box. The gold chips show what this roll is worth.',
      'A zero asks you to confirm before it scratches the box.',
      'The upper section pays a 35 bonus once those boxes total 63 or more.',
      'Five of a kind scores 50 in Yaht. Each later one adds 100, and must fill the matching upper box while that box is open.',
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
  parcheesi: {
    title: 'Parcheesi',
    lines: [
      'Tap Roll on the Home circle, then tap one of your pawns and the space it moves to.',
      'A 5 brings a pawn out of the nest onto your start space. Each die is its own move.',
      'Two of your pawns on one space are a blockade. Nothing may land on or pass a blockade.',
      'Landing on a single opponent sends that pawn back to its nest. The capturer then moves 20 if the way is open.',
      'Start spaces and the space before each home lane are safe. A pawn there cannot be captured.',
      'After a full lap, a pawn turns into its home lane. The lane is seven spaces, and the center takes an exact count.',
      'Reaching the center lets another pawn move 10, when one can.',
      'Doubles let you roll again. Three doubles in a row send your leading pawn back to the nest.',
      'Use both dice when a way exists. If only one number can be played, play the larger one. A roll that cannot be used passes the turn.',
      'The first player to get all four pawns to the center wins.',
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
  chess: {
    title: 'Chess',
    lines: [
      'White moves first. Tap a piece, then a highlighted square. You can also drag a piece onto a square.',
      'Pawns move one square forward and capture diagonally. A pawn may step two squares on its first move. The next turn, an enemy pawn can capture it en passant if it passed that pawn.',
      'Knights jump in an L. Bishops move on a diagonal, rooks on a rank or file, and the queen either way. The king moves one square.',
      'Castle when the king and that rook have not moved, the squares between them are empty, and the king does not pass through check.',
      'A pawn that reaches the far rank promotes. Checkmate wins. Stalemate, repetition, the fifty-move rule, and insufficient material are draws.',
    ],
  },
  'skip-beaux': {
    title: 'Skip-Beaux',
    lines: [
      'One to six players. Two to four get a stock pile of 30 cards. Five or six get 20. Only the top stock card is face up. Playing alone uses a stock of 30.',
      'Draw until you have five cards. Build shared piles from 1 to 12. A wild card can be any number, including the 1 that starts a pile.',
      'Play from your hand, the top of your stock, or the top of one of your four discard piles. A finished pile of 12 is cleared, and those cards refill the draw pile when it runs out.',
      'If you play every card in your hand, draw five more and keep going. Discarding does not count. End the turn by discarding one hand card onto one of your discard piles.',
      'The first player to play the last card of their stock pile wins.',
      'On separate devices, share the code and deal once everyone has joined. Pass and play deals as soon as the seats are filled.',
    ],
  },
  uneaux: {
    title: 'Uneaux',
    lines: [
      'Match the color or the symbol on the discard pile. A wild can be played on anything, and you name the color that follows.',
      'A draw four can be played only when you have no card of the current color. The next player draws four and loses the turn.',
      'Skip jumps the next player. Reverse changes direction. With two players, reverse sends the turn back to you. Draw two makes the next player draw two cards and skip their turn.',
      'You may draw even when you have a play. After you draw, play that card or pass.',
      'With one card left, say Uneaux before the next player acts. If you forget, they can catch you and you draw two.',
      'The player who goes out scores the cards left in the other hands. Number cards count their face value, skip, reverse, and draw two count 20, and wilds count 50.',
      'The first player to 500 wins. A tie at the target deals another hand.',
    ],
  },
  canasta: {
    title: 'Canasta',
    lines: [
      'Two decks and four jokers. Two or three players each play alone. Four players play as partners, sitting opposite.',
      'Two players draw two cards from the stock. Three or four draw one. Or take the whole discard pile when you can meld the top card. Until you have opened, and whenever the pack is frozen, that takes a natural pair from your hand. Cards under the top card do not count. Then meld and discard one card.',
      'A meld is three or more of one rank, with at least two natural cards and no more wilds than natural cards. Jokers and twos are wild. Twos cannot be melded on their own.',
      'You need 50 points to open, 90 from 1,500, 120 from 3,000, and 15 when your score is below zero. A canasta is seven cards of one rank.',
      'Red threes are laid down for 100 each, or 800 for all four. They count against you if your side never opens. A black three on top blocks the pack. A wild card in the pack freezes it.',
      'You need a canasta to go out. The first side to 5,000 wins. A tie at the target deals another hand.',
      'Undo takes back the last draw, meld, or discard. Drag cards in your hand to arrange them, or use Sort hand to put them in rank order.',
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
      'Against the computer, you play Black. Choose Easy, Medium, or Hard at setup or during the game.',
    ],
  },
  reversi: {
    title: 'Reversi',
    lines: [
      'Black moves first. Four discs start in the center, on the diagonals.',
      'Tap a dotted square. The new disc has to bracket a straight line of the other color.',
      'Every bracketed disc flips. A line can run across, down, or on a diagonal, and one move can flip several.',
      'A side that cannot flip anything is skipped. Play ends when neither side can move.',
      'The higher count wins. An equal count is a draw.',
    ],
  },
  freecell: {
    title: 'FreeCell',
    lines: [
      'All 52 cards are dealt face up into eight columns. Four free cells and four foundations start empty.',
      'Build each foundation up by suit, from ace to king.',
      'On the columns, build down in alternating colors. An empty column takes any card.',
      'Move one card at a time. A built run can move together when the free cells and empty columns can carry it.',
      'Tap a card again to build it up. Finish sends home every card that cannot be needed on a column.',
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
  const key = templateId.toLowerCase() === 'yahtzee' ? 'yaht' : templateId.toLowerCase();
  return INSTRUCTIONS[key];
}
