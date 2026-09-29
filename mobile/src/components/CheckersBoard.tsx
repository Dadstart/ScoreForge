import { Pressable, StyleSheet, View } from 'react-native';
import { BOARD_SIZE, CHECKERS_SIDES, type CheckersHop, type CheckersPiece, type CheckersSquare } from '../domain/checkers';

type Props = {
  pieces: readonly CheckersPiece[];
  selected: CheckersSquare | null;
  destinations: readonly CheckersHop[];
  lastMove: CheckersHop | null;
  flip: boolean;
  disabled?: boolean;
  onSquare: (row: number, col: number) => void;
};

export function CheckersBoard({ pieces, selected, destinations, lastMove, flip, disabled, onSquare }: Props) {
  return (
    <View style={styles.frame}>
      <View style={styles.grid}>
        {Array.from({ length: BOARD_SIZE }, (_, visualRow) => (
          <View key={visualRow} style={styles.row}>
            {Array.from({ length: BOARD_SIZE }, (_, visualCol) => {
              const row = flip ? BOARD_SIZE - 1 - visualRow : visualRow;
              const col = flip ? BOARD_SIZE - 1 - visualCol : visualCol;
              const dark = (row + col) % 2 === 1;
              const piece = pieces.find((item) => item.row === row && item.col === col) ?? null;
              const hop = destinations.find((item) => item.toRow === row && item.toCol === col) ?? null;
              const selectedHere = selected?.row === row && selected?.col === col;
              const landed =
                (lastMove?.toRow === row && lastMove.toCol === col) ||
                (lastMove?.fromRow === row && lastMove.fromCol === col);
              const side = piece ? CHECKERS_SIDES[piece.side] : null;
              const label = piece
                ? `${side?.name} ${piece.kind}${selectedHere ? ', selected' : ''}`
                : hop
                  ? hop.captureRow != null
                    ? 'Jump here'
                    : 'Move here'
                  : dark
                    ? 'Empty square'
                    : 'Light square';

              return (
                <Pressable
                  key={`${row}-${col}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  disabled={disabled || !dark}
                  onPress={() => onSquare(row, col)}
                  style={[
                    styles.cell,
                    dark ? styles.dark : styles.light,
                    visualCol < BOARD_SIZE - 1 && styles.cellRight,
                    visualRow < BOARD_SIZE - 1 && styles.cellBottom,
                  ]}
                >
                  {landed && dark ? <View pointerEvents="none" style={styles.lastMove} /> : null}
                  {hop ? (
                    <View
                      pointerEvents="none"
                      style={[styles.mark, hop.captureRow != null ? styles.markJump : styles.markStep]}
                    />
                  ) : null}
                  {piece && side ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.piece,
                        { backgroundColor: side.fill, borderColor: selectedHere ? '#f6e7a8' : side.rim },
                        selectedHere && styles.pieceSelected,
                      ]}
                    >
                      <View pointerEvents="none" style={styles.shine} />
                      {piece.kind === 'king' ? <View pointerEvents="none" style={styles.kingRing} /> : null}
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

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    aspectRatio: 1,
    backgroundColor: '#3a2416',
    borderRadius: 18,
    padding: 10,
    borderWidth: 2,
    borderColor: '#d4a84b',
  },
  grid: { flex: 1, borderRadius: 8, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellRight: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(42, 24, 12, 0.35)' },
  cellBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(42, 24, 12, 0.35)' },
  light: { backgroundColor: '#f0ddbe' },
  dark: { backgroundColor: '#8d4e2c' },
  lastMove: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(246, 231, 168, 0.28)',
  },
  mark: { borderRadius: 999 },
  markStep: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: 'rgba(246, 231, 168, 0.92)',
  },
  markJump: {
    width: '36%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: '#f6e7a8',
    backgroundColor: 'rgba(246, 231, 168, 0.2)',
  },
  piece: {
    width: '74%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pieceSelected: { borderWidth: 4, transform: [{ scale: 1.06 }] },
  shine: {
    position: 'absolute',
    top: '12%',
    left: '18%',
    width: '28%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 250, 240, 0.35)',
  },
  kingRing: {
    width: '52%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#f0d78c',
  },
});
