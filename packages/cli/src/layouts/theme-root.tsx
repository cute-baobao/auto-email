import { useTheme } from "../providers/theme";

type ThemeLayoutProps = {
  children?: React.ReactNode;
};

export function ThemeRoot({ children }: ThemeLayoutProps) {
  const { colors } = useTheme();
  return (
    <>
      <box
        backgroundColor={colors.background}
        width="100%"
        height="100%"
        gap={2}
      >
        {children}
      </box>
    </>
  );
}
