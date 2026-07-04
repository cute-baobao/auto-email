#!/usr/bin/env bun
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RootLayout } from './layouts/root-layout';
import { Repl } from './screens/repl';

const router = createMemoryRouter([
  { path: '/', element: <RootLayout />, children: [{ index: true, element: <Repl /> }] },
]);

const renderer = await createCliRenderer({ targetFps: 60, exitOnCtrlC: false });
createRoot(renderer).render(<RouterProvider router={router} />);
