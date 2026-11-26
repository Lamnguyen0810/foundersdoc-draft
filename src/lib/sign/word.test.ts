import { test } from "node:test";
import assert from "node:assert/strict";
import { Document, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { wordToBlocks } from "./word";
import { blocksPdf } from "./draft-pdf";

/* 0299: a Word file keeps its page breaks, and a document laid out in tables keeps all its words. Sample text only. */

const p = (t: string) => new Paragraph({ children: [new TextRun(t)] });
const cell = (...kids: Array<Paragraph | Table>) => new TableCell({ children: kids });
const table = (...rows: TableCell[][]) => new Table({ rows: rows.map((r) => new TableRow({ children: r })) });
const docx = async (children: Array<Paragraph | Table>) => new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));

test("word: a page break starts a new page, so an appendix keeps its own cover page", async () => {
  const bytes = await docx([
    p("DIRECTORS' RESOLUTION IN WRITING"),
    p("The directors resolve to adopt the constitution attached as Appendix A."),
    new Paragraph({ children: [new PageBreak()] }),
    p("APPENDIX A"),
    new Paragraph({ children: [new TextRun("Restated Constitution"), new PageBreak()] }),
    p("APPENDIX B"),
    new Paragraph({ children: [new PageBreak()] }),
  ]);
  const { blocks } = await wordToBlocks(bytes);
  assert.deepEqual(
    blocks.map((b) => (b.kind === "page-break" ? "|" : b.text)),
    ["DIRECTORS' RESOLUTION IN WRITING", "The directors resolve to adopt the constitution attached as Appendix A.", "|", "APPENDIX A", "Restated Constitution", "|", "APPENDIX B"],
    "one break each, none left at the end",
  );
  assert.equal((await blocksPdf({ title: "Resolution", blocks, fonts: null })).pages, 3);
});

test("word: clauses laid out in tables (tables inside tables) keep every word; '(a) | text' rows are numbered", async () => {
  const bytes = await docx([
    table([cell(p("Interpretation"), table([cell(p("1. In this Constitution, words have these meanings."))]), table([cell(p("(a)")), cell(p("the Act means the Companies Act 1967;"), p("and its regulations."))]), table([cell(p("(ii)")), cell(table([cell(p("a deeper line"))]))]))]),
    table([cell(p("No.")), cell(p("Name")), cell(p("Shares"))], [cell(p("1.")), cell(p("Alex Tan")), cell(p("100"))], [cell(p("2.")), cell(p("Jamie Lee")), cell(p("50"))]),
  ]);
  const { blocks } = await wordToBlocks(bytes);
  const shown = blocks.map((b) => (b.cols ? `[${b.cols.map((c) => c.join(" ")).join(" | ")}]` : `${b.kind}${b.num ? ` ${b.num}` : ""}${b.level ? `/${b.level}` : ""}: ${b.text}`));
  assert.deepEqual(shown, [
    "plain: Interpretation",
    "plain: 1. In this Constitution, words have these meanings.",
    "subclause (a)/1: the Act means the Companies Act 1967;",
    "subclause/1: and its regulations.",
    "subclause (ii)/2: a deeper line",
    "[No. | Name | Shares]",
    "[1. | Alex Tan | 100]",
    "[2. | Jamie Lee | 50]",
  ]);
});
