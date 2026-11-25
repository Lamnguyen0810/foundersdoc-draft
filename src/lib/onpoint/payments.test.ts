import { test } from "node:test";
import assert from "node:assert/strict";
import { centsOf, dateOfCell, DEFAULT_PAY, money, paymentHtml, readCsv, readInvoiceList, renderPayment } from "./payments";

const today = "2026-11-24";

test("money and amounts", () => {
  assert.equal(money(52320), "S$523.20");
  assert.equal(money(100000, "usd"), "USD 1,000.00");
  assert.equal(centsOf("S$1,234.50"), 123450);
  assert.equal(centsOf(1308), 130800);
  assert.equal(centsOf("(100)"), -10000);
  assert.equal(centsOf(""), null);
});

test("dates in the forms invoice lists use", () => {
  assert.equal(dateOfCell("2026-12-31"), "2026-12-31");
  assert.equal(dateOfCell("31/12/2026"), "2026-12-31");
  assert.equal(dateOfCell("5/1/26"), "2026-01-05");
  assert.equal(dateOfCell("31 Dec 2026"), "2026-12-31");
  assert.equal(dateOfCell("Dec 31, 2026"), "2026-12-31");
  assert.equal(dateOfCell(46387), "2026-12-31");
  assert.equal(dateOfCell("soon"), null);
});

test("the payment email fills in, and leaves out what is missing", () => {
  const r = renderPayment(DEFAULT_PAY, { company: "Sample Company Pte. Ltd.", contact: "Alex Tan", number: "INV-1", description: "Corporate secretarial fee", amount_cents: 52320, currency: "SGD", due: "2026-11-20", today });
  assert.match(r.subject, /invoice INV-1 for Sample Company Pte\. Ltd\., S\$523\.20 due 20 Nov 2026/);
  assert.match(r.body, /^Hi Alex Tan,/);
  assert.match(r.body, /was due on 20 Nov 2026 \(4 days overdue\)/);
  assert.match(renderPayment({ subject: "s", body: "{description}" }, { company: "a", contact: null, number: null, description: "Corporate secretarial fee", amount_cents: 1, currency: "SGD", due: today, today }).body, /Corporate secretarial fee/);
  assert.equal(r.overdue, true);
  const bare = renderPayment(DEFAULT_PAY, { company: "Example Consulting Pte. Ltd.", contact: null, number: null, description: null, amount_cents: 100000, currency: "SGD", due: "2026-12-01", today });
  assert.doesNotMatch(bare.subject + bare.body, /\{|\}|invoice\s+for\s+for|\n\n\n/);
  assert.match(bare.body, /our invoice for Example Consulting/);
  assert.match(bare.body, /is due on 1 Dec 2026 \(in 7 days\)/);
  assert.match(bare.body, /^Hi there,/);
  assert.equal(bare.notes.length, 2);
  assert.deepEqual(renderPayment({ subject: "{oops}", body: "x" }, { company: "a", contact: null, number: null, description: null, amount_cents: 1, currency: "SGD", due: today, today }).unknown, ["{oops}"]);
});

test("the designed payment email shows the invoice", () => {
  const html = paymentHtml("Hi there,\n\nPlease pay.", { logoUrl: "", sender: "OnPoint Consulting", brandName: "OnPoint Consulting", company: "Sample Company Pte. Ltd.", number: "INV-1", description: null, amount_cents: 52320, currency: "SGD", due: "2026-11-20", today });
  assert.match(html, /Payment overdue/);
  assert.match(html, /S\$523\.20 was due 20 Nov 2026/);
  assert.match(html, /INV-1/);
  assert.doesNotMatch(html, /Filing/);
});

test("an invoice list: one row per invoice, paid ones noted, rows without a due date skipped", () => {
  const sheets = readCsv(
    [
      "Client,Invoice No,Description,Amount,Due Date,Email,Status",
      "Sample Company Pte. Ltd.,INV-1,Secretarial fee,\"1,200.00\",31/12/2026,alex.tan@example.com,Awaiting payment",
      "Example Consulting Pte. Ltd.,INV-2,Tax,300,2026-11-01,,Paid",
      "Specimen Trading Pte. Ltd.,INV-3,Address,150,,ops@example.com,",
      "Demo Logistics Pte. Ltd.,,Bookkeeping,80.5,1 Dec 2026,,",
    ].join("\r\n"),
  );
  const l = readInvoiceList(sheets, "list.csv");
  assert.equal(l.invoices.length, 2);
  assert.deepEqual(l.invoices[0], {
    client: "Sample Company Pte. Ltd.",
    client_key: "sample company pte ltd",
    email: "alex.tan@example.com",
    contact: null,
    number: "INV-1",
    description: "Secretarial fee",
    amount_cents: 120000,
    currency: "SGD",
    issue_date: null,
    due_date: "2026-12-31",
    source_key: "INV:inv-1",
  });
  assert.equal(l.invoices[1].amount_cents, 8050);
  assert.match(l.invoices[1].source_key, /^INV:demo logistics pte ltd\|2026-12-01\|8050$/);
  assert.deepEqual(l.paid, ["INV:inv-2"]);
  assert.equal(l.skipped.length, 1);
});

test("Xero's export: one row per line, grouped by invoice; amount due wins; voided left out", () => {
  const sheets = readCsv(
    [
      "*ContactName,EmailAddress,*InvoiceNumber,*InvoiceDate,*DueDate,Total,InvoiceAmountPaid,InvoiceAmountDue,Description,LineAmount,Currency,Status",
      "Sample Company Pte. Ltd.,alex.tan@example.com,INV-9,01/11/2026,30/11/2026,500,100,400,Secretarial,300,SGD,Awaiting Payment",
      "Sample Company Pte. Ltd.,alex.tan@example.com,INV-9,01/11/2026,30/11/2026,500,100,400,Address,200,SGD,Awaiting Payment",
      "Example Consulting Pte. Ltd.,,INV-10,01/11/2026,30/11/2026,90,0,90,Filing,90,SGD,Voided",
    ].join("\n"),
  );
  const l = readInvoiceList(sheets, "xero.csv");
  assert.equal(l.invoices.length, 1);
  assert.equal(l.invoices[0].amount_cents, 40000);
  assert.equal(l.invoices[0].description, "Secretarial; Address");
  assert.equal(l.invoices[0].issue_date, "2026-11-01");
});

test("a file without the right columns says so", () => {
  const l = readInvoiceList(readCsv("Name,Date expire\nSample,2026-01-01"), "nominee.csv");
  assert.equal(l.sheet, null);
  assert.equal(l.invoices.length, 0);
});

test("automatic payment reminders: which day, and the next one", async () => {
  const { autoTag, nextAuto, cleanDays } = await import("./payments");
  const before = [7, 0];
  const after = [3, 10, 30];
  const inv = (due: string, status: "open" | "paid" = "open") => ({ due_date: due, status });
  assert.deepEqual(autoTag(inv("2026-12-01"), today, before, after), { tag: "b7", lead: 7 });
  assert.deepEqual(autoTag(inv("2026-11-24"), today, before, after), { tag: "b0", lead: 0 });
  assert.deepEqual(autoTag(inv("2026-11-14"), today, before, after), { tag: "a10", lead: -10 });
  assert.equal(autoTag(inv("2026-11-20"), today, before, after), null);
  assert.equal(autoTag(inv("2026-12-01", "paid"), today, before, after), null);
  assert.equal(nextAuto(inv("2026-12-10"), today, before, after), "2026-12-03");
  assert.equal(nextAuto(inv("2026-11-24"), today, before, after), "2026-11-24");
  assert.equal(nextAuto(inv("2026-11-20"), today, before, after), "2026-11-30");
  assert.equal(nextAuto(inv("2026-09-01"), today, before, after), null);
  assert.deepEqual(cleanDays([0, 7, 7, "3"], 0), [7, 3, 0]);
  assert.equal(cleanDays([0], 1), null);
  assert.equal(cleanDays([1.5], 0), null);
});

test("reading a PDF invoice's text: Xero layout and a simple one", async () => {
  const { parseInvoiceText } = await import("./payments");
  const own = { names: ["OnPoint Consulting Pte. Ltd."], emails: ["accounts@onpointsg.com"] };
  const xero = "TAX INVOICE\nSAMPLE Lambda Studio Pte. Ltd. Invoice Date OnPoint Consulting Pte. Ltd.\nAttention: Accounts 20 Nov 2026 accounts@onpointsg.com\nfinance@example.com Invoice Number\nSAMPLE-INV-3001\nDue Date\n4 Dec 2026\nDescription Quantity Unit Price Amount SGD\nCorporate secretarial fee 2026 1.00 480.00 480.00\nRegistered address (12 months) 1.00 300.00 300.00\nSubtotal 780.00\nAMOUNT DUE SGD780.00";
  const a = parseInvoiceText(xero, [], own);
  assert.equal(a.client, "SAMPLE Lambda Studio Pte. Ltd.");
  assert.equal(a.number, "SAMPLE-INV-3001");
  assert.equal(a.amount_cents, 78000);
  assert.equal(a.due_date, "2026-12-04");
  assert.equal(a.issue_date, "2026-11-20");
  assert.equal(a.email, "finance@example.com");
  assert.equal(a.description, "Corporate secretarial fee 2026");
  const simple = "OnPoint Consulting Pte. Ltd.\naccounts@onpointsg.com\nINVOICE\nInvoice No: SAMPLE-INV-3002\nInvoice Date: 15/11/2026\nDue Date: 30/11/2026\nBill To:\nSAMPLE Mu Engineering Pte. Ltd.\nDescription\nAccounts and tax filing FY2025\nTotal Due: S$ 1,250.00";
  const b = parseInvoiceText(simple, [{ id: "c9", name: "SAMPLE Mu Engineering Pte. Ltd.", key: "sample mu engineering pte ltd", contact_email: "ops@example.com" }], own);
  assert.equal(b.client_id, "c9");
  assert.equal(b.email, "ops@example.com");
  assert.equal(b.amount_cents, 125000);
  assert.equal(b.due_date, "2026-11-30");
  assert.deepEqual(b.problems, []);
  const scan = parseInvoiceText("  ", [], own);
  assert.match(scan.problems[0], /No readable text/);
});

test("a PDF that lists many invoices in a table: one row each; client headings carried down; totals left out", async () => {
  const { tableFromPdf } = await import("./payments");
  const at = (y: number, cells: Array<[string, number]>) => cells.map(([str, x]) => ({ str, x, y, w: str.length * 5 }));
  const rows = tableFromPdf([
    [
      ...at(500, [["Aged Receivables Detail", 40]]),
      ...at(480, [["Invoice Date", 40], ["Invoice Number", 140], ["Due Date", 270], ["Total", 720]]),
      ...at(460, [["SAMPLE Sigma Freight Pte. Ltd.", 40]]),
      ...at(444, [["02 Nov 2026", 40], ["SAMPLE-INV-5001", 140], ["16 Nov 2026", 270], ["400.00", 720]]),
      ...at(428, [["20 Nov 2026", 40], ["SAMPLE-INV-5002", 140], ["4 Dec 2026", 270], ["300.00", 720]]),
      ...at(412, [["Total SAMPLE Sigma Freight Pte. Ltd.", 40], ["700.00", 720]]),
    ],
  ]);
  assert.ok(rows);
  const l = readInvoiceList([{ name: "t", rows: rows! }], "t");
  assert.equal(l.invoices.length, 2);
  assert.equal(l.invoices[0].client, "SAMPLE Sigma Freight Pte. Ltd.");
  assert.equal(l.invoices[1].amount_cents, 30000);
  assert.equal(l.invoices[1].due_date, "2026-12-04");
  /* a single invoice's items table is not a list of invoices */
  assert.equal(tableFromPdf([[...at(480, [["Description", 50], ["Quantity", 360], ["Unit Price", 430], ["Amount SGD", 500]]), ...at(460, [["Secretarial fee", 50], ["1.00", 370], ["480.00", 430], ["480.00", 500]])]]), null);
});

test("reading a PDF invoice: a Word-made layout (upper-case client after 'To', 'Total' heading before the items)", async () => {
  const { parseInvoiceText } = await import("./payments");
  const text = "INVOICE\nOnPoint Consulting Pte. Ltd.\nSAMPLE office address, Singapore\nInvoice No: SAMPLE-INV-6001\nDue Date: 09/12/2026\nTax Invoice\nDate: 25/11/2026\nTo SAMPLE UPSILON PTE. LTD.\nReg. No. SAMPLE-UEN-0001\nadministrator@foundersdoc.com\nQty Description Unit\nPrice\nTotal\n1 Corporate secretarial services provided from\n01/11/2026 to 30/11/2026 for the month of\nNovember 2026\n1 S$720.00 Pay by bank transfer,\n1 Registered address (November 2026) 1 S$180.00\nSubtotal S$900.00\nSales Tax -\nTotal S$900.00\nThank you !";
  const r = parseInvoiceText(text, [], { names: ["OnPoint Consulting Pte. Ltd."], emails: [] });
  assert.equal(r.client, "SAMPLE UPSILON PTE. LTD.");
  assert.equal(r.amount_cents, 90000);
  assert.equal(r.due_date, "2026-12-09");
  assert.equal(r.issue_date, "2026-11-25");
  assert.equal(r.number, "SAMPLE-INV-6001");
});
