import type { RunResponse } from '@hynote/shared';

// Whether to enter the confirm/copy flow: only a real reply (reply with a non-empty template).
export function shouldConfirm(res: RunResponse): boolean {
  return res.type === 'reply' && res.template.trim().length > 0;
}
