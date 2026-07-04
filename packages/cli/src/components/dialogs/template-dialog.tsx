import { useCallback } from 'react';
import { useDialog } from '../../providers/dialog';
import { DialogSearchList } from '../dialog-search-list';

type Template = { name: string; body: string };

export function TemplatePicker({
  templates,
  onPick,
}: {
  templates: Template[];
  onPick: (t: Template) => void;
}) {
  const { close } = useDialog();

  const handleSelect = useCallback(
    (template: Template) => {
      onPick(template);
      close();
    },
    [onPick, close],
  );

  return (
    <DialogSearchList
      items={templates}
      onSelect={handleSelect}
      filterFn={(t, q) => t.name.toLowerCase().includes(q.toLowerCase())}
      renderItem={(template, isSelected) => (
        <text selectable={false} fg={isSelected ? 'black' : 'white'}>
          {template.name}
        </text>
      )}
      getKey={(template) => template.name}
      placeholder="Search templates..."
      emptyText="No matching templates"
    />
  );
}
