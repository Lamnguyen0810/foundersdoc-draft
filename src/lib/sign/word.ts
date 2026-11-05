import "server-only";
import mammoth from "mammoth";
import type { Block } from "@/lib/contract/parse";

/**
 * A Word file (.docx) as blocks for the PDF to sign (0191). Free and in-house:
 * mammoth reads the text, headings, bold, numbered and bulleted lists and
 * tables; lib/sign/draft-pdf.ts typesets them. Layout details (fonts, exact
 * spacing, headers and footers, images, text boxes) are not kept, which the
 * Document step says, with the advice to save as PDF in Word for an exact copy.
 */

export interface WordResult {
  blocks: Block[];
  warnings: string[];
}

type Node = { tag: string; kids: Array<Node | string> };

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m),
  );

/** mammoth's HTML is simple and well formed: a small stack parser is enough. */
function parse(html: string): Node {
  const root: Node = { tag: "root", kids: [] };
  const stack: Node[] = [root];
  const re = /<\/?([a-z0-9]+)\b[^>]*?(\/?)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[3] !== undefined) {
      top.kids.push(decode(m[3]));
      continue;
    }
    const tag = m[1].toLowerCase();
    if (m[0].startsWith("</")) {
      for (let i = stack.length - 1; i > 0; i--)
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      continue;
    }
    const n: Node = { tag, kids: [] };
    top.kids.push(n);
    if (m[2] !== "/" && !["br", "img", "hr"].includes(tag)) stack.push(n);
  }
  return root;
}

const NUM = [
  (i: number) => `${i}.`,
  (i: number) => `(${String.fromCharCode(96 + ((i - 1) % 26) + 1)})`,
  (i: number) => `(${roman(i)})`,
  (i: number) => `(${String.fromCharCode(64 + ((i - 1) % 26) + 1)})`,
];
function roman(n: number): string {
  const r: Array<[number, string]> = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  for (const [v, s] of r)
    while (n >= v) {
      out += s;
      n -= v;
    }
  return out;
}

/** Inline text with **bold**; lines split at <br>. Lists and tables inside are handled by the caller. */
function inline(n: Node | string, bold = false, out: string[] = [""]): string[] {
  if (typeof n === "string") {
    const t = n.replace(/\s+/g, " ").replace(/\*\*/g, "*");
    out[out.length - 1] += bold && t.trim() ? t.replace(/^(\s*)(.*?)(\s*)$/, "$1**$2**$3") : t;
    return out;
  }
  if (n.tag === "br") {
    out.push("");
    return out;
  }
  if (["ol", "ul", "table", "img"].includes(n.tag)) return out;
  const b = bold || n.tag === "strong" || n.tag === "b";
  for (const k of n.kids) inline(k, b, out);
  return out;
}
const tidy = (s: string) => s.replace(/\*\*\s*\*\*/g, "").replace(/\s{2,}/g, " ").trim();

export async function wordToBlocks(bytes: Uint8Array): Promise<WordResult> {
  const warnings = new Set<string>();
  const res = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      /* Word's own Title / Subtitle styles read as headings */
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
      convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
    },
  );
  const root = parse(res.value);
  const blocks: Block[] = [];
  let titled = false;

  const walk = (n: Node | string, depth = 0) => {
    if (typeof n === "string") {
      const t = tidy(n);
      if (t) blocks.push({ kind: "plain", num: "", text: t });
      return;
    }
    switch (n.tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const t = tidy(inline(n).join(" ")).replace(/\*\*/g, "");
        if (!t) return;
        if (!titled && blocks.length === 0) {
          blocks.push({ kind: "title", num: "", text: t });
          titled = true;
        } else blocks.push({ kind: "section", num: "", text: `**${t}**` });
        return;
      }
      case "p": {
        for (const line of inline(n)) {
          const t = tidy(line);
          if (t) blocks.push({ kind: "plain", num: "", text: t });
        }
        return;
      }
      case "ol":
      case "ul": {
        let i = 0;
        for (const li of n.kids) {
          if (typeof li === "string" || li.tag !== "li") continue;
          i++;
          const num = n.tag === "ul" ? "•" : NUM[Math.min(depth, 3)](i);
          const t = tidy(inline(li).join(" "));
          if (t) blocks.push(depth === 0 ? { kind: "clause", num, text: t } : { kind: "subclause", num, text: t, level: Math.min(depth, 3) as 1 | 2 | 3 });
          for (const k of li.kids) if (typeof k !== "string" && (k.tag === "ol" || k.tag === "ul" || k.tag === "table")) walk(k, depth + 1);
        }
        return;
      }
      case "table": {
        warnings.add("Tables keep their columns, but not their borders or shading.");
        const rows: Node[] = [];
        const collect = (x: Node) => x.kids.forEach((k) => typeof k !== "string" && (k.tag === "tr" ? rows.push(k) : collect(k)));
        collect(n);
        for (const tr of rows) {
          const cells = tr.kids
            .filter((k): k is Node => typeof k !== "string" && (k.tag === "td" || k.tag === "th"))
            .map((td) => {
              const lines: string[] = [];
              for (const k of td.kids) {
                if (typeof k === "string") lines.push(tidy(k));
                else if (k.tag === "p" || k.tag === "h1" || k.tag === "h2" || k.tag === "h3") lines.push(...inline(k).map(tidy));
                else lines.push(...inline(k).map(tidy));
              }
              /* blank lines inside a cell stay (the space to sign above a line), but not at its edges */
              while (lines.length && !lines[0]) lines.shift();
              while (lines.length && !lines[lines.length - 1]) lines.pop();
              return lines;
            });
          /* side by side (signature tables stay two columns); a one-cell row is just its lines */
          const full = cells.filter((c) => c.length);
          if (cells.length >= 2 && full.length >= 1) blocks.push({ kind: "sign-row", num: "table", text: "", cols: cells.slice(0, 4) });
          else for (const l of full.flat()) blocks.push({ kind: "plain", num: "", text: l });
        }
        return;
      }
      case "img":
        warnings.add("Images and logos are left out.");
        return;
      default:
        for (const k of n.kids) walk(k, depth);
    }
  };
  walk(root);
  for (const m of res.messages ?? []) if (/image/i.test(m.message)) warnings.add("Images and logos are left out.");
  /* empty spacer paragraphs at the end */
  while (blocks.length && !blocks[blocks.length - 1].cols && !blocks[blocks.length - 1].text.trim()) blocks.pop();
  return { blocks, warnings: [...warnings] };
}
