/* The file the signing-ready check just read, handed to New request (0201).
   Kept in memory only: the page moves on inside the app, so nothing is saved
   in the browser; after a reload the person simply chooses the file again. */
export interface Handoff {
  file: File;
  verdict: string;
}
let held: Handoff | null = null;
export function setHandoff(h: Handoff) {
  held = h;
}
export function peekHandoff(): Handoff | null {
  return held;
}
export function clearHandoff() {
  held = null;
}
