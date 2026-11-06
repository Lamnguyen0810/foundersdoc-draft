import { cookies, headers } from "next/headers";
import { cookieName, holderStore, openPage } from "@/lib/esop/holder";
import { buildRows } from "@/app/esop/[slug]/model";
import { fmtDay, today } from "@/lib/esop/vesting";
import { CodeGate, RequestLink } from "../Forms";
import "../my-options.css";

/**
 * /my-options/<link> — an option holder's own page (124): their options, vesting
 * dates and documents, read-only. The holder comes from the link only. The first
 * time in a browser they confirm a code sent to their own email.
 */
export const metadata = { title: "My share options · Founders Doc", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const nf = (n: number) => Math.round(n || 0).toLocaleString("en-GB");

export default async function MyOptions({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const store = holderStore();
  const jar = await cookies();
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const page = store ? await openPage(store, token, (id) => jar.get(cookieName(id))?.value, { ip, ua: (h.get("user-agent") ?? "").slice(0, 300) || null }) : { state: "invalid" as const, message: "This page is not available yet." };

  const shell = (inner: React.ReactNode, brand?: { name: string; logo: string | null }) => (
    <div className="mo">
      <header className="mo-top">
        <span className="mo-fd">Founders Doc</span>
        {brand && (
          <>
            <span className="mo-vr" aria-hidden="true" />
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the company's small logo
              <img src={brand.logo} alt={brand.name} />
            ) : (
              <b>{brand.name}</b>
            )}
          </>
        )}
        <span className="mo-private">Private to you</span>
      </header>
      <main className="mo-wrap">{inner}</main>
    </div>
  );

  if (page.state === "invalid")
    return shell(
      <>
        <div className="mo-card mo-gate">
          <h1>This link doesn&rsquo;t work</h1>
          <p>{page.message}</p>
        </div>
        <RequestLink compact />
      </>,
    );
  if (page.state === "off")
    return shell(
      <div className="mo-card mo-gate">
        <h1>Not available</h1>
        <p>{page.company} has not switched on online access to share options. Please contact your company&rsquo;s ESOP admin.</p>
      </div>,
    );
  if (page.state === "code") return shell(<CodeGate token={token} to={page.to} company={page.company} />);

  const { company, holder, batches, documents } = page.record;
  const now = today();
  const r = buildRows([holder], documents, new Map(batches.map((b) => [b.batch, b])), now)[0];
  const companyName = company.name.replace(/\s*\(TEST\)\s*$/i, "");
  const first = (holder.legal_name?.trim() || holder.name).split(/\s+/)[0];
  const leaver = holder.status === "Leaver";
  const nextPer = r.grants[0].next ? holder.options_per_tranche + (r.grants[1]?.next === r.grants[0].next ? r.grants[1].per : 0) : 0;
  /* a top-up with its own options (123) adds to the original grant's figures; without them the register's total already includes it */
  const top = r.grants[1]?.known && r.grants[1].per ? r.grants[1] : null;
  const granted = r.granted + (top ? top.per * top.tranches.length : 0);
  const vested = r.c.vested + (top ? top.per * top.done : 0);
  const kept = r.c.kept + (top && holder.leaver_type !== "Bad" ? top.per * top.done : 0);
  const file = (id: string) => `/api/my-options/file?t=${encodeURIComponent(token)}&d=${encodeURIComponent(id)}`;

  return shell(
    <>
      <section className="mo-hello">
        <h1>Hi {first}, here are your share options</h1>
        <p>
          {companyName} employee share option plan{company.share_class ? ` · ${company.share_class} shares` : ""} ·{" "}
          {leaver ? (
            <span className="mo-pill grey">Left{holder.last_day ? ` on ${fmtDay(holder.last_day)}` : ""}</span>
          ) : (
            <span className="mo-pill green">Active</span>
          )}
        </p>
      </section>

      <section className="mo-stats" aria-label="Summary">
        <div>
          <span>Options granted</span>
          <b>{nf(granted)}</b>
        </div>
        <div>
          <span>Vested so far</span>
          <b>{nf(vested)}</b>
        </div>
        <div>
          <span>{leaver ? "Kept after leaving" : "Still to vest"}</span>
          <b>{nf(leaver ? kept : Math.max(0, granted - vested))}</b>
        </div>
      </section>

      {!leaver && r.c.next && (
        <section className="mo-next" aria-label="Next vesting">
          <span>Next vesting · in {r.c.daysToNext} {r.c.daysToNext === 1 ? "day" : "days"}</span>
          <b>{fmtDay(r.c.next)}</b>
          <span>{nf(nextPer)} options vest on this date</span>
        </section>
      )}
      {!leaver && !r.c.next && granted > 0 && <section className="mo-next done">All your options have vested.</section>}

      {r.grants.map((g) => (
        <section key={g.title} className="mo-card mo-grant">
          <div className="mo-gh">
            <h2>{g.title}</h2>
            <span>{g.known ? `${g.sub}${g.per ? ` · ${nf(g.per)} options a tranche` : ""}` : "Your company is recording this grant's dates"}</span>
          </div>
          {g.known && (
            <ol className="mo-trs">
              {g.tranches.map((t) => {
                const vested = leaver ? t.n <= g.done : t.state === "vested";
                return (
                  <li key={t.n} className={vested ? "v" : t.state === "next" && !leaver ? "n" : ""}>
                    <span className="mo-dot" aria-hidden="true">
                      {vested ? "✓" : ""}
                    </span>
                    <span className="mo-trl">
                      <b>Tranche {t.n}</b> · {fmtDay(t.date)}
                    </span>
                    <span className="mo-trn">{nf(g.per)} options</span>
                    <span className="mo-trs-state">
                      {t.cert ? (
                        <a href={file(t.cert.id)}>Certificate ↓</a>
                      ) : vested ? (
                        "Vested"
                      ) : t.state === "next" && !leaver ? (
                        "Next"
                      ) : leaver ? (
                        "Not vesting"
                      ) : (
                        "Upcoming"
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}

      <section className="mo-card">
        <h2 className="mo-h2">Your documents</h2>
        {documents.length === 0 && <p className="mo-muted">No documents on file yet.</p>}
        <ul className="mo-docs">
          {documents.map((d) => (
            <li key={d.id}>
              <span className={`mo-pdf ${d.kind === "letter_of_grant" ? "red" : ""}`} aria-hidden="true">
                PDF
              </span>
              <span className="mo-dn">
                <b>{d.kind === "letter_of_grant" ? (d.label === "Top-up" ? "Supplemental Letter of Grant" : "Letter of Grant") : `Option Certificate · Tranche ${d.tranche ?? "?"}${d.label === "Top-up" ? " (top-up)" : ""}`}</b>
                <span>{d.file_name}</span>
              </span>
              <a className="mo-btn" href={file(d.id)}>
                Download
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="mo-foot">
        Something wrong? Contact your company&rsquo;s ESOP admin, or reply to the email you got from Founders Doc. This page is read-only and shows only your own record.
        <br />
        To keep it safe, we record when it is opened (time, IP address and browser).
      </p>
    </>,
    { name: companyName, logo: company.logo_url },
  );
}
