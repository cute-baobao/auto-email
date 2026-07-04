import { TextAttributes } from '@opentui/core';
import { EmptyBorder } from '../components/border';
import { useTheme } from '../providers/theme';
import type { RunResponse } from '@hynote/shared';

const REVIEW_ITEMS = [
  { label: '确认执行', hint: 'Enter' },
  { label: '取消', hint: 'Esc' },
];

function summarize(res: RunResponse & { type: 'db-insert' | 'db-query' }): string {
  if (res.type === 'db-insert') {
    const kv = Object.entries(res.values).map(([k, v]) => `${k}='${String(v)}'`).join(', ');
    return `INSERT INTO ${res.table} VALUES (${kv})`;
  }
  if (res.query.columns && res.query.columns.length > 0) {
    return `SELECT ${res.query.columns.join(', ')} FROM ${res.table}`;
  }
  return `SELECT * FROM ${res.table}`;
}

export function ReviewCard({ res, selectedIndex }: { res: RunResponse & { type: 'db-insert' | 'db-query' }; selectedIndex: number }) {
  const { colors } = useTheme();
  return (
    <box width="100%" alignItems="center">
      <box
        border={['left']}
        borderColor={colors.primary}
        customBorderChars={{ ...EmptyBorder, vertical: '┃', bottomLeft: '╹' }}
        width="100%"
      >
        <box
          paddingX={2}
          paddingY={1}
          backgroundColor={colors.surface}
          width="100%"
          flexDirection="column"
        >
          <text fg={colors.selection} attributes={TextAttributes.DIM}>
            {`数据库操作需要确认: ${summarize(res)}`}
          </text>
          {REVIEW_ITEMS.map((item, i) => {
            const selected = i === selectedIndex;
            return (
              <box
                key={item.label}
                flexDirection="row"
                justifyContent="space-between"
                paddingX={1}
                backgroundColor={selected ? colors.selection : undefined}
              >
                <text fg={selected ? 'black' : undefined}>{item.label}</text>
                <text
                  fg={selected ? 'black' : colors.dimSeparator}
                  attributes={selected ? 0 : TextAttributes.DIM}
                >
                  {item.hint}
                </text>
              </box>
            );
          })}
        </box>
      </box>
    </box>
  );
}
