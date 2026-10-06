import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme';
import { HeaderIconButton } from './HeaderIconButton';

export function HomeButton({ onPress }: { onPress: () => void }) {
  return (
    <HeaderIconButton label="Home" onPress={onPress}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M4 11.2 12 4.5l8 6.7V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1v-8.8Z"
          stroke={colors.accent}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
    </HeaderIconButton>
  );
}
