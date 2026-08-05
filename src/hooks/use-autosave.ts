"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Debounced autosave. Returns the current state plus a `push` you call with the
 * latest value on every keystroke. Guarantees a final save on unmount so nothing
 * is lost when you navigate away mid-sentence.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, delay = 700) {
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValue = useRef<T | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async () => {
    if (pendingValue.current === null) return;
    const value = pendingValue.current;
    pendingValue.current = null;
    setState("saving");
    try {
      await saveRef.current(value);
      setState("saved");
    } catch {
      setState("error");
    }
  }, []);

  const push = useCallback(
    (value: T) => {
      pendingValue.current = value;
      setState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pendingValue.current !== null) void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (state !== "saved") return;
    const timeout = setTimeout(() => setState("idle"), 1800);
    return () => clearTimeout(timeout);
  }, [state]);

  return { state, push, flush };
}
