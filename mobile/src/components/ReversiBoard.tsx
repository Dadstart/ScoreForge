import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  BOARD_SIZE,
  REVERSI_SIDES,
  type ReversiMove,
  type ReversiSquare,
  type Side,
} from '../domain/reversi';

type Props = {
  cells: readonly (Side | null)[];
  moves: readonly ReversiMove[];
  turn: Side;
  lastMove: ReversiSquare | null;
  lastFlips: readonly ReversiSquare[];
  disabled?: boolean;
  onSquare: (row: number, col: number) => void;
};

export function ReversiBoard({ cells, moves, turn, lastMove, lastFlips, disabled, onSquare }: Props) {
  const hint = REVERSI_SIDES[turn];

  return (
    <View style={styles.frame} accessibilityLabel="Reversi board">
      <View style={styles.grid}>
        {Array.from({ length: BOARD_SIZE }, (_, row) => (
          <View key={row} style={styles.row}>
            {Array.from({ length: BOARD_SIZE }, (_, col) => {
              const cell = cells[row * BOARD_SIZE + col] ?? null;
              const move = moves.find((item) => item.row === row && item.col === col) ?? null;
              const placed = lastMove?.row === row && lastMove.col === col;
              const flipped = lastFlips.some((flip) => flip.row === row && flip.col === col);
              const side = cell ? REVERSI_SIDES[cell] : null;
              const where = `row ${row + 1}, column ${col + 1}`;
              const label = side
                ? `${side.name} disc, ${where}${placed ? ', just played' : flipped ? ', just flipped' : ''}`
                : move
                  ? `Play here, ${where}. Flips ${move.flips.length} ${move.flips.length === 1 ? 'disc' : 'discs'}`
                  : `Empty, ${where}`;

              return (
                <Pressable
                  key={`${row}-${col}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled: Boolean(disabled) || !move }}
                  disabled={disabled || !move}
                  onPress={() => onSquare(row, col)}
                  style={[
                    styles.cell,
                    (row + col) % 2 === 0 ? styles.even : styles.odd,
                    col < BOARD_SIZE - 1 && styles.cellRight,
                    row < BOARD_SIZE - 1 && styles.cellBottom,
                    move && !disabled ? webPress : null,
                  ]}
                >
                  {flipped || placed ? <View style={styles.changed} /> : null}
                  {move && !cell ? (
                    <View style={[styles.hint, { backgroundColor: hint.fill, borderColor: hint.rim }]} />
                  ) : null}
                  {side ? (
                    <View style={[styles.disc, { backgroundColor: side.fill, borderColor: placed ? '#f0d78c' : side.rim }]}>
                      <View style={[styles.shine, side.id === 'dark' ? styles.shineDark : styles.shineLight]} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const webPress = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    aspectRatio: 1,
    backgroundColor: '#0e3a24',
    borderRadius: 18,
    padding: 10,
    borderWidth: 2,
    borderColor: '#d4a84b',
  },
  grid: { flex: 1, borderRadius: 8, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellRight: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(6, 32, 18, 0.45)' },
  cellBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(6, 32, 18, 0.45)' },
  even: { backgroundColor: '#1c8a46' },
  odd: { backgroundColor: '#16753b' },
  changed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(240, 215, 140, 0.28)',
  },
  hint: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 1,
    opacity: 0.7,
  },
  disc: {
    width: '74%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.35)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 2 },
      },
    }),
  },
  shine: {
    position: 'absolute',
    top: '14%',
    left: '18%',
    width: '26%',
    aspectRatio: 1,
    borderRadius: 999,
  },
  shineDark: { backgroundColor: 'rgba(255, 250, 240, 0.22)' },
  shineLight: { backgroundColor: 'rgba(255, 255, 255, 0.7)' },
});
