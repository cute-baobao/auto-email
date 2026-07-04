import { TextAttributes } from '@opentui/core';
import type { StatsPanel } from '@hynote/shared';

function barFor(count: number, max: number): string {
  if (max <= 0) return '';
  const width = Math.max(1, Math.round((count / max) * 20));
  return '█'.repeat(width);
}

export function StatsView({ panels }: { panels: StatsPanel[] }) {
  if (panels.length === 0) {
    return (
      <box paddingX={1}>
        <text fg="gray">暂无统计数据</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1} paddingX={1}>
      {panels.map((panel) => {
        const max = panel.rows.reduce((m, r) => Math.max(m, r.count), 0);
        const labelWidth = panel.rows.reduce((w, r) => Math.max(w, r.label.length), 0);
        return (
          <box key={panel.title} flexDirection="column">
            <text attributes={TextAttributes.BOLD} fg="cyan">
              {panel.title}
            </text>
            {panel.rows.length === 0 ? (
              <text fg="gray">（空）</text>
            ) : (
              panel.rows.map((row) => (
                <box key={row.label} flexDirection="row" gap={1}>
                  <text fg="white">{row.label.padEnd(labelWidth)}</text>
                  <text fg="green">{barFor(row.count, max)}</text>
                  <text fg="yellow">{String(row.count)}</text>
                </box>
              ))
            )}
          </box>
        );
      })}
    </box>
  );
}
