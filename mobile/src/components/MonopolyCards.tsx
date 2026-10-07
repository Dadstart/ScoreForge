import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { cardCopy, type CardDeck } from '../domain/monopolyCards';
import { TRACK_DEPTH } from '../domain/monopolyBoard';
import { fonts } from '../theme';
import { diceMotionMs } from './MonopolyDice';

/** How long the token waits on the card square before following the instruction. */
export const CARD_REVEAL_MS = 1900;

const FLIP_MS = 720;
const PILE_ANGLE = 34;
const LAYERS = 4;

type FaceCard = { deck: CardDeck; id: string; nonce: number };

type Props = {
  boardSize: number;
  chanceCount: number;
  chestCount: number;
  face: FaceCard | null;
};

export function MonopolyCardTable({ boardSize, chanceCount, chestCount, face }: Props) {
  const center = boardSize * (1 - 2 * TRACK_DEPTH);
  const origin = boardSize * TRACK_DEPTH;
  const pileWidth = Math.max(72, center * 0.16);
  const pileHeight = pileWidth / 0.68;
  const inset = center * 0.075;
  const pileTop = (center - pileHeight) / 2;

  return (
    <View
      pointerEvents="none"
      style={[styles.table, { left: origin, top: origin, width: center, height: center }]}
    >
      <CardPile deck="chest" count={chestCount} width={pileWidth} height={pileHeight} left={inset} top={pileTop} angle={-PILE_ANGLE} />
      <CardPile
        deck="chance"
        count={chanceCount}
        width={pileWidth}
        height={pileHeight}
        left={center - inset - pileWidth}
        top={pileTop}
        angle={PILE_ANGLE}
      />
      {face ? (
        <FlippedCard
          key={face.nonce}
          deck={face.deck}
          id={face.id}
          center={center}
          pileWidth={pileWidth}
          pileHeight={pileHeight}
          pileLeft={face.deck === 'chance' ? center - inset - pileWidth : inset}
          pileTop={pileTop}
          angle={face.deck === 'chance' ? PILE_ANGLE : -PILE_ANGLE}
        />
      ) : null}
    </View>
  );
}

function CardPile({
  deck,
  count,
  width,
  height,
  left,
  top,
  angle,
}: {
  deck: CardDeck;
  count: number;
  width: number;
  height: number;
  left: number;
  top: number;
  angle: number;
}) {
  const layers = Math.max(1, Math.min(LAYERS, count));
  return (
    <View
      accessibilityLabel={deck === 'chance' ? 'Chance deck' : 'Community Chest deck'}
      style={[styles.pile, { left, top, width, height, transform: [{ rotate: `${angle}deg` }] }]}
    >
      {Array.from({ length: layers }, (_, layer) => {
        const depth = layers - 1 - layer;
        return (
          <View
            key={depth}
            style={[styles.layer, { transform: [{ translateX: depth * 3 }, { translateY: depth * 4 }] }]}
          >
            <CardBack deck={deck} width={width} height={height} />
          </View>
        );
      })}
    </View>
  );
}

function FlippedCard({
  deck,
  id,
  center,
  pileWidth,
  pileHeight,
  pileLeft,
  pileTop,
  angle,
}: {
  deck: CardDeck;
  id: string;
  center: number;
  pileWidth: number;
  pileHeight: number;
  pileLeft: number;
  pileTop: number;
  angle: number;
}) {
  const copy = cardCopy(deck, id);
  const motion = diceMotionMs() > 0;
  const progress = useRef(new Animated.Value(motion ? 0 : 1)).current;
  const [showFace, setShowFace] = useState(!motion);
  const faceWidth = Math.max(120, center * 0.34);
  const faceHeight = faceWidth / 0.68;
  const pileCenterX = pileLeft + pileWidth / 2;
  const pileCenterY = pileTop + pileHeight / 2;
  const faceCenterX = center / 2;
  const faceCenterY = center / 2;

  useEffect(() => {
    if (!motion) return;
    progress.setValue(0);
    let facing = false;
    const listener = progress.addListener(({ value }) => {
      const next = value >= 0.5;
      if (next === facing) return;
      facing = next;
      setShowFace(next);
    });
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: FLIP_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      progress.removeListener(listener);
      animation.stop();
    };
  }, [motion, progress]);

  const left = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [pileCenterX - faceWidth / 2, faceCenterX - faceWidth / 2],
  });
  const top = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [pileCenterY - faceHeight / 2, faceCenterY - faceHeight / 2],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [pileWidth / faceWidth, 1],
  });
  const spin = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '90deg', '0deg'],
  });
  const straighten = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [`${angle}deg`, '0deg'],
  });

  return (
    <Animated.View
      accessibilityLabel={`${copy.name}. ${copy.text}`}
      style={[
        styles.flipping,
        {
          left,
          top,
          width: faceWidth,
          height: faceHeight,
          transform: [{ perspective: 900 }, { rotate: straighten }, { rotateY: spin }, { scale }],
        },
      ]}
    >
      {showFace ? (
        <CardFront deck={deck} text={copy.text} name={copy.name} width={faceWidth} height={faceHeight} />
      ) : (
        <CardBack deck={deck} width={faceWidth} height={faceHeight} />
      )}
    </Animated.View>
  );
}

function CardBack({ deck, width, height }: { deck: CardDeck; width: number; height: number }) {
  const chance = deck === 'chance';
  const radius = Math.round(width * 0.07);
  return (
    <View
      style={[
        styles.back,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: chance ? '#e06a1f' : '#1d4f92',
        },
      ]}
    >
      <View style={[styles.backInner, { borderRadius: Math.max(4, radius - 4) }]}>
        {chance ? (
          <Text style={[styles.mark, { fontSize: width * 0.52, lineHeight: width * 0.56 }]}>?</Text>
        ) : (
          <ChestGlyph size={width * 0.42} />
        )}
        <Text style={[styles.backName, { fontSize: Math.max(8, width * 0.09), lineHeight: Math.max(10, width * 0.11) }]}>
          {chance ? 'CHANCE' : 'COMMUNITY\nCHEST'}
        </Text>
      </View>
    </View>
  );
}

function CardFront({
  deck,
  name,
  text,
  width,
  height,
}: {
  deck: CardDeck;
  name: string;
  text: string;
  width: number;
  height: number;
}) {
  const long = text.length > 120;
  const body = Math.max(11, Math.round(height * (long ? 0.046 : 0.055)));
  const radius = Math.round(width * 0.06);
  return (
    <View style={[styles.front, { width, height, borderRadius: radius }]}>
      <View style={[styles.band, { backgroundColor: deck === 'chance' ? '#e06a1f' : '#1d4f92' }]}>
        <Text style={[styles.bandText, { fontSize: Math.max(11, Math.round(height * 0.055)) }]}>{name.toUpperCase()}</Text>
      </View>
      <Text style={[styles.frontText, { fontSize: body, lineHeight: Math.round(body * 1.28) }]}>{text}</Text>
    </View>
  );
}

function ChestGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size * 0.82} viewBox="0 0 64 52">
      <Path d="M8 20h48v24a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6V20z" fill="#f6e7c1" />
      <Path d="M6 20c0-8 10-14 26-14s26 6 26 14v4H6v-4z" fill="#f3d48a" />
      <Rect x="28" y="24" width="8" height="10" rx="1.5" fill="#8a5a22" />
      <Path d="M6 30h52" stroke="#c4a46a" strokeWidth="3" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  table: {
    position: 'absolute',
    zIndex: 12,
  },
  pile: {
    position: 'absolute',
  },
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  flipping: {
    position: 'absolute',
    zIndex: 8,
  },
  back: {
    borderWidth: 2,
    borderColor: '#f6e7c1',
    padding: 5,
    shadowColor: '#0c1612',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  backInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255, 248, 234, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  mark: {
    fontFamily: fonts.display,
    color: '#fff8ea',
    fontWeight: '700',
    textAlign: 'center',
  },
  backName: {
    fontFamily: fonts.display,
    color: '#fff8ea',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  front: {
    backgroundColor: '#fbf6ea',
    borderWidth: 2,
    borderColor: '#1a1408',
    overflow: 'hidden',
    shadowColor: '#0c1612',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  band: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  bandText: {
    fontFamily: fonts.display,
    color: '#fff8ea',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
  },
  frontText: {
    flex: 1,
    fontFamily: fonts.body,
    color: '#1a1408',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
