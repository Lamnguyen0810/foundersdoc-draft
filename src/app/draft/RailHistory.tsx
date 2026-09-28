"use client";

import { useMemo, useState } from "react";
import { groupDrafts, shortType, type RecentDraft } from "./history";

/**
 * Past drafts in the rail — the same list on the NDA's screen and the term
 * sheet's.
 *
 * By type: a row of filters (All, NDA, Term sheet — whatever types the person
 * has drafted), and a coloured dot on each row saying which kind it is.
 * By date: Pinned, Today, Previous 7 days… as before.
 * A few at a time: the first RAIL_SHOWN of the chosen type, then "Show more",
 * and a link to the full Past drafts page once everything here is open.
 */

const RAIL_SHOWN = 7;

export default function RailHistory({
  drafts,
  currentId,
  onRename,
  onTogglePin,
}: {
  drafts: RecentDraft[];
  currentId: string | null;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, next: boolean) => void;
}) {
  const [type, setType] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  /* The types this person has drafted, in the order they first appear. */
  const types = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of drafts) {
      const key = d.docSlug ?? d.docLabel ?? "other";
      if (!seen.has(key)) seen.set(key, shortType(d.docSlug, d.docLabel));
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [drafts]);

  if (drafts.length === 0) return null;

  const keyOf = (d: RecentDraft) => d.docSlug ?? d.docLabel ?? "other";
  const ofType = type === "all" ? drafts : drafts.filter((d) => keyOf(d) === type);
  const shown = showAll
    ? ofType
    : /* The one being looked at stays listed even when it is older than the
         cut, so a draft opened from Past drafts is marked in the rail. */
      ofType.filter((r, idx) => idx < RAIL_SHOWN || r.id === currentId);
  const hidden = ofType.length - shown.length;
  const typeClass = (d: RecentDraft) => `t-${(keyOf(d) || "other").replace(/[^a-z0-9-]/gi, "").toLowerCase()}`;

  return (
    <div className="hist-groups">
      {types.length > 1 && (
        <div className="hist-filter" role="group" aria-label="Show drafts of type">
          {[{ key: "all", label: "All" }, ...types].map((t) => (
            <button
              key={t.key}
              type="button"
              className={`hist-chip t-${t.key.replace(/[^a-z0-9-]/gi, "").toLowerCase()}${type === t.key ? " on" : ""}`}
              aria-pressed={type === t.key}
              onClick={() => {
                setType(t.key);
                setShowAll(false);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && <p className="hist-empty">No drafts of this type yet.</p>}

      {groupDrafts(shown).map((group) => (
        <section key={group.heading}>
          <p className="k">{group.heading}</p>
          <div className="hist">
            {group.items.map((r) =>
              renamingId === r.id ? (
                /* Renaming in place. Enter or clicking away keeps it, Escape
                   abandons it — the same three keys as the strip. */
                <input
                  key={r.id}
                  className="hist-input"
                  defaultValue={r.title}
                  maxLength={80}
                  autoFocus
                  aria-label={`Rename ${r.title}`}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    setRenamingId(null);
                    if (v.trim() && v.trim() !== r.title) onRename(r.id, v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.currentTarget.value = r.title;
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <div key={r.id} className={`hist-row${currentId === r.id ? " on" : ""}${r.pinned ? " is-pinned" : ""}`}>
                  <a
                    href={`/draft/${r.id}`}
                    className={`${typeClass(r)}${currentId === r.id ? " on" : ""}`}
                    aria-current={currentId === r.id ? "page" : undefined}
                    title={`${r.title} — ${shortType(r.docSlug, r.docLabel)}`}
                  >
                    <span className="hist-name">{r.title}</span>
                    <small>{r.when}</small>
                  </a>
                  <button
                    type="button"
                    className="hist-pin"
                    aria-label={r.pinned ? `Unpin ${r.title}` : `Pin ${r.title}`}
                    aria-pressed={Boolean(r.pinned)}
                    title={r.pinned ? "Unpin" : "Pin to the top"}
                    onClick={() => onTogglePin(r.id, !r.pinned)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M14.5 3.5 20.5 9.5M16 4l-1.2 4.2-5 2.2-1.6 1.6 5.8 5.8 1.6-1.6 2.2-5L22 10M9 15l-4.5 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="hist-rename"
                    aria-label={`Rename ${r.title}`}
                    title="Rename"
                    onClick={() => setRenamingId(r.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 20h4l10-10-4-4L4 16zM14 6l4 4" />
                    </svg>
                  </button>
                </div>
              ),
            )}
          </div>
        </section>
      ))}

      {ofType.length > RAIL_SHOWN && (
        <button type="button" className="hist-more" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show more (${hidden})`}
        </button>
      )}
      {showAll && (
        <a className="hist-all" href="/history">
          All past drafts →
        </a>
      )}
    </div>
  );
}
