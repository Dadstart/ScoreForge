import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Field } from './ui';
import { colors, radii, typography } from '../theme';

type Props = {
  visible: boolean;
  maxPlayers: number;
  currentCount: number;
  onCancel: () => void;
  onAdd: (name: string) => void | Promise<void>;
};

export function AddPlayerModal({
  visible,
  maxPlayers,
  currentCount,
  onCancel,
  onAdd,
}: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setError(null);
    setBusy(false);
    onCancel();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAdd(name);
      setName('');
      setBusy(false);
      onCancel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add player');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel="Dismiss add player dialog"
        />
        <View style={styles.sheet}>
          <Text style={styles.title}>Add player</Text>
          <Text style={typography.subtitle}>
            {currentCount} of {maxPlayers} seats filled. They can also join later with the share
            code.
          </Text>
          <Field
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            placeholder="Player name"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={40}
            editable={!busy}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <Button
              label="Add"
              variant="primary"
              busy={busy}
              onPress={() => void submit()}
              style={{ flex: 1 }}
            />
            <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    gap: 12,
  },
  title: {
    ...typography.title,
    fontSize: 22,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  error: { color: colors.danger },
});
