'use client';

import type { ReactNode, MouseEvent } from 'react';
import { useRef } from 'react';
import Image from 'next/image';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';
import { cn } from '@/lib/utils';

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function HeroReveal({
  children,
  className,
  delayChildren = 0.06,
  staggerChildren = 0.08,
}: {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: {
          transition: {
            delayChildren,
            staggerChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function HeroRevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
        visible: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: 0.56, ease: EASE_OUT_EXPO },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function HeroPortrait({
  src,
  alt,
  caption,
  badgeText = 'C|EH · CCEP · CNSP · CAP',
}: {
  src: string;
  alt: string;
  caption?: string;
  badgeText?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.68, delay: prefersReducedMotion ? 0 : 0.14, ease: EASE_OUT_EXPO }}
      className="group relative mx-auto flex flex-col items-center"
    >
      <div className="relative flex items-center justify-center">
        {/* Outer reactive blue outline halo — responds to hover while image stays unchanged */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-3 rounded-full border border-primary/25 bg-primary/5 opacity-75 blur-[1px] transition-all duration-500 ease-out group-hover:-inset-4 group-hover:border-primary/65 group-hover:bg-primary/10 group-hover:shadow-[0_0_44px_-6px_oklch(from_var(--primary)_l_c_h_/_0.42)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1.5 rounded-full border border-border/80 transition-colors duration-300 group-hover:border-primary/80"
        />

        {/* Circular photograph — remains completely unchanged on hover */}
        <div className="relative h-52 w-52 overflow-hidden rounded-full border-2 border-background bg-muted shadow-xl sm:h-72 sm:w-72">
          <Image
            src={src}
            alt={alt}
            fill
            priority
            sizes="(max-width: 640px) 240px, 288px"
            className="object-cover object-top"
          />
        </div>

        {/* Floating verified badge */}
        <div className="absolute -bottom-2.5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/95 px-3.5 py-1 text-xs font-medium text-foreground shadow-md backdrop-blur-md transition-colors duration-300 group-hover:border-primary/60">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="font-mono tracking-tight">{badgeText}</span>
        </div>
      </div>

      {caption ? (
        <p className="mt-5 text-center text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </motion.div>
  );
}

export function InteractiveCard({
  children,
  className,
  enableTilt = true,
  id,
}: {
  children: ReactNode;
  className?: string;
  enableTilt?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(50);

  const springRotateX = useSpring(rotateX, { stiffness: 220, damping: 24, mass: 0.45 });
  const springRotateY = useSpring(rotateY, { stiffness: 220, damping: 24, mass: 0.45 });

  const borderHighlight = useMotionTemplate`radial-gradient(320px circle at ${glowX}% ${glowY}%, oklch(from var(--primary) l c h / 0.16), transparent 75%)`;

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    glowX.set(Math.round(px * 100));
    glowY.set(Math.round(py * 100));

    if (enableTilt) {
      const maxTilt = 2.2;
      rotateX.set((0.5 - py) * maxTilt * 2);
      rotateY.set((px - 0.5) * maxTilt * 2);
    }
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      id={id}
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={prefersReducedMotion ? undefined : { y: -4 }}
      transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
      style={
        prefersReducedMotion || !enableTilt
          ? undefined
          : {
              rotateX: springRotateX,
              rotateY: springRotateY,
              transformPerspective: 1000,
            }
      }
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-xs transition-[border-color,box-shadow] duration-300 hover:border-primary/45 hover:shadow-md',
        className
      )}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: borderHighlight }}
      />
      <div className="relative z-10 flex h-full w-full flex-col justify-between">{children}</div>
    </motion.div>
  );
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: EASE_OUT_EXPO }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
