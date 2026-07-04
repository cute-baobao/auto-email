import { createContext, useCallback, useContext, useState } from "react";
import type { DialogConfig } from "./types";
import { LayerName, useKeyboardLayer } from "../keyboard-layer";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { RGBA, TextAttributes } from "@opentui/core";
import { useTheme } from "../theme";

export type DialogContextValue = {
  open: (config: DialogConfig) => void;
  close: () => void;
};

type DialogProviderProps = {
  children: React.ReactNode;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: DialogProviderProps) {
  const [currentDialog, setCurrentDialog] = useState<DialogConfig | null>(null);
  const { pop, push } = useKeyboardLayer();

  const close = useCallback(() => {
    setCurrentDialog(null);
    pop(LayerName.Dialog);
  }, [pop]);

  const open = useCallback(
    (config: DialogConfig) => {
      setCurrentDialog(config);
      push(LayerName.Dialog, () => {
        close();
        return true;
      });
    },
    [push, close],
  );

  const value: DialogContextValue = {
    open,
    close,
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Dialog close={close} currentDialog={currentDialog} />
    </DialogContext.Provider>
  );
}

type DialogProps = {
  currentDialog: DialogConfig | null;
  close: () => void;
};

function Dialog({ currentDialog, close }: DialogProps) {
  const { isTopLayer } = useKeyboardLayer();
  const dimensions = useTerminalDimensions();
  const { colors } = useTheme();

  useKeyboard((key) => {
    if (!currentDialog || !isTopLayer(LayerName.Dialog)) return;

    if (key.name === "escape") {
      close();
    }
  });

  if (!currentDialog) return null;

  const { title, children } = currentDialog;

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width={dimensions.width}
      height={dimensions.height}
      justifyContent="center"
      alignItems="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      zIndex={100}
      onMouseDown={close}
    >
      <box
        width={Math.min(60, dimensions.width - 4)}
        backgroundColor={colors.dialogSurface}
        paddingX={4}
        paddingY={1}
        flexDirection="column"
        gap={1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <box
          paddingBottom={1}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
        >
          <text attributes={TextAttributes.BOLD}>{title}</text>
          <text attributes={TextAttributes.DIM} onMouseDown={() => close()}>
            esc
          </text>
        </box>
        <box flexGrow={1}>{children}</box>
      </box>
    </box>
  );
}

export function useDialog() {
  const value = useContext(DialogContext);
  if (!value) {
    throw new Error("useDialogContext must be used within a DialogProvider");
  }
  return value;
}
