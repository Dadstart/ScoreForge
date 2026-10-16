import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import diceRollWav from '../../assets/sounds/dice-roll.wav';
import { getSettings } from '../storage/settingsStore';

let player: AudioPlayer | null = null;
let modeSet = false;

function playerForRoll(): AudioPlayer {
  if (!modeSet && Platform.OS !== 'web') {
    modeSet = true;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
  }
  if (!player) {
    player = createAudioPlayer(diceRollWav);
    if (Platform.OS !== 'web') player.volume = 0.9;
  }
  return player;
}

/** Load the rattle so the first roll does not wait on the file. */
export function prepareDiceRoll(): void {
  try {
    playerForRoll();
  } catch {
    // The roll still happens if the sound cannot be loaded.
  }
}

/** Play the dice rattle. Call this from the roll tap so iPhone allows the sound. */
export function playDiceRoll(): void {
  if (!getSettings().soundEffects) return;
  try {
    const current = playerForRoll();
    void current.seekTo(0);
    current.play();
  } catch {
    // The roll still happens if the sound cannot start.
  }
}

/** Stop a rattle that is already playing. */
export function stopDiceRoll(): void {
  try {
    player?.pause();
  } catch {
    // The player is already quiet.
  }
}
