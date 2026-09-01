"use client";

import { useEffect, useState } from "react";

/**
 * One keyboard, one implementation.
 *
 * Every list in this app is a column of links, so the cursor is real DOM
 * focus rather than a highlight class: j and k move focus, and Enter is then
 * the browser's own, which is why this needs no key handler of its own and
 * why a screen reader announces the row you are on. Anything that wants to
 * take part tags its primary link `data-nav-item`; nothing else changes.
 *
 * It stays out of the way while you are typing — inputs, textareas, selects,
 * anything contenteditable — and while a dialog is open, because a modal owns
 * the keyboard for as long as it is up.
 */
export function useKeyboardNav() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Chords belong to the browser and to ⌘K; this is single keys only.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable ||
        // A dialog, a sheet or the palette owns the keyboard while it is open.
        document.querySelector("[role=dialog], [cmdk-root]")
      ) {
        return;
      }

      const items = Array.from(
        document.querySelectorAll<HTMLElement>("[data-nav-item]"),
      ).filter((item) => item.offsetParent !== null);

      const move = (direction: 1 | -1) => {
        if (items.length === 0) return;
        const current = items.indexOf(document.activeElement as HTMLElement);
        const next = current === -1 ? (direction === 1 ? 0 : items.length - 1) : current + direction;
        const clamped = Math.max(0, Math.min(items.length - 1, next));
        items[clamped]?.focus();
        items[clamped]?.scrollIntoView({ block: "nearest" });
      };

      switch (event.key) {
        case "j":
          event.preventDefault();
          move(1);
          break;
        case "k":
          event.preventDefault();
          move(-1);
          break;
        case "/": {
          const search = document.querySelector<HTMLInputElement>("[data-search-input]");
          if (!search) return;
          event.preventDefault();
          search.focus();
          search.select();
          break;
        }
        case "n": {
          const create = document.querySelector<HTMLElement>("[data-new-button]");
          if (!create) return;
          event.preventDefault();
          create.click();
          break;
        }
        case "?":
          event.preventDefault();
          setShowHelp(true);
          break;
        case "Escape":
          setShowHelp(false);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { showHelp, setShowHelp };
}

/** What the sheet lists. Kept beside the handler so the two cannot drift. */
export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "⌘K", what: "Jump to anything, or act on an application" },
  { keys: "j / k", what: "Move down and up a list" },
  { keys: "Enter", what: "Open what you are on" },
  { keys: "/", what: "Search this screen" },
  { keys: "n", what: "Make a new one of whatever this screen holds" },
  { keys: "?", what: "This list" },
];
