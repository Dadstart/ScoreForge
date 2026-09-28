import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field } from './ui';
import {
  chipScores,
  scoreError,
  UPPER_BONUS,
  UPPER_BONUS_AT,
  YAHTZEE_BOXES,
  type PlayerCard,
  type YahtzeeBox,
} from '../domain/yahtzee';
import { colors, fonts, radii, typography } from '../theme';

const LABEL_W = 132;
const HEADER_H = 76;
const SECTION_H = 28;
const ROW_H = 40;
const GRAND_H = 46;

const PAPER = '#f6f0e3';
const PAPER_ALT = '#efe4d0';
const INK = '#241c14';
const INK_MUTED = '#7d6c58';
const LINE = '#e0d2b8';
const UPPER = '#1d6a45';
const LOWER = '#8d3034';
const GRAND = '#241c14';

const PIPS = ['#d4a84b', '#2f8f62', '#c4524a', '#3d7eb8', '#8d6bb8', '#c4843a'];

type TotalId = 'upper' | 'bonus' | 'upperTotal' | 'lower' | 'yahtzeeBonus' | 'grand';

type ScoreRow =
  | { kind: 'section'; title: string; tone: 'upper' | 'lower' }
  | { kind: 'box'; box: YahtzeeBox }
  | { kind: 'total'; id: TotalId; label: string; hint?: string };

const ROWS: ScoreRow[] = [
  { kind: 'section', title: 'Upper section', tone: 'upper' },
  ...YAHTZEE_BOXES.filter((box) => box.section === 'upper').map(
    (box) => ({ kind: 'box', box }) as const,
  ),
  { kind: 'total', id: 'upper', label: 'Upper score' },
  { kind: 'total', id: 'bonus', label: 'Bonus', hint: `at ${UPPER_BONUS_AT}` },
  { kind: 'total', id: 'upperTotal', label: 'Upper total' },
  { kind: 'section', title: 'Lower section', tone: 'lower' },
  ...YAHTZEE_BOXES.filter((box) => box.section === 'lower').map(
    (box) => ({ kind: 'box', box }) as const,
  ),
  { kind: 'total', id: 'yahtzeeBonus', label: 'Yahtzee bonus', hint: 'each extra' },
  { kind: 'total', id: 'lower', label: 'Lower total' },
  { kind: 'total', id: 'grand', label: 'Grand total' },
];

function rowHeight(row: ScoreRow): number {
  if (row.kind === 'section') return SECTION_H;
  if (row.kind === 'total' && row.id === 'grand') return GRAND_H;
  return ROW_H;
}

const CARD_H = HEADER_H + ROWS.reduce((sum, row) => sum + rowHeight(row), 0);

type Props = {
  players: PlayerCard[];
  locked: boolean;
  onPressBox: (playerId: string, boxId: string) => void;
};

export function YahtzeeScoreboard({ players, locked, onPressBox }: Props) {
  const colWidth = players.length <= 1 ? 156 : players.length === 2 ? 124 : 96;

  return (
    <View style={styles.card}>
      <View style={[styles.grid, { height: CARD_H }]}>
        <View style={{ width: LABEL_W }}>
          <LabelCell height={HEADER_H} header>
            <Text style={styles.brand}>Score</Text>
          </LabelCell>
          {ROWS.map((row) => (
            <LabelCell key={rowKey(row)} height={rowHeight(row)} row={row}>
              <RowLabel row={row} />
            </LabelCell>
          ))}
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={{ height: CARD_H, flex: 1 }}
          contentContainerStyle={styles.columns}
        >
          {players.map((player, index) => (
            <PlayerColumn
              key={player.playerId}
              player={player}
              pip={PIPS[index % PIPS.length]}
              width={colWidth}
              locked={locked}
              onPressBox={onPressBox}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function PlayerColumn({
  player,
  pip,
  width,
  locked,
  onPressBox,
}: {
  player: PlayerCard;
  pip: string;
  width: number;
  locked: boolean;
  onPressBox: (playerId: string, boxId: string) => void;
}) {
  const you = player.isYou;
  return (
    <View style={{ width, flexGrow: 1 }}>
      <Cell height={HEADER_H} you={you} header>
        <View style={[styles.pip, { backgroundColor: pip }]} />
        <Text style={styles.playerName} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.playerMeta}>
          {player.isWinner ? 'Winner' : you ? 'You' : player.isLeader && player.grand > 0 ? 'Lead' : ' '}
        </Text>
        <Text style={styles.playerTotal}>{player.grand}</Text>
      </Cell>
      {ROWS.map((row) => {
        const height = rowHeight(row);
        if (row.kind === 'section') {
          return <Cell key={rowKey(row)} height={height} row={row} you={you} />;
        }
        const text = cellText(player, row);
        const scratch = row.kind === 'box' && player.boxes[row.box.id] === 0;
        const open = row.kind === 'box' && player.boxes[row.box.id] == null;
        const pressable = !locked && row.kind === 'box';
        const label =
          row.kind === 'box'
            ? `${row.box.label} for ${player.name}, ${open ? 'empty' : text}`
            : undefined;
        return (
          <Cell
            key={rowKey(row)}
            height={height}
            row={row}
            you={you}
            pressable={pressable}
            accessibilityLabel={label}
            onPress={() => {
              if (row.kind === 'box') onPressBox(player.playerId, row.box.id);
            }}
          >
            {row.kind === 'total' || row.kind === 'box' ? (
              <Text
                style={[
                  styles.score,
                  row.kind === 'total' && row.id === 'grand' && styles.grandScore,
                  scratch && styles.scratch,
                  open && styles.openScore,
                  row.kind === 'total' && styles.totalScore,
                ]}
              >
                {text}
              </Text>
            ) : null}
          </Cell>
        );
      })}
    </View>
  );
}

function cellText(player: PlayerCard, row: ScoreRow): string {
  if (row.kind === 'box') {
    const value = player.boxes[row.box.id];
    return value == null ? '—' : String(value);
  }
  if (row.kind !== 'total') return '';
  switch (row.id) {
    case 'upper':
      return String(player.upper);
    case 'bonus':
      return player.upperBonus ? String(UPPER_BONUS) : '—';
    case 'upperTotal':
      return String(player.upperTotal);
    case 'yahtzeeBonus':
      return player.bonusPoints ? String(player.bonusPoints) : '—';
    case 'lower':
      return String(player.lower);
    case 'grand':
      return String(player.grand);
    default:
      return '';
  }
}

function RowLabel({ row }: { row: ScoreRow }) {
  if (row.kind === 'section') {
    return <Text style={styles.sectionText}>{row.title}</Text>;
  }
  if (row.kind === 'box') {
    return (
      <View style={styles.labelBlock}>
        <Text style={styles.boxLabel} numberOfLines={1}>
          {row.box.label}
        </Text>
        <Text style={styles.boxHint} numberOfLines={1}>
          {row.box.hint}
        </Text>
      </View>
    );
  }
  const grand = row.id === 'grand';
  return (
    <View style={styles.labelBlock}>
      <Text style={[styles.boxLabel, grand && styles.grandLabel]} numberOfLines={1}>
        {row.label}
      </Text>
      {row.hint ? <Text style={[styles.boxHint, grand && styles.grandHint]}>{row.hint}</Text> : null}
    </View>
  );
}

function LabelCell({
  height,
  header,
  row,
  children,
}: {
  height: number;
  header?: boolean;
  row?: ScoreRow;
  children?: ReactNode;
}) {
  return (
    <View
      style={[
        styles.cell,
        styles.labelCell,
        { height },
        header && styles.headerCell,
        row && bandStyle(row),
      ]}
    >
      {children}
    </View>
  );
}

function Cell({
  height,
  header,
  row,
  you,
  pressable,
  onPress,
  accessibilityLabel,
  children,
}: {
  height: number;
  header?: boolean;
  row?: ScoreRow;
  you?: boolean;
  pressable?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const keepBand =
    header || row?.kind === 'section' || (row?.kind === 'total' && row.id === 'grand');
  const style = [
    styles.cell,
    { height },
    header && styles.headerCell,
    row && bandStyle(row),
    you && !keepBand && styles.youCell,
    you && header && styles.youHeader,
  ];
  if (pressable && onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [style, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={style}>{children}</View>;
}

function bandStyle(row: ScoreRow) {
  if (row.kind === 'section' && row.tone === 'upper') return styles.upperBand;
  if (row.kind === 'section' && row.tone === 'lower') return styles.lowerBand;
  if (row.kind === 'total' && row.id === 'grand') return styles.grandBand;
  if (row.kind === 'total') return styles.totalBand;
  return null;
}

function rowKey(row: ScoreRow): string {
  if (row.kind === 'section') return `section-${row.tone}`;
  if (row.kind === 'box') return row.box.id;
  return row.id;
}

export function YahtzeeScoreModal({
  visible,
  box,
  playerName,
  current,
  onClose,
  onSave,
  onClear,
}: {
  visible: boolean;
  box: YahtzeeBox | null;
  playerName?: string | null;
  current: number | null;
  onClose: () => void;
  onSave: (points: number) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !box) return;
    setDraft(current == null ? '' : String(current));
    setError(null);
  }, [visible, box, current]);

  if (!box) return null;

  const chips = chipScores(box);
  const commit = (points: number) => {
    const message = scoreError(box, points);
    if (message) {
      setError(message);
      return;
    }
    onSave(points);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close score dialog" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {playerName ? `${box.label} · ${playerName}` : box.label}
          </Text>
          <Text style={typography.subtitle}>
            {box.hint}. Enter 0 to scratch the box.
            {box.kind === 'sum' ? ' Any total from 0 to 30 is allowed.' : ''}
          </Text>
          <View style={styles.chips}>
            {chips.map((score) => {
              const selected = draft === String(score);
              return (
                <Pressable
                  key={score}
                  accessibilityRole="button"
                  accessibilityLabel={score === 0 ? 'Scratch' : String(score)}
                  onPress={() => commit(score)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {score === 0 ? 'Scratch' : score}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            value={draft}
            onChangeText={(text) => {
              setDraft(text.replace(/[^0-9]/g, '').slice(0, 2));
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="Score"
            accessibilityLabel={`${box.label} score`}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.sheetRow}>
            {current != null ? (
              <Button label="Clear" variant="danger" onPress={onClear} />
            ) : (
              <Button label="Cancel" variant="ghost" onPress={onClose} />
            )}
            <Button
              label="Save"
              variant="primary"
              onPress={() => commit(Number.parseInt(draft, 10))}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#cbb892',
    backgroundColor: PAPER,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row' },
  columns: { flexGrow: 1, flexDirection: 'row' },
  cell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAPER,
    paddingHorizontal: 6,
  },
  labelCell: {
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    backgroundColor: PAPER_ALT,
  },
  headerCell: {
    backgroundColor: UPPER,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  youCell: { backgroundColor: '#fff6dc' },
  youHeader: { backgroundColor: '#18583a' },
  upperBand: { backgroundColor: UPPER, borderColor: 'rgba(255,255,255,0.12)' },
  lowerBand: { backgroundColor: LOWER, borderColor: 'rgba(255,255,255,0.12)' },
  totalBand: { backgroundColor: PAPER_ALT },
  grandBand: { backgroundColor: GRAND, borderColor: 'rgba(255,255,255,0.08)' },
  pressed: { backgroundColor: '#f3e2b0' },
  brand: {
    fontFamily: fonts.display,
    color: '#f6f0e3',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionText: {
    fontFamily: fonts.body,
    color: '#f6f0e3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  labelBlock: { gap: 1 },
  boxLabel: {
    fontFamily: fonts.body,
    color: INK,
    fontSize: 13,
    fontWeight: '700',
  },
  boxHint: {
    fontFamily: fonts.body,
    color: INK_MUTED,
    fontSize: 11,
  },
  grandLabel: { color: '#f6f0e3', fontSize: 14 },
  grandHint: { color: 'rgba(246,240,227,0.7)' },
  pip: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  playerName: {
    fontFamily: fonts.body,
    color: '#f6f0e3',
    fontSize: 13,
    fontWeight: '800',
  },
  playerMeta: {
    fontFamily: fonts.body,
    color: 'rgba(246,240,227,0.75)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  playerTotal: {
    fontFamily: fonts.display,
    color: '#f6f0e3',
    fontSize: 16,
    fontWeight: '700',
  },
  score: {
    fontFamily: fonts.body,
    color: INK,
    fontSize: 16,
    fontWeight: '700',
  },
  totalScore: { fontWeight: '800' },
  grandScore: {
    fontFamily: fonts.display,
    color: '#f6f0e3',
    fontSize: 20,
  },
  scratch: { color: INK_MUTED },
  openScore: { color: '#c3b49a', fontWeight: '500' },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    gap: 12,
  },
  sheetTitle: { ...typography.title, fontSize: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: fonts.body,
    color: colors.text,
    fontWeight: '700',
  },
  chipTextSelected: { color: colors.accentText },
  sheetRow: { flexDirection: 'row', gap: 8 },
  error: { color: colors.danger },
});
