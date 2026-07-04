import { useKeyboard, useRenderer } from "@opentui/react";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

type Responder = () => boolean;

export enum LayerName {
  Base = "base",
  Command = "command",
  Dialog = "dialog",
}

type KeyboardLayerContextValue = {
  push: (id: string, responder: Responder) => void;
  pop: (id: string) => void;
  isTopLayer: (id: string) => boolean;
  setResponder: (id: string, responder: Responder | null) => void;
};

const KeyboardLayerContext = createContext<KeyboardLayerContextValue | null>(
  null,
);

export function KeyboardLayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [stack, setStack] = useState<string[]>([LayerName.Base]);
  const statckRef = useRef(stack);
  statckRef.current = stack;

  const responders = useRef<Map<string, Responder>>(new Map());
  const renderer = useRenderer();

  const push = useCallback((id: string, responder?: Responder) => {
    if (responder) {
      responders.current.set(id, responder);
    }

    setStack((prev) => {
      if (prev.includes(id)) {
        return prev;
      }
      return [...prev, id];
    });
  }, []);

  const pop = useCallback((id: string) => {
    responders.current.delete(id);
    setStack((prev) => prev.filter((item) => item !== id));
  }, []);

  const isTopLayer = useCallback(
    (id: string) => stack.length === 0 || stack[stack.length - 1] === id,
    [stack],
  );

  const setResponder = useCallback(
    (id: string, responder: Responder | null) => {
      if (responder) {
        responders.current.set(id, responder);
      } else {
        responders.current.delete(id);
      }
    },
    [],
  );
  // 处理 ctrl + c的情况
  useKeyboard((key) => {
    if (!key.ctrl || key.name !== "c") return;

    const currentStack = statckRef.current;
    for (let i = currentStack.length - 1; i >= 0; i--) {
      const layerId = currentStack[i]!;
      const responder = responders.current.get(layerId);
      if (responder && responder()) {
        return;
      }
    }
    renderer.destroy();
  });

  return (
    <KeyboardLayerContext.Provider
      value={{ push, pop, isTopLayer, setResponder }}
    >
      {children}
    </KeyboardLayerContext.Provider>
  );
}

export function useKeyboardLayer() {
  const context = useContext(KeyboardLayerContext);
  if (!context) {
    throw new Error(
      "useKeyboardLayer must be used within a KeyboardLayerProvider",
    );
  }
  return context;
}
