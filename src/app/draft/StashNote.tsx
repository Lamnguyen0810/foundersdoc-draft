"use client";

import { dropStash } from "./stash";

/**
 * "Welcome back" (0241): shown when a drafting screen opens onto answers kept
 * from an earlier sitting (stash.ts), so it is clear why the questions are
 * already answered — and how to begin again instead.
 */
export default function StashNote({ stashKey, email }: { stashKey: string; email: string | null }) {
  return (
    <div className="m">
      <div className="av">FD</div>
      <div>
        <div className="txt">
          Welcome back. I kept your answers from last time, so you can carry on where you stopped.{" "}
          <button
            type="button"
            className="alt-link"
            onClick={() => {
              dropStash(stashKey, email);
              window.location.reload();
            }}
          >
            Start again instead
          </button>
        </div>
      </div>
    </div>
  );
}
