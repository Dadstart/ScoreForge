import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { contrastInk, splitPropertyMentions } from '../domain/opoly';

/** A property name filled with the color of its space on the board. */
export function PropertyName({
  name,
  swatch,
  style,
}: {
  name: string;
  swatch: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.name, { backgroundColor: swatch, color: contrastInk(swatch) }, style]}>{name}</Text>
  );
}

/** Body copy with each property name filled in that space's board color. */
export function PropertyMentions({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const parts = splitPropertyMentions(text);
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        part.property ? (
          <PropertyName key={`${index}:${part.text}`} name={part.text} swatch={part.property.swatch} />
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  name: {
    fontWeight: '800',
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
