'use client';

import Link from 'next/link';
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { adpubTheme } from '@/astryx-theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Theme theme={adpubTheme}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  );
}
