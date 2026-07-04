import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_TOAST_DURATION,
  type ToastOptions,
  type ToastVariant,
} from "./types";
import { SplitBorderChars } from "../../components/border";
import { useTheme } from "../theme";
import { useContentFill } from "../../lib/use-content-fill";

export type ToastContextType = {
  show: (options: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return value;
}

type ToastProviderProps = {
  children: React.ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const timeoutHandleRef = useRef<NodeJS.Timeout | null>(null);

  const clearCurrentTimeout = useCallback(() => {
    if (timeoutHandleRef.current) {
      clearTimeout(timeoutHandleRef.current);
      timeoutHandleRef.current = null;
    }
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const duration = options.duration ?? DEFAULT_TOAST_DURATION;
      clearCurrentTimeout();
      setCurrentToast({
        variant: options.variant || "info",
        ...options,
        duration,
      });
      timeoutHandleRef.current = setTimeout(() => {
        setCurrentToast(null);
        clearCurrentTimeout();
      }, duration).unref();
    },
    [clearCurrentTimeout],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast currentToast={currentToast} />
    </ToastContext.Provider>
  );
}

type ToastProps = {
  currentToast: ToastOptions | null;
};

function Toast({ currentToast }: ToastProps) {
  const { colors } = useTheme();

  if (!currentToast) return null;
  const paddingLeft = 2;
  const paddingRight = 2;
  const paddingTop = 1;
  const paddingBottom = 1;

  const {
    lines,
    textWidth,
    boxWidth,
    boxHeight,
    maxBoxWidth,
  } = useContentFill({
    message: currentToast.message,
    maxWidth: 60,
    maxHeightRatio: 0.5,
    outerPadding: 6,
    borderLeft: 1,
    borderRight: 1,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    minHeight: 3,
    useEllipsis: true,
  });

  const variantColors: Record<ToastVariant, string> = {
    success: colors.success,
    error: colors.error,
    info: colors.info,
  };

  const borderColor = currentToast.variant
    ? variantColors[currentToast.variant]
    : variantColors.info;

  return (
    <box
      position="absolute"
      justifyContent="center"
      alignItems="flex-start"
      top={2}
      right={2}
      width={boxWidth}
      maxWidth={maxBoxWidth}
      height={boxHeight}
      paddingLeft={paddingLeft}
      paddingRight={paddingRight}
      paddingTop={paddingTop}
      paddingBottom={paddingBottom}
      backgroundColor={colors.surface}
      border={["left", "right"]}
      borderColor={borderColor}
      customBorderChars={SplitBorderChars}
    >
      <text fg="#E1E1E1" wrapMode="word" width={textWidth}>
        {lines.join("\n")}
      </text>
    </box>
  );
}

