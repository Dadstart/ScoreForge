export type CardDeck = 'chance' | 'chest';

export const CHANCE_CARD_IDS = [
  'boardwalk',
  'go',
  'illinois',
  'st-charles',
  'railroad-a',
  'railroad-b',
  'utility',
  'bank-50',
  'jail-free',
  'back-3',
  'go-jail',
  'repairs',
  'poor-tax',
  'reading',
  'chairman',
  'loan',
] as const;

export const CHEST_CARD_IDS = [
  'go',
  'bank-error',
  'doctor',
  'stock',
  'jail-free',
  'go-jail',
  'holiday',
  'refund',
  'birthday',
  'life',
  'hospital',
  'school',
  'consultancy',
  'repairs',
  'beauty',
  'inherit',
] as const;

const CHANCE_TEXT: Record<(typeof CHANCE_CARD_IDS)[number], string> = {
  boardwalk: 'Advance to Boardwalk.',
  go: 'Advance to GO. Collect $200.',
  illinois: 'Advance to Illinois Avenue. If you pass GO, collect $200.',
  'st-charles': 'Advance to St. Charles Place. If you pass GO, collect $200.',
  'railroad-a': 'Advance to the nearest Railroad. If unowned, you may buy it from the Bank. If owned, pay the owner twice the rent.',
  'railroad-b': 'Advance to the nearest Railroad. If unowned, you may buy it from the Bank. If owned, pay the owner twice the rent.',
  utility:
    'Advance to the nearest Utility. If unowned, you may buy it from the Bank. If owned, throw the dice and pay the owner ten times the amount thrown.',
  'bank-50': 'Bank pays you a dividend of $50.',
  'jail-free': 'Get Out of Jail Free. Keep this card until you need it.',
  'back-3': 'Go back 3 spaces.',
  'go-jail': 'Go directly to Jail. Do not pass GO. Do not collect $200.',
  repairs: 'Make general repairs on all your property. For each house pay $25. For each hotel pay $100.',
  'poor-tax': 'Pay poor tax of $15.',
  reading: 'Take a ride on the Reading Railroad. If you pass GO, collect $200.',
  chairman: 'You have been elected Chairman of the Board. Pay each player $50.',
  loan: 'Your building and loan matures. Collect $150.',
};

const CHEST_TEXT: Record<(typeof CHEST_CARD_IDS)[number], string> = {
  go: 'Advance to GO. Collect $200.',
  'bank-error': 'Bank error in your favor. Collect $200.',
  doctor: "Doctor's fee. Pay $50.",
  stock: 'From sale of stock you get $50.',
  'jail-free': 'Get Out of Jail Free. Keep this card until you need it.',
  'go-jail': 'Go directly to Jail. Do not pass GO. Do not collect $200.',
  holiday: 'Holiday fund matures. Receive $100.',
  refund: 'Income tax refund. Collect $20.',
  birthday: "It is your birthday. Collect $10 from every player.",
  life: 'Life insurance matures. Collect $100.',
  hospital: 'Hospital fees. Pay $100.',
  school: 'School fees. Pay $50.',
  consultancy: 'Receive $25 consultancy fee.',
  repairs: 'You are assessed for street repairs. Pay $40 per house and $115 per hotel.',
  beauty: 'You have won second prize in a beauty contest. Collect $10.',
  inherit: 'You inherit $100.',
};

export function cardCopy(deck: CardDeck, id: string): { name: string; text: string } {
  const name = deck === 'chance' ? 'Chance' : 'Community Chest';
  const text = deck === 'chance' ? CHANCE_TEXT[id as keyof typeof CHANCE_TEXT] : CHEST_TEXT[id as keyof typeof CHEST_TEXT];
  return { name, text: text ?? 'Follow the card.' };
}
