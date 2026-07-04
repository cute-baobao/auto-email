#!/usr/bin/env bun
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { Repl } from './repl';

const renderer = await createCliRenderer({
  targetFps: 30,
  exitOnCtrlC: true,
});
createRoot(renderer).render(<Repl />);
