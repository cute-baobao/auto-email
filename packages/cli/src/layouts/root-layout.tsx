import { Outlet } from 'react-router';
import { ThemeProvider } from '../providers/theme';
import { KeyboardLayerProvider } from '../providers/keyboard-layer';
import { ToastProvider } from '../providers/toast';
import { DialogProvider } from '../providers/dialog';
import { ThemeRoot } from './theme-root';

export function RootLayout() {
  return (
    <ThemeProvider>
      <KeyboardLayerProvider>
        <ToastProvider>
          <DialogProvider>
            <ThemeRoot>
              <Outlet />
            </ThemeRoot>
          </DialogProvider>
        </ToastProvider>
      </KeyboardLayerProvider>
    </ThemeProvider>
  );
}
