'use client';

import { useEffect, useRef } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'motion/react';

interface MicroDash {
  x: number;
  y: number;
  baseVx: number;
  baseVy: number;
  vx: number;
  vy: number;
  length: number;
  thickness: number;
  angle: number;
  color: string;
  alpha: number;
  phase: number;
}

const PALETTE = [
  '59, 130, 246',  // blue-500
  '37, 99, 235',   // blue-600
  '99, 102, 241',  // indigo-500
  '124, 58, 237',  // violet-600
  '14, 165, 233',  // sky-500
];

export function AntigravityHeroField() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const pointerX = useMotionValue(520);
  const pointerY = useMotionValue(260);
  const smoothX = useSpring(pointerX, { stiffness: 140, damping: 26, mass: 0.5 });
  const smoothY = useSpring(pointerY, { stiffness: 140, damping: 26, mass: 0.5 });

  const ambientSpotlight = useMotionTemplate`radial-gradient(640px circle at ${smoothX}px ${smoothY}px, oklch(from var(--primary) l c h / 0.14), transparent 72%)`;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let animationFrameId = 0;
    let isVisible = true;
    const mouse = { x: -1000, y: -1000, active: false };
    let dashes: MicroDash[] = [];

    const createDashes = (w: number, h: number): MicroDash[] => {
      const area = w * h;
      const count = Math.min(82, Math.max(36, Math.floor(area / 18000)));
      const list: MicroDash[] = [];
      for (let i = 0; i < count; i++) {
        const speed = 0.14 + Math.random() * 0.26;
        const baseAngle = -Math.PI / 5 + (Math.random() - 0.5) * 0.45;
        list.push({
          x: Math.random() * w,
          y: Math.random() * h,
          baseVx: Math.cos(baseAngle) * speed,
          baseVy: Math.sin(baseAngle) * speed,
          vx: Math.cos(baseAngle) * speed,
          vy: Math.sin(baseAngle) * speed,
          length: 4.5 + Math.random() * 5.5,
          thickness: 1.8 + Math.random() * 1.4,
          angle: baseAngle,
          color: PALETTE[i % PALETTE.length],
          alpha: 0.16 + Math.random() * 0.34,
          phase: Math.random() * Math.PI * 2,
        });
      }
      return list;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dashes = createDashes(width, height);
    };

    resize();

    const drawStaticFrame = () => {
      ctx.clearRect(0, 0, width, height);
      for (const d of dashes) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = `rgba(${d.color}, ${d.alpha * 0.75})`;
        ctx.beginPath();
        ctx.roundRect(-d.length / 2, -d.thickness / 2, d.length, d.thickness, d.thickness / 2);
        ctx.fill();
        ctx.restore();
      }
    };

    if (prefersReducedMotion) {
      drawStaticFrame();
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }

    let tick = 0;
    const render = () => {
      if (!isVisible) return;
      tick += 0.015;
      ctx.clearRect(0, 0, width, height);

      for (const d of dashes) {
        const floatX = Math.cos(tick + d.phase) * 0.06;
        const floatY = Math.sin(tick + d.phase) * 0.06;

        let targetVx = d.baseVx + floatX;
        let targetVy = d.baseVy + floatY;

        if (mouse.active) {
          const dx = d.x - mouse.x;
          const dy = d.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          const influenceRadius = 210;
          if (distSq < influenceRadius * influenceRadius && distSq > 4) {
            const dist = Math.sqrt(distSq);
            const factor = (1 - dist / influenceRadius) * 0.85;
            // Gentle antigravity tangential + radial lift
            targetVx += (dx / dist) * factor * 0.55 - (dy / dist) * factor * 0.25;
            targetVy += (dy / dist) * factor * 0.55 + (dx / dist) * factor * 0.25;
          }
        }

        d.vx += (targetVx - d.vx) * 0.08;
        d.vy += (targetVy - d.vy) * 0.08;
        d.x += d.vx;
        d.y += d.vy;

        // Smoothly orient dash along velocity vector
        const desiredAngle = Math.atan2(d.vy, d.vx);
        const angleDiff = Math.atan2(
          Math.sin(desiredAngle - d.angle),
          Math.cos(desiredAngle - d.angle)
        );
        d.angle += angleDiff * 0.08;

        // Wrap around edges seamlessly
        if (d.x < -20) d.x = width + 20;
        if (d.x > width + 20) d.x = -20;
        if (d.y < -20) d.y = height + 20;
        if (d.y > height + 20) d.y = -20;

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.angle);
        ctx.fillStyle = `rgba(${d.color}, ${d.alpha})`;
        ctx.beginPath();
        ctx.roundRect(-d.length / 2, -d.thickness / 2, d.length, d.thickness, d.thickness / 2);
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = window.requestAnimationFrame(render);
    };

    animationFrameId = window.requestAnimationFrame(render);

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      if (localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height) {
        pointerX.set(localX);
        pointerY.set(localY);
        mouse.x = localX;
        mouse.y = localY;
        mouse.active = true;
      } else {
        mouse.active = false;
      }
    };

    const handlePointerLeave = () => {
      mouse.active = false;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const nowVisible = entry?.isIntersecting ?? true;
        if (nowVisible && !isVisible) {
          isVisible = true;
          animationFrameId = window.requestAnimationFrame(render);
        } else if (!nowVisible) {
          isVisible = false;
          window.cancelAnimationFrame(animationFrameId);
        }
      },
      { threshold: 0.05 }
    );

    observer.observe(container);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      isVisible = false;
      window.cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [pointerX, pointerY, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-hero-field=""
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      {!prefersReducedMotion && (
        <motion.div
          className="absolute inset-0 transition-opacity duration-500"
          style={{ background: ambientSpotlight }}
        />
      )}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-90" />
    </div>
  );
}
