"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

/**
 * The Hired mark, as an object rather than a picture of one.
 *
 * Same geometry as `hired-mark.tsx` — the 64-unit grid, bar height 10.9%, gap
 * 7%, longest bar 50%, corner radius 23.4% — but built out of real elements on
 * a `preserve-3d` stage, so it has a side, catches a highlight, and turns
 * towards whoever is pointing at it. This is the front door's mark; the flat
 * SVG stays the mark everywhere inside the app, where a logo that moves when
 * you pass the cursor over it would be a distraction rather than a welcome.
 *
 * How the depth is made: there is no WebGL here and no dependency added for
 * one. The slab is LAYERS copies of the same rounded square, each a fraction
 * of a pixel further back, which is what gives the silhouette a milled edge
 * that survives the corner radius — four rotated side walls would not, and a
 * real 3D library is three hundred kilobytes to draw eight rectangles. Each
 * layer carries a vertical gradient rather than a flat colour, so the sliver of
 * it that shows reads as a lit bevel.
 *
 * The three bars are separate slabs floating above the face. They arrive in
 * order, shortest first, each growing from its left edge: the mark's meaning is
 * the record getting longer, and this is that sentence said out loud.
 *
 * Colour comes from the same two tokens the flat mark uses, so it inverts with
 * the theme. `--mark-edge` is the third, defined per theme in globals.css,
 * because a slab's side has to be lighter than a near-black face and darker
 * than a near-white one — the same value cannot do both.
 */

/** Bars as [x, y, width] on the 64-unit grid. Height and radius are shared. */
const BARS = [
  [16, 17, 13],
  [16, 28.5, 22.5],
  [16, 40, 32],
] as const;

const BAR_H = 7;
const BAR_R = 1.5;
const TILE_R = 15;

/** Slices through the slab. More is smoother and costs a div each. */
const LAYERS = 24;

/**
 * How the mark stands when nobody is pointing at it.
 *
 * Not square-on. A slab photographed head-on is a rounded rectangle with a
 * story about depth; a slab turned twenty degrees is obviously an object,
 * before anything moves at all. The pointer adds to this rather than replacing
 * it, so the mark never flattens out.
 */
const REST_Y = -24;
const REST_X = 13;

export function HiredMark3D({
  size = 96,
  className,
  /** How far the mark leans when the pointer is at the edge of its field. */
  tilt = 12,
}: {
  size?: number;
  className?: string;
  tilt?: number;
}) {
  const calm = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);

  // Where the pointer is, as -1..1 across the field. The springs are what stop
  // the mark snapping: it leads the cursor slightly and settles behind it.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 140, damping: 16, mass: 0.7 });
  const sy = useSpring(py, { stiffness: 140, damping: 16, mass: 0.7 });

  const rotateY = useTransform(sx, (v) => REST_Y + v * tilt);
  const rotateX = useTransform(sy, (v) => REST_X - v * tilt);

  // The highlight rides the far side of the tilt, the way a light source fixed
  // above the page would. Shadow goes the other way, and softens as it lifts.
  const sheen = useTransform(
    [sx, sy],
    ([x, y]: number[]) =>
      `radial-gradient(58% 52% at ${34 - x * 30}% ${24 - y * 22}%, oklch(1 0 0 / 0.16), oklch(1 0 0 / 0.04) 40%, transparent 66%)`,
  );
  const shadowX = useTransform(sx, (v) => v * size * 0.1);
  const shadowY = useTransform(sy, (v) => v * size * 0.06);

  /**
   * A pointer anywhere in the region gets a response, not just one on the mark
   * itself — a 96px target you have to hit exactly is a target most people
   * never find. The field is the nearest positioned ancestor, so a card can
   * opt its whole surface in by being `relative`.
   *
   * On top of that, a drift so slow it reads as the object being lit rather
   * than as an animation: half a degree either way over about twelve seconds.
   * It is the one thing on this page that never stops, and it stops for anyone
   * who has asked their system to calm down.
   */
  useEffect(() => {
    if (calm) return;
    const el = host.current;
    if (!el) return;
    const field = el.offsetParent instanceof HTMLElement ? el.offsetParent : el;

    let pointer = { x: 0, y: 0 };
    let frame = 0;
    const start = performance.now();

    const onMove = (event: PointerEvent) => {
      const box = field.getBoundingClientRect();
      if (!box.width || !box.height) return;
      pointer = {
        x: clamp(((event.clientX - box.left) / box.width) * 2 - 1),
        y: clamp(((event.clientY - box.top) / box.height) * 2 - 1),
      };
    };
    const onLeave = () => {
      pointer = { x: 0, y: 0 };
    };

    const tick = (now: number) => {
      const t = (now - start) / 1000;
      px.set(pointer.x + Math.sin(t / 1.9) * 0.06);
      py.set(pointer.y + Math.sin(t / 2.7 + 1.2) * 0.05);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [calm, px, py]);

  const u = size / 64; // one grid unit, in pixels
  const depth = size * 0.24;
  const step = depth / LAYERS;

  return (
    <div
      ref={host}
      className={className}
      style={{ width: size, height: size, perspective: size * 4.2, position: "relative" }}
      aria-hidden
    >
      {/* What the mark is standing on. Not a drop shadow — it tracks the tilt,
          so the object and its shadow agree about where the light is. */}
      <motion.div
        style={{
          position: "absolute",
          inset: `${size * 0.14}px ${size * 0.08}px ${size * -0.1}px`,
          x: shadowX,
          y: shadowY,
          borderRadius: "50%",
          background: "radial-gradient(50% 50% at 50% 50%, oklch(0 0 0 / 0.42), transparent 72%)",
          filter: `blur(${size * 0.1}px)`,
        }}
      />

      <motion.div
        initial={calm ? false : { opacity: 0, scale: 0.84 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          rotateX,
          rotateY,
        }}
      >
        {/* The slab. Layer 0 is the face; everything behind it only ever shows
            as the rim, which is why the rim is where the gradient goes. */}
        {Array.from({ length: LAYERS }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: TILE_R * u,
              transform: `translateZ(${-i * step}px)`,
              background:
                i === 0
                  ? "linear-gradient(163deg, color-mix(in oklch, var(--mark-face) 92%, white) 0%, var(--mark-face) 52%, color-mix(in oklch, var(--mark-face) 88%, var(--mark-edge)) 100%)"
                  : "linear-gradient(163deg, color-mix(in oklch, var(--mark-edge) 84%, white) 0%, var(--mark-edge) 52%, color-mix(in oklch, var(--mark-edge) 68%, black) 100%)",
              backfaceVisibility: "hidden",
            }}
          />
        ))}

        {/* The bars, lifted off the face and extruded in their turn. */}
        {BARS.map(([x, y, w], index) => (
          <div
            key={index}
            style={{
              position: "absolute",
              left: x * u,
              top: y * u,
              width: w * u,
              height: BAR_H * u,
              transform: `translateZ(${size * 0.035}px)`,
              transformStyle: "preserve-3d",
            }}
          >
            <motion.div
              initial={calm ? false : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{
                duration: 0.72,
                delay: 0.34 + index * 0.13,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                width: "100%",
                height: "100%",
                originX: 0,
                transformStyle: "preserve-3d",
              }}
            >
              {Array.from({ length: 5 }, (_, layer) => (
                <div
                  key={layer}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: BAR_R * u,
                    transform: `translateZ(${-layer * (size * 0.008)}px)`,
                    background:
                      layer === 0
                        ? "var(--mark-cut)"
                        : "color-mix(in oklch, var(--mark-cut) 76%, var(--mark-edge))",
                  }}
                />
              ))}
            </motion.div>
          </div>
        ))}

        {/* Glass. One highlight that moves with the tilt, and a hairline along
            the top edge — the same rim light every raised surface in the app
            wears, which is what ties this to the rest of the interface. */}
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: TILE_R * u,
            transform: `translateZ(${size * 0.052}px)`,
            pointerEvents: "none",
            background: sheen,
            boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.22), inset 0 -1px 0 oklch(0 0 0 / 0.16)",
            mixBlendMode: "screen",
          }}
        />
      </motion.div>
    </div>
  );
}

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}
