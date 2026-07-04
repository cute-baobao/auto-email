import { useTheme } from '../providers/theme';
import 'opentui-spinner/react';

export function Spinner() {
  const { colors } = useTheme();
  return <spinner name="aesthetic" color={colors.primary} />;
}
