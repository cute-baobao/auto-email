import { TextAttributes } from '@opentui/core';
import type { StatsPanel } from '@hynote/shared';
import { useTheme } from '../providers/theme';

function barFor(count: number, max: number): string {
  if (max <= 0) return '';
  const width = Math.max(1, Math.round((count / max) * 20));
  return '█'.repeat(width);
}

export function StatsView({ panels }: { panels: StatsPanel[] }) {
  const { colors } = useTheme();

  if (panels.length === 0) {
    return (
      <box paddingX={3}>
        <text attributes={TextAttributes.DIM}>暂无统计数据</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" gap={1} paddingX={3}>
      {panels.map((panel) => {
        const max = panel.rows.reduce((m, r) => Math.max(m, r.count), 0);
        const labelWidth = panel.rows.reduce((w, r) => Math.max(w, r.label.length), 0);
        return (
          <box key={panel.title} flexDirection="column">
            <text attributes={TextAttributes.BOLD} fg={colors.primary}>
              {panel.title}
            </text>
            {panel.rows.length === 0 ? (
              <text attributes={TextAttributes.DIM}>（空）</text>
            ) : (
              panel.rows.map((row) => (
                <box key={row.label} flexDirection="row" gap={1}>
                  <text>{row.label.padEnd(labelWidth)}</text>
                  <text fg={colors.primary}>{barFor(row.count, max)}</text>
                  <text attributes={TextAttributes.DIM}>{String(row.count)}</text>
                </box>
              ))
            )}
          </box>
        );
      })}
    </box>
  );
}
