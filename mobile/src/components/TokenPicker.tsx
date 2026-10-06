import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PLAYER_TOKENS, emojiFieldValue, playerToken, singleEmoji } from '../domain/monopoly';
import { colors, fonts, radii, typography } from '../theme';
import { Field } from './ui';

const INITIAL_TOKEN = 'initial';

type Props = {
  value: string;
  text: string;
  taken: string[];
  onChange: (value: string) => void;
  onText: (text: string) => void;
};

export function TokenPicker({ value, text, taken, onChange, onText }: Props) {
  const takenMarks = new Set(taken);
  const presetId = PLAYER_TOKENS.find((token) => token.id === value)?.id;

  return (
    <View style={styles.wrap}>
      <Text style={typography.section}>Token</Text>
      <View style={styles.pieces}>
        {PLAYER_TOKENS.map((token) => {
          const active = !text.trim() && presetId === token.id;
          const unavailable = takenMarks.has(token.emoji) && !active;
          return (
            <Pressable
              key={token.id}
              accessibilityRole="button"
              accessibilityLabel={token.label}
              accessibilityState={{ selected: active, disabled: unavailable }}
              disabled={unavailable}
              onPress={() => {
                onText('');
                onChange(token.id);
              }}
              style={[styles.piece, active && styles.pieceActive, unavailable && styles.pieceTaken]}
            >
              <Text style={styles.emoji}>{token.emoji}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field
        value={text}
        onChangeText={(next) => {
          const shown = emojiFieldValue(next);
          const emoji = singleEmoji(shown);
          const piece = emoji ? playerToken(emoji) : null;
          if (piece && piece.label !== 'Custom' && !takenMarks.has(piece.emoji)) {
            onText('');
            onChange(piece.id);
            return;
          }
          onText(shown);
          if (piece) {
            onChange(piece.id);
            return;
          }
          if (!shown.trim() && !presetId) onChange(INITIAL_TOKEN);
        }}
        placeholder="Any emoji"
        accessibilityLabel="Custom token emoji"
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        maxLength={32}
        style={styles.field}
      />
      <Text style={styles.hint}>Or any emoji from your keyboard</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', gap: 6 },
  pieces: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  piece: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pieceActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pieceTaken: { opacity: 0.35 },
  emoji: { fontSize: 20, lineHeight: 24 },
  field: {
    alignSelf: 'stretch',
    minHeight: 40,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 22,
  },
  hint: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
  },
});
