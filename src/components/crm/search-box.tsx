"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * A search box that writes to the URL.
 *
 * Debounced, because a keystroke is not a decision and one server round trip
 * per letter is how a search box starts feeling slow. `replace` rather than
 * `push` so typing a query does not bury the previous page under six history
 * entries — Back should leave the search, not walk it backwards.
 */
export function SearchBox({
  placeholder = "Search…",
  param = "q",
  className,
}: {
  placeholder?: string;
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get(param) ?? "";
  const [value, setValue] = useState(initial);
  const typed = useRef(false);

  // Follow the URL when it changes underneath us — a filter link, Back, a
  // fresh navigation — but never fight the person mid-keystroke.
  useEffect(() => {
    if (!typed.current) setValue(initial);
  }, [initial]);

  useEffect(() => {
    if (!typed.current || value === initial) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set(param, value.trim());
      else next.delete(param);
      typed.current = false;
      router.replace(next.toString() ? `?${next}` : "?", { scroll: false });
    }, 220);
    return () => clearTimeout(timer);
  }, [value, initial, param, params, router]);

  return (
    <div className={className}>
      <div className="relative">
        <SearchIcon className="text-faint pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          value={value}
          onChange={(event) => {
            typed.current = true;
            setValue(event.target.value);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 pr-7 pl-8 text-[13px]"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              typed.current = true;
              setValue("");
            }}
            className="text-faint hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
