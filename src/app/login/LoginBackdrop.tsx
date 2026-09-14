/**
 * A still of the document catalogue, to sit blurred behind the sign-in card.
 *
 * Deliberately NOT the real DraftChat component: that one fetches, animates,
 * types its headline and holds state, none of which should run for a page you
 * cannot interact with. This is the same markup and the same classes — so the
 * design layer styles it identically — rendered once, frozen, and hidden from
 * assistive technology.
 *
 * If the catalogue's look changes, this is a second place to update. That is
 * the price of not booting the real thing behind a modal, and it is worth it.
 */
export default function LoginBackdrop() {
  const folders = [
    ["Confidentiality", "1 ready", true],
    ["Commercial", "Coming soon", false],
    ["Company", "Coming soon", false],
    ["People", "Coming soon", false],
    ["Fundraising", "Coming soon", false],
  ] as const;

  return (
    <div className="login-backdrop" aria-hidden="true" inert>
      <div id="scr-select" className="scr step on">
        <div className="step-in">
          <div className="crumbs">
            <span>FD AI</span>
            <span className="sep">›</span>
            <b>New draft</b>
          </div>

          <aside className="select-intro">
            <p className="select-k">Document catalogue</p>
            <h2 className="typed">
              <span className="tw">Choose your starting point.</span>
            </h2>
            <p className="sub">Pick a document. FD AI shapes the questions around it.</p>
            <p className="select-tip">Upcoming templates stay listed, marked Coming soon.</p>
          </aside>

          <section className="cat">
            <div className="search">
              <input type="text" readOnly placeholder="Search documents or business needs" />
            </div>

            <div className="cat-bar">
              <span className="ex-count">
                <b>Documents</b> · 5 folders · 1 ready to draft · 10 coming soon
              </span>
              <span className="show-soon">Hide coming soon</span>
            </div>

            <div className="exwrap">
              <nav className="flist">
                {folders.map(([name, meta, on]) => (
                  <span key={name} className={`frow${on ? " on" : ""}${on ? "" : " mute"}`}>
                    <span className="ic" />
                    <span className="tx">
                      <b>{name}</b>
                      <small>{on ? <em>{meta}</em> : meta}</small>
                    </span>
                  </span>
                ))}
              </nav>

              <section className="dpanel">
                <div className="dp-head">
                  <span>
                    <b>Confidentiality</b>
                    <p>Select a document to begin the drafting flow.</p>
                  </span>
                  <span className="n">1 item</span>
                </div>
                <span className="drow">
                  <span className="ic" />
                  <span className="tx">
                    <b>Non-Disclosure Agreement</b>
                    <small>Keep shared information confidential — mutual or one-way</small>
                  </span>
                  <span className="pill rdy">Ready</span>
                </span>
              </section>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
