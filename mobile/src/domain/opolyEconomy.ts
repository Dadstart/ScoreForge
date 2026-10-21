import type { ScoreEvent } from './models';
import { cashFromDelta, getProperty, properties, type BoardProperty } from './opoly';
import type { OpolyPlay } from './opolyPlay';

/** Classic U.S. edition bank supply. */
export const HOUSE_SUPPLY = 32;
export const HOTEL_SUPPLY = 12;

const HOUSE_COST: Record<string, number> = {
  Brown: 50,
  'Light blue': 50,
  Pink: 100,
  Orange: 100,
  Red: 150,
  Yellow: 150,
  Green: 200,
  'Dark blue': 200,
};

export function streetsIn(group: string): BoardProperty[] {
  return properties.filter((property) => property.kind === 'street' && property.group === group);
}

export function houseCost(property: BoardProperty): number {
  return HOUSE_COST[property.group] ?? 0;
}

export function mortgageValue(propertyId: string): number {
  const property = getProperty(propertyId);
  return property ? Math.floor(property.price / 2) : 0;
}

export function unmortgageCost(propertyId: string): number {
  const mortgage = mortgageValue(propertyId);
  return mortgage + Math.ceil(mortgage * 0.1);
}

export function buildingCost(propertyId: string): number {
  const property = getProperty(propertyId);
  return property ? houseCost(property) : 0;
}

export function countOf(map: Record<string, number>, id: string): number {
  return map[id] ?? 0;
}

export function levelOf(play: OpolyPlay, propertyId: string): number {
  return play.houses[propertyId] ?? 0;
}

export function ownsOpoly(play: OpolyPlay, playerId: string, group: string): boolean {
  const streets = streetsIn(group);
  return (
    streets.length > 1 &&
    streets.every((street) => play.owned[street.id] === playerId && !play.mortgaged.includes(street.id))
  );
}

/** Houses and hotels still available in the bank (derived from placed buildings). */
export function buildingStock(play: OpolyPlay): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const property of properties) {
    if (property.kind !== 'street') continue;
    const level = levelOf(play, property.id);
    if (level >= 5) hotels += 1;
    else houses += level;
  }
  return {
    houses: Math.max(0, HOUSE_SUPPLY - houses),
    hotels: Math.max(0, HOTEL_SUPPLY - hotels),
  };
}

export function canBuild(play: OpolyPlay, propertyId: string): boolean {
  const property = getProperty(propertyId);
  if (!property || property.kind !== 'street') return false;
  const owner = play.owned[propertyId];
  if (!owner || !ownsOpoly(play, owner, property.group)) return false;
  const level = levelOf(play, propertyId);
  if (level >= 5) return false;
  const lowest = Math.min(...streetsIn(property.group).map((street) => levelOf(play, street.id)));
  if (level !== lowest) return false;
  const stock = buildingStock(play);
  // Level 4 → hotel returns 4 houses to the bank and takes 1 hotel.
  if (level >= 4) return stock.hotels >= 1;
  return stock.houses >= 1;
}

export function canSellBuilding(play: OpolyPlay, propertyId: string): boolean {
  const property = getProperty(propertyId);
  if (!property || property.kind !== 'street') return false;
  const level = levelOf(play, propertyId);
  if (level <= 0) return false;
  const highest = Math.max(...streetsIn(property.group).map((street) => levelOf(play, street.id)));
  if (level !== highest) return false;
  // Hotel → 4 houses needs 4 houses available from the bank.
  if (level >= 5) return buildingStock(play).houses >= 4;
  return true;
}

export function canMortgage(play: OpolyPlay, propertyId: string): boolean {
  const property = getProperty(propertyId);
  if (!property || !play.owned[propertyId] || play.mortgaged.includes(propertyId)) return false;
  if (property.kind !== 'street') return true;
  return streetsIn(property.group).every((street) => levelOf(play, street.id) === 0);
}

/** Mortgage or sell buildings while a debt is open. */
export function canRaiseFunds(play: OpolyPlay): boolean {
  return play.pending?.kind === 'pay';
}

/** Cash + deeds at list/mortgage value + buildings at cost. */
export function netWorth(play: OpolyPlay, playerId: string, events: ScoreEvent[]): number {
  let total = cashOf(events, playerId);
  for (const [propertyId, owner] of Object.entries(play.owned)) {
    if (owner !== playerId) continue;
    const property = getProperty(propertyId);
    if (!property) continue;
    total += play.mortgaged.includes(propertyId) ? mortgageValue(propertyId) : property.price;
    const level = levelOf(play, propertyId);
    if (level > 0) total += level * houseCost(property);
  }
  return total;
}

export function cashOf(events: ScoreEvent[], playerId: string): number {
  const delta = events.filter((event) => event.playerId === playerId).reduce((sum, event) => sum + event.points, 0);
  return cashFromDelta(delta);
}
