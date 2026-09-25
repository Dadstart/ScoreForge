/** Standard U.S. edition rents. Street rents are base, 1–4 houses, then hotel. */

import { createScoreEvent, type ScoreEvent } from './models';

/** Cash that leaves or enters play, rather than another player's stack. */
export const BANK_PARTY_ID = 'bank';

export const STARTING_CASH = 1500;

export type PropertyKind = 'street' | 'railroad' | 'utility';
export type StreetLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type RailroadCount = 1 | 2 | 3 | 4;
export type UtilityCount = 1 | 2;

type StreetRents = readonly [number, number, number, number, number, number];

export interface BoardProperty {
  id: string;
  name: string;
  group: string;
  swatch: string;
  kind: PropertyKind;
  rents?: StreetRents;
}

const street = (
  id: string,
  name: string,
  group: string,
  swatch: string,
  rents: StreetRents,
): BoardProperty => ({ id, name, group, swatch, kind: 'street', rents });

const railroad = (id: string, name: string): BoardProperty => ({
  id,
  name,
  group: 'Railroads',
  swatch: '#d0d5d2',
  kind: 'railroad',
});

const utility = (id: string, name: string): BoardProperty => ({
  id,
  name,
  group: 'Utilities',
  swatch: '#f2e3a0',
  kind: 'utility',
});

export const properties: BoardProperty[] = [
  street('mediterranean', 'Mediterranean Avenue', 'Brown', '#955436', [2, 10, 30, 90, 160, 250]),
  street('baltic', 'Baltic Avenue', 'Brown', '#955436', [4, 20, 60, 180, 320, 450]),
  street('oriental', 'Oriental Avenue', 'Light blue', '#aae0fa', [6, 30, 90, 270, 400, 550]),
  street('vermont', 'Vermont Avenue', 'Light blue', '#aae0fa', [6, 30, 90, 270, 400, 550]),
  street('connecticut', 'Connecticut Avenue', 'Light blue', '#aae0fa', [8, 40, 100, 300, 450, 600]),
  street('st-charles', 'St. Charles Place', 'Pink', '#d93a96', [10, 50, 150, 450, 625, 750]),
  street('states', 'States Avenue', 'Pink', '#d93a96', [10, 50, 150, 450, 625, 750]),
  street('virginia', 'Virginia Avenue', 'Pink', '#d93a96', [12, 60, 180, 500, 700, 900]),
  street('st-james', 'St. James Place', 'Orange', '#f7941d', [14, 70, 200, 550, 750, 950]),
  street('tennessee', 'Tennessee Avenue', 'Orange', '#f7941d', [14, 70, 200, 550, 750, 950]),
  street('new-york', 'New York Avenue', 'Orange', '#f7941d', [16, 80, 220, 600, 800, 1000]),
  street('kentucky', 'Kentucky Avenue', 'Red', '#ed1b24', [18, 90, 250, 700, 875, 1050]),
  street('indiana', 'Indiana Avenue', 'Red', '#ed1b24', [18, 90, 250, 700, 875, 1050]),
  street('illinois', 'Illinois Avenue', 'Red', '#ed1b24', [20, 100, 300, 750, 925, 1100]),
  street('atlantic', 'Atlantic Avenue', 'Yellow', '#f0d23a', [22, 110, 330, 800, 975, 1150]),
  street('ventnor', 'Ventnor Avenue', 'Yellow', '#f0d23a', [22, 110, 330, 800, 975, 1150]),
  street('marvin-gardens', 'Marvin Gardens', 'Yellow', '#f0d23a', [24, 120, 360, 850, 1025, 1200]),
  street('pacific', 'Pacific Avenue', 'Green', '#1fb25a', [26, 130, 390, 900, 1100, 1275]),
  street('north-carolina', 'North Carolina Avenue', 'Green', '#1fb25a', [26, 130, 390, 900, 1100, 1275]),
  street('pennsylvania-ave', 'Pennsylvania Avenue', 'Green', '#1fb25a', [28, 150, 450, 1000, 1200, 1400]),
  street('park-place', 'Park Place', 'Dark blue', '#0072bc', [35, 175, 500, 1100, 1300, 1500]),
  street('boardwalk', 'Boardwalk', 'Dark blue', '#0072bc', [50, 200, 600, 1400, 1700, 2000]),
  railroad('reading', 'Reading Railroad'),
  railroad('pennsylvania-rr', 'Pennsylvania Railroad'),
  railroad('bo', 'B. & O. Railroad'),
  railroad('short-line', 'Short Line'),
  utility('electric', 'Electric Company'),
  utility('water', 'Water Works'),
];

const RAILROAD_RENTS: Record<RailroadCount, number> = {
  1: 25,
  2: 50,
  3: 100,
  4: 200,
};

export const STREET_LEVELS: { id: StreetLevel; label: string }[] = [
  { id: 0, label: 'No houses' },
  { id: 1, label: '1 house' },
  { id: 2, label: '2 houses' },
  { id: 3, label: '3 houses' },
  { id: 4, label: '4 houses' },
  { id: 5, label: 'Hotel' },
];

export const RAILROAD_COUNTS: { id: RailroadCount; label: string }[] = [
  { id: 1, label: '1 railroad' },
  { id: 2, label: '2 railroads' },
  { id: 3, label: '3 railroads' },
  { id: 4, label: '4 railroads' },
];

export const UTILITY_COUNTS: { id: UtilityCount; label: string }[] = [
  { id: 1, label: '1 utility (4× dice)' },
  { id: 2, label: 'Both utilities (10× dice)' },
];

export function getProperty(id: string): BoardProperty | undefined {
  return properties.find((property) => property.id === id);
}

export function formatMoney(amount: number): string {
  const negative = amount < 0;
  const formatted = Math.abs(Math.trunc(amount)).toLocaleString('en-US');
  return `${negative ? '-' : ''}$${formatted}`;
}

export function cashFromDelta(delta: number): number {
  return STARTING_CASH + delta;
}

export type RentQuote = {
  amount: number;
  summary: string;
};

export function quoteRent(input: {
  propertyId: string;
  streetLevel: StreetLevel;
  railroadsOwned: RailroadCount;
  utilitiesOwned: UtilityCount;
  dice: number;
}): RentQuote | null {
  const property = getProperty(input.propertyId);
  if (!property) return null;

  if (property.kind === 'street' && property.rents) {
    const amount = property.rents[input.streetLevel];
    const level = STREET_LEVELS.find((entry) => entry.id === input.streetLevel);
    return {
      amount,
      summary: `${property.name}, ${level?.label.toLowerCase() ?? 'rent'}`,
    };
  }

  if (property.kind === 'railroad') {
    const amount = RAILROAD_RENTS[input.railroadsOwned];
    const owned = RAILROAD_COUNTS.find((entry) => entry.id === input.railroadsOwned);
    return {
      amount,
      summary: `${property.name}, ${owned?.label.toLowerCase() ?? 'railroad rent'}`,
    };
  }

  if (!Number.isInteger(input.dice) || input.dice < 2 || input.dice > 12) return null;
  const multiplier = input.utilitiesOwned === 2 ? 10 : 4;
  const owned = input.utilitiesOwned === 2 ? 'both utilities' : '1 utility';
  return {
    amount: input.dice * multiplier,
    summary: `${property.name}, ${owned}, dice ${input.dice}`,
  };
}

/** One payment. The bank is not a player, so that side has no score event. */
export function transferEvents(fromId: string, toId: string, amount: number): ScoreEvent[] {
  if (fromId === toId || amount <= 0) return [];
  const stamp = new Date().toISOString();
  const events: ScoreEvent[] = [];
  if (fromId !== BANK_PARTY_ID) {
    const paid = createScoreEvent(fromId, -amount);
    paid.timestamp = stamp;
    events.push(paid);
  }
  if (toId !== BANK_PARTY_ID) {
    const received = createScoreEvent(toId, amount);
    received.timestamp = stamp;
    events.push(received);
  }
  return events;
}

/** Drop the latest payment, including both sides of a player-to-player transfer. */
export function withoutLastCashAction(events: ScoreEvent[]): ScoreEvent[] {
  if (events.length === 0) return events;
  const stamp = events[events.length - 1].timestamp;
  let end = events.length;
  while (end > 0 && events[end - 1].timestamp === stamp) end -= 1;
  return events.slice(0, end);
}
