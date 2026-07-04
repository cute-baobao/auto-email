import { TextAttributes } from '@opentui/core';

export interface ProgressState {
  reasoning: string;
  text: string;
  tools: { name: string; done: boolean }[];
}

export function ProgressView({ state }: { state: ProgressState }) {
  const hasAny = state.reasoning || state.text || state.tools.length > 0;
  if (!hasAny) return null;
  return (
    <box flexDirection="column" paddingX={1}>
      {state.reasoning ? (
        <box borderStyle="single" borderColor="gray" paddingX={1}>
          <text fg="gray" attributes={TextAttributes.DIM}>{`Thinking: ${state.reasoning}`}</text>
        </box>
      ) : null}
      {state.tools.map((t, i) => (
        <text key={`${i}-${t.name}`} fg="cyan">{`▸ ${t.name}${t.done ? ' ✓' : ' …'}`}</text>
      ))}
      {state.text ? <text fg="white">{state.text}</text> : null}
    </box>
  );
}
