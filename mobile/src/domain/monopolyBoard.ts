/** U.S. board in play order. Index 0 is Go. */

export const INCOME_TAX = 200;
export const LUXURY_TAX = 100;

export type BoardSpace = {
  index: number;
  name: string;
  short: string;
  /** Set when landing here should select a rent property. */
  propertyId?: string;
  /** Set when landing here should fill the cash amount. */
  tax?: number;
};

const space = (
  index: number,
  name: string,
  short: string,
  extra?: { propertyId?: string; tax?: number },
): BoardSpace => ({ index, name, short, ...extra });

export const boardSpaces: BoardSpace[] = [
  space(0, 'Go', 'GO'),
  space(1, 'Mediterranean Avenue', 'Med', { propertyId: 'mediterranean' }),
  space(2, 'Community Chest', 'Chest'),
  space(3, 'Baltic Avenue', 'Baltic', { propertyId: 'baltic' }),
  space(4, 'Income Tax', 'Tax', { tax: INCOME_TAX }),
  space(5, 'Reading Railroad', 'Reading', { propertyId: 'reading' }),
  space(6, 'Oriental Avenue', 'Orient', { propertyId: 'oriental' }),
  space(7, 'Chance', 'Chance'),
  space(8, 'Vermont Avenue', 'Verm', { propertyId: 'vermont' }),
  space(9, 'Connecticut Avenue', 'Conn', { propertyId: 'connecticut' }),
  space(10, 'Jail', 'Jail'),
  space(11, 'St. Charles Place', 'St. Ch', { propertyId: 'st-charles' }),
  space(12, 'Electric Company', 'Electric', { propertyId: 'electric' }),
  space(13, 'States Avenue', 'States', { propertyId: 'states' }),
  space(14, 'Virginia Avenue', 'Virginia', { propertyId: 'virginia' }),
  space(15, 'Pennsylvania Railroad', 'Penn RR', { propertyId: 'pennsylvania-rr' }),
  space(16, 'St. James Place', 'St. Ja', { propertyId: 'st-james' }),
  space(17, 'Community Chest', 'Chest'),
  space(18, 'Tennessee Avenue', 'Tenn', { propertyId: 'tennessee' }),
  space(19, 'New York Avenue', 'New York', { propertyId: 'new-york' }),
  space(20, 'Free Parking', 'Free'),
  space(21, 'Kentucky Avenue', 'Kent', { propertyId: 'kentucky' }),
  space(22, 'Chance', 'Chance'),
  space(23, 'Indiana Avenue', 'Indiana', { propertyId: 'indiana' }),
  space(24, 'Illinois Avenue', 'Illinois', { propertyId: 'illinois' }),
  space(25, 'B. & O. Railroad', 'B & O', { propertyId: 'bo' }),
  space(26, 'Atlantic Avenue', 'Atlantic', { propertyId: 'atlantic' }),
  space(27, 'Ventnor Avenue', 'Ventnor', { propertyId: 'ventnor' }),
  space(28, 'Water Works', 'Water', { propertyId: 'water' }),
  space(29, 'Marvin Gardens', 'Marvin', { propertyId: 'marvin-gardens' }),
  space(30, 'Go to Jail', 'To Jail'),
  space(31, 'Pacific Avenue', 'Pacific', { propertyId: 'pacific' }),
  space(32, 'North Carolina Avenue', 'N. Car', { propertyId: 'north-carolina' }),
  space(33, 'Community Chest', 'Chest'),
  space(34, 'Pennsylvania Avenue', 'Penn Av', { propertyId: 'pennsylvania-ave' }),
  space(35, 'Short Line', 'Short', { propertyId: 'short-line' }),
  space(36, 'Chance', 'Chance'),
  space(37, 'Park Place', 'Park Pl', { propertyId: 'park-place' }),
  space(38, 'Luxury Tax', 'Luxury', { tax: LUXURY_TAX }),
  space(39, 'Boardwalk', 'Boardwalk', { propertyId: 'boardwalk' }),
];

export function getBoardSpace(index: number): BoardSpace | undefined {
  return boardSpaces[index];
}

/** Grid cell for a space. Go is the bottom-right corner; play runs clockwise on screen. */
export function spaceToCell(index: number): { row: number; col: number } {
  const i = ((index % 40) + 40) % 40;
  if (i <= 10) return { row: 10, col: 10 - i };
  if (i <= 20) return { row: 20 - i, col: 0 };
  if (i <= 30) return { row: 0, col: i - 20 };
  return { row: i - 30, col: 10 };
}

/** Space under a grid cell, or null for the middle of the board. */
export function cellToSpace(row: number, col: number): number | null {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || col < 0 || row > 10 || col > 10) return null;
  const onEdge = row === 0 || row === 10 || col === 0 || col === 10;
  if (!onEdge) return null;
  if (row === 10) return 10 - col;
  if (col === 0) return 20 - row;
  if (row === 0) return 20 + col;
  return 30 + row;
}

export function tokenSpace(spaces: Record<string, number> | undefined, playerId: string): number {
  const index = spaces?.[playerId];
  return typeof index === 'number' && index >= 0 && index < 40 ? Math.trunc(index) : 0;
}
