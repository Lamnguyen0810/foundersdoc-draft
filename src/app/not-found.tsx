import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * A 404 that says which of the two halves you fell between.
 *
 * Since the marketing site and FD AI share a domain, a missing page is most
 * often a site page whose rewrite did not fire — so this offers both doors
 * rather than a bare "not found".
 */
export default function NotFound() {
  return (
    <main className="wrap" style={{ maxWidth: 640, padding: "72px 24px" }}>
      <p style={{ marginBottom: 6 }}><Logo /></p>
      <h1 style={{ fontSize: "clamp(24px, 3vw, 32px)", marginTop: 10 }}>
        That page isn’t here.
      </h1>
      <p className="sub" style={{ marginTop: 12 }}>
        The address may be out of date, or the page may have moved. Both halves of the
        site are one click away.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 22, flexWrap: "wrap" }}>
        <Link className="btn btn-gold" href="/draft">
          Launch FD AI
        </Link>
        <a className="btn btn-white" href="/">
          Back to the site
        </a>
        <a className="btn btn-white" href="/contact">
          Contact us
        </a>
      </div>
    </main>
  );
}
