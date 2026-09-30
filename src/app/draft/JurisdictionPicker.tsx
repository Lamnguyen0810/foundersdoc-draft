"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { groupJurisdictions, isListedJurisdiction, jurisdictionValue, orderJurisdictions, type JurisdictionGroup } from "@/lib/jurisdictions";

/**
 * The governing-law picker: jurisdictions, grouped by country.
 *
 * A country chosen as a whole (Singapore) is one row. A country whose law is
 * set state by state (the United States, Australia, Canada, the United
 * Kingdom) is a heading with its states indented beneath it — the heading
 * itself cannot be chosen, because "United States law" is not a thing a
 * contract can be governed by. Singapore, the United Kingdom and the United
 * States come first under "Popular"; every other country follows A–Z. A
 * search box at the top narrows the list; "Other" at the foot opens a box to
 * type any jurisdiction not listed.
 */
export default function JurisdictionPicker({
  options,
  value,
  onChange,
  label,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const groups = useMemo(() => groupJurisdictions(options), [options]);
  const ordered = useMemo(() => orderJurisdictions(groups), [groups]);
  const listed = value !== "" && isListedJurisdiction(value, options);
  const [typing, setTyping] = useState(value !== "" && !listed);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  /* Closes on a click outside it, or Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    setTimeout(() => search.current?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const narrow = (list: JurisdictionGroup[]) =>
    list
      .map((g) => {
        if (!needle || g.name.toLowerCase().includes(needle)) return g;
        const parts = g.parts.filter((p) => p.toLowerCase().includes(needle));
        return parts.length ? { ...g, parts } : null;
      })
      .filter((g): g is JurisdictionGroup => g !== null);
  const popular = narrow(ordered.popular);
  const rest = narrow(ordered.rest);
  const shown = [...popular, ...rest];

  const renderGroup = (g: JurisdictionGroup) =>
    g.parts.length ? (
      <div className="jp-group" key={g.name}>
        <div className="jp-head">{g.name}</div>
        {g.parts.map((p) => {
          const v = jurisdictionValue(g.name, p);
          return (
            <button
              type="button"
              role="option"
              aria-selected={value === v}
              className={`jp-opt jp-sub${value === v ? " on" : ""}`}
              key={v}
              onClick={() => choose(v)}
            >
              {p}
            </button>
          );
        })}
      </div>
    ) : (
      <button
        type="button"
        role="option"
        aria-selected={value === g.name}
        className={`jp-opt${value === g.name ? " on" : ""}`}
        key={g.name}
        onClick={() => choose(g.name)}
      >
        {g.name}
      </button>
    );

  const choose = (v: string) => {
    setTyping(false);
    onChange(v);
    setOpen(false);
    setQ("");
  };

  return (
    /* The question is a <label>; a click inside would otherwise be passed on
       to the label's first control (this trigger) and reopen the list. */
    <div className="jp" ref={wrap} onClick={(e) => e.preventDefault()}>
      <button
        type="button"
        className={`input jp-trigger${value && !typing ? "" : " empty"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{typing ? "Other (type it)" : value || "— choose —"}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="jp-pop" role="listbox" aria-label={label}>
          <input
            ref={search}
            className="jp-search"
            placeholder="Search a country or state"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const g = shown[0];
                if (g) choose(g.parts.length ? jurisdictionValue(g.name, g.parts[0]) : g.name);
              }
            }}
          />
          <div className="jp-list">
            {popular.length > 0 && <p className="jp-sec">Popular</p>}
            {popular.map(renderGroup)}
            {rest.length > 0 && <p className="jp-sec">{popular.length ? "All jurisdictions, A–Z" : "Jurisdictions"}</p>}
            {rest.map(renderGroup)}
            {shown.length === 0 && <p className="jp-none">Not listed — choose Other below and type it.</p>}
          </div>
          <button
            type="button"
            className={`jp-opt jp-other${typing ? " on" : ""}`}
            onClick={() => {
              setTyping(true);
              onChange(listed ? "" : value);
              setOpen(false);
              setQ("");
            }}
          >
            Other (type it)
          </button>
        </div>
      )}

      {typing && (
        <input
          className="input"
          placeholder="Jurisdiction, e.g. Brunei or Luxembourg"
          aria-label="Other jurisdiction"
          value={value}
          autoFocus={!value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
