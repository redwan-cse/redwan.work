'use client';

import type { ReactNode } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';

export function AppMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
