import { TextAttributes } from '@opentui/core';

export interface TemplatePickerProps {
  templates: { name: string; body: string }[];
}

export function TemplatePicker({ templates }: TemplatePickerProps) {
  return (
    <box flexDirection="column" paddingX={1}>
      <text fg="yellow" attributes={TextAttributes.BOLD}>
        AI 不可用，请手动选择模板：
      </text>
      {templates.map((t, i) => (
        <box key={t.name} flexDirection="row" gap={1}>
          <text fg="cyan">{`${i + 1}.`}</text>
          <text fg="white">{t.name}</text>
        </box>
      ))}
      <text fg="gray" attributes={TextAttributes.DIM}>
        输入序号并回车选择 · Ctrl+N 取消
      </text>
    </box>
  );
}
