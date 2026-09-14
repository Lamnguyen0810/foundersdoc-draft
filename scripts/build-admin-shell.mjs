/**
 * Turns the designed admin workspace HTML into a module the app can serve.
 *
 * WHY A BUILD STEP AND NOT A HAND-EDIT. The design is FD's, it is 68KB, and it
 * will be revised again. Every change made here is a named, reviewable
 * transformation rather than a diff nobody can read — so when a new version of
 * the design arrives, this script is re-run against it and the same changes
 * apply. The rule is: change as little as possible, and say why for each one.
 *
 *   node scripts/build-admin-shell.mjs <path-to-design.html>
 */
import fs from "node:fs";

const src = process.argv[2];
if (!src) { console.error("usage: build-admin-shell.mjs <design.html>"); process.exit(1); }
let html = fs.readFileSync(src, "utf8");
const applied = [];
function edit(name, fn) {
  const before = html;
  html = fn(html);
  if (html === before) { console.error(`FAILED: ${name}`); process.exit(1); }
  applied.push(name);
}

// 1. The design ships its own fake login. The real app has already established
//    who this is, and a second password box would be theatre.
edit("remove the prototype login screen", h =>
  h.replace(/<section id="login"[\s\S]*?<\/section>\s*/m, ""));

edit("show the workspace immediately", h =>
  h.replace('<section id="workspace" class="workspace hidden">', '<section id="workspace" class="workspace">'));

edit("drop the login button handler", h =>
  h.replace(/document\.getElementById\('loginBtn'\)\.onclick = \(\) => \{[\s\S]*?\};\s*/m,
    "// (the prototype's login handler is removed — the app authenticates before this page is served)\n"));

edit("tolerate the absent login element", h =>
  h.replace("const login = document.getElementById('login');", "const login = null;"));

// 2. Invented traffic must not appear in a real admin view. A partner looking
//    at this should never be shown a visit that did not happen.
edit("stop the simulated visit generator", h =>
  h.replace(/\/\/ Simulated live traffic[\s\S]*?\}, 6000\);/m,
    `// Live traffic comes from the events table, not from a random generator.
document.getElementById('onSiteNow').textContent = FD.onSiteNow;`));

// 3. Sign-ups become real. Everything else on this screen stays sample data and
//    is labelled as such by the design's own note.
edit("real sign-up numbers", h =>
  h.replace("    signups: Math.round(visitors * (previous ? 0.032 : signupRate)),",
    `    // REAL: waitlist joins in this period, from the database.
    signups: previous ? (FD.signupsPrev[key] ?? 0) : (FD.signups[key] ?? 0),`));

// 4. The funnel's first two steps are real; the last two describe a document
//    feature that does not exist yet, so they are replaced rather than faked.
edit("real sign-up journey", h =>
  h.replace(/  \/\/ Sign-up journey\n  const uploaded[\s\S]*?\n  \}\).join\(''\);\n/m,
`  // Sign-up journey — REAL. The steps stop where the data stops: inventing an
  // "uploaded a document" number for a feature that is not built would put a
  // fiction in front of whoever reads this.
  const steps = [
    ['Visited the site', cur.visitors],
    ['Reached the sign-in card', FD.funnel[analyticsRange]?.reached ?? 0],
    ['Joined the waitlist', cur.signups]
  ];
  document.getElementById('funnel').innerHTML = steps.map((s, i) => {
    const share = i ? (steps[i - 1][1] ? s[1] / steps[i - 1][1] : 0) : 1;
    return \`<li>
      <div class="funnel-top"><span>\${s[0]}</span><strong>\${fmt(s[1])}</strong></div>
      <div class="funnel-track"><div class="funnel-bar" style="width:\${Math.max(2, share * 100).toFixed(1)}%"></div></div>
      <div class="funnel-note">\${i ? pct(share, 1) + ' of the previous step' : 'Everyone who visited in this period'}</div>
    </li>\`;
  }).join('');
`));

// 5. The activity log shows what actually happened.
edit("real activity log", h =>
  h.replace(/\/\/ Seed recent history so the log isn't empty on first open\n\(function seedActivity\(\)\{[\s\S]*?\}\)\(\);/m,
`// REAL activity: waitlist joins and site events, newest first.
(function seedActivity(){
  FD.activity.forEach(ev => activity.push({
    id: ++eventSeq, type: ev.type, text: ev.text, meta: ev.meta || [],
    tone: TYPE_INFO[ev.type] ? TYPE_INFO[ev.type].tone : 'uploaded',
    time: new Date(ev.time).getTime(), fresh: false
  }));
  activity.sort((a, b) => b.time - a.time);
})();`));

// 6. A panel the design did not have, because the waitlist did not exist when
//    it was drawn. It is what the firm will actually open this page to read.
edit("add the waitlist panel", h =>
  h.replace('<section id="kpiRow" class="kpi-row" aria-label="Key figures"></section>',
`<section id="kpiRow" class="kpi-row" aria-label="Key figures"></section>

    <section class="panel" aria-labelledby="waitlistTitle">
      <div class="panel-head">
        <div>
          <h2 id="waitlistTitle">Waitlist</h2>
          <p class="sub">People asking for FD AI. Newest first.</p>
        </div>
        <button id="exportWaitlist" class="secondary">Export CSV</button>
      </div>
      <div id="waitlistWrap"></div>
    </section>`));

// 7. Credits. Not in the design either — the billing system did not exist when
//    it was drawn — but it is the one administrative action the firm needs to
//    take by hand: putting documents back on an account.
edit("add the credits panel", h =>
  h.replace('<div id="waitlistWrap"></div>\n      </div>\n    </section>',
            '<div id="waitlistWrap"></div>\n      </div>\n    </section>')
   .replace(`      <div id="waitlistWrap"></div>
    </section>`,
`      <div id="waitlistWrap"></div>
    </section>

    <section class="panel" aria-labelledby="creditsTitle">
      <div class="panel-head">
        <div>
          <h2 id="creditsTitle">Credits</h2>
          <p class="sub">Look someone up by email, then add documents to their account or take them back.</p>
        </div>
      </div>

      <div class="credit-find">
        <label class="credit-label" for="creditEmail">Email address</label>
        <div class="credit-row">
          <input id="creditEmail" type="email" autocomplete="off" spellcheck="false"
                 placeholder="name@firm.com" class="credit-input" />
          <button id="creditLookup" class="secondary" type="button">Look up</button>
        </div>
        <p id="creditMsg" class="credit-msg" role="status" aria-live="polite"></p>
      </div>

      <div id="creditFound" class="credit-found hidden">
        <div class="credit-who">
          <span id="creditName" class="credit-name"></span>
          <span id="creditEmailOut" class="credit-sub"></span>
        </div>
        <div class="credit-balance">
          <span id="creditBalance" class="credit-num">0</span>
          <span class="credit-sub">documents left</span>
        </div>
        <div class="credit-act">
          <label class="credit-label" for="creditAmount">How many</label>
          <input id="creditAmount" type="number" min="1" max="1000" step="1" value="10" class="credit-input credit-num-input" />
          <label class="credit-label" for="creditReason">Why (optional)</label>
          <input id="creditReason" type="text" maxlength="200" placeholder="e.g. goodwill after a failed draft" class="credit-input" />
          <div class="credit-row">
            <button id="creditGrant" class="primary" type="button">Add credits</button>
            <button id="creditRevoke" class="secondary credit-danger" type="button">Take back</button>
          </div>
        </div>
      </div>

      <div id="creditLogWrap"></div>
    </section>`));

//    Styling stays in the design's own vocabulary and its own variables, so a
//    later revision of the design restyles this panel along with everything else.
edit("style the credits panel", h =>
  h.replace("</style>",
`
/* ── credits panel ─────────────────────────────────────────────────────── */
.credit-find{max-width:34rem}
.credit-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:.35rem}
.credit-label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;opacity:.65;margin-top:.75rem}
.credit-input{flex:1 1 14rem;min-width:0;padding:.5rem .65rem;border:1px solid var(--border,#d9dce1);border-radius:.4rem;background:var(--card,#fff);color:inherit;font:inherit}
.credit-num-input{flex:0 0 7rem}
.credit-input:focus-visible{outline:2px solid var(--accent,#b8892b);outline-offset:1px}
.credit-msg{margin:.6rem 0 0;font-size:.85rem;min-height:1.2em}
.credit-msg.err{color:#b91c1c}
.credit-msg.ok{color:#15803d}
.credit-found{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1rem 1.5rem;align-items:start;margin-top:1.1rem;padding-top:1.1rem;border-top:1px solid var(--border,#e5e7eb)}
.credit-who{display:flex;flex-direction:column;gap:.15rem}
.credit-name{font-weight:600}
.credit-sub{font-size:.8rem;opacity:.65}
.credit-balance{text-align:right;display:flex;flex-direction:column;align-items:flex-end}
.credit-num{font-size:1.9rem;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.credit-act{grid-column:1/-1;max-width:34rem}
.credit-act > .credit-input{display:block;width:100%}
.credit-act > .credit-num-input{width:7rem}
.credit-danger{color:#b91c1c;border-color:#b91c1c}
.credit-log{margin-top:1.4rem}
@media (max-width:640px){.credit-found{grid-template-columns:1fr}.credit-balance{text-align:left;align-items:flex-start}}
</style>`));

// 8. The documents half of this page is not wired up yet, so landing there
//    puts the one thing that does not work in front of the reader first.
edit("open on analytics", h =>
  h.replace("<main id=\"analyticsView\" class=\"content analytics hidden\"", "<main id=\"analyticsView\" class=\"content analytics\"")
   .replace("<main id=\"documentsView\" class=\"content\"", "<main id=\"documentsView\" class=\"content hidden\""));

// 9. The data itself, plus the waitlist renderer. Appended so it runs after
//    every function the design defines.
edit("append the data adapter", h => h.replace("</script>\n</body>",
`
/* ── real data, injected by the server ─────────────────────────────────────
   FD is defined in a <script> above this one. Nothing here invents a number. */
adminTab.textContent = 'Back to documents';
adminTab.classList.add('active');
adminTab.setAttribute('aria-pressed', 'true');
pageTitle.textContent = 'Admin analytics';
document.getElementById('searchInput').classList.add('hidden');
document.getElementById('openUpload').classList.add('hidden');

function renderWaitlist(){
  const rows = FD.waitlist;
  const wrap = document.getElementById('waitlistWrap');
  if(!rows.length){
    wrap.innerHTML = '<p class="log-empty">Nobody has joined the waitlist yet. Entries appear here the moment someone signs up.</p>';
    return;
  }
  wrap.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
      '<th>Email</th><th>Name</th><th>Company</th><th>Wants to draft</th><th>Joined</th><th>Status</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r){
      return '<tr>' +
        '<td class="filename">' + escapeHtml(r.email) + '</td>' +
        '<td>' + escapeHtml(r.name || '—') + '</td>' +
        '<td>' + escapeHtml(r.company || '—') + '</td>' +
        '<td class="muted">' + escapeHtml(r.note ? (r.note.length > 70 ? r.note.slice(0,70) + '…' : r.note) : '—') + '</td>' +
        '<td><time datetime="' + r.created_at + '" title="' + new Date(r.created_at).toLocaleString('en-GB') + '">' + relTime(new Date(r.created_at).getTime()) + '</time></td>' +
        '<td><span class="status-pill ' + (r.status === 'waiting' ? 'review' : 'ready') + '">' + escapeHtml(r.status) + '</span></td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}

document.getElementById('exportWaitlist').onclick = function(){
  var rows = [['Email','Name','Company','Wants to draft','Joined','Status']].concat(
    FD.waitlist.map(function(r){ return [r.email, r.name || '', r.company || '', r.note || '', new Date(r.created_at).toLocaleString('en-GB'), r.status]; }));
  var csv = rows.map(function(r){ return r.map(function(c){ return '"' + String(c).replace(/"/g,'""') + '"'; }).join(','); }).join('\\n');
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = 'fdai-waitlist.csv';
  a.click();
  URL.revokeObjectURL(a.href);
};

renderWaitlist();
renderAnalytics();
renderLog();

/* ── credits ───────────────────────────────────────────────────────────────
   Every decision here is the server's. This code holds no balance of its own
   and trusts no number it has not just been handed: after any change it shows
   what the database says the balance now is, not what it calculated. */
(function credits(){
  var emailIn  = document.getElementById('creditEmail');
  var lookupBt = document.getElementById('creditLookup');
  var msg      = document.getElementById('creditMsg');
  var found    = document.getElementById('creditFound');
  var nameEl   = document.getElementById('creditName');
  var emailOut = document.getElementById('creditEmailOut');
  var balEl    = document.getElementById('creditBalance');
  var amountIn = document.getElementById('creditAmount');
  var reasonIn = document.getElementById('creditReason');
  var grantBt  = document.getElementById('creditGrant');
  var revokeBt = document.getElementById('creditRevoke');
  var logWrap  = document.getElementById('creditLogWrap');
  var current  = null;

  function say(text, kind){
    msg.textContent = text || '';
    msg.className = 'credit-msg' + (kind ? ' ' + kind : '');
  }

  function busy(on){
    [lookupBt, grantBt, revokeBt].forEach(function(b){ if(b) b.disabled = on; });
  }

  function post(payload){
    return fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r){
      return r.json().catch(function(){ return {}; }).then(function(j){
        if(!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')'));
        return j;
      });
    });
  }

  function lookup(){
    var email = emailIn.value.trim();
    if(!email){ say('Enter an email address.', 'err'); return; }
    busy(true); say('Looking up…');
    post({ action:'lookup', email: email }).then(function(j){
      current = j.user;
      nameEl.textContent = j.user.full_name || '(no name on file)';
      emailOut.textContent = j.user.email;
      balEl.textContent = j.user.balance;
      found.classList.remove('hidden');
      say('');
    }).catch(function(e){
      current = null;
      found.classList.add('hidden');
      say(e.message, 'err');
    }).then(function(){ busy(false); });
  }

  function change(action){
    if(!current){ say('Look up a user first.', 'err'); return; }
    var amount = parseInt(amountIn.value, 10);
    if(!(amount >= 1 && amount <= 1000)){ say('Enter a whole number between 1 and 1000.', 'err'); return; }

    /* Taking credits away is the one move here that can upset somebody, and it
       cannot be undone by pressing the other button — the credits are gone
       from grants that may have been part-spent. So it asks, by name. */
    if(action === 'revoke'){
      var ok = window.confirm('Take ' + amount + ' document' + (amount === 1 ? '' : 's') +
        ' back from ' + current.email + '?\\n\\nThis cannot be undone from here.');
      if(!ok) return;
    }

    busy(true); say(action === 'grant' ? 'Adding…' : 'Removing…');
    post({ action: action, userId: current.user_id, credits: amount, reason: reasonIn.value })
      .then(function(j){
        balEl.textContent = j.balance;
        current.balance = j.balance;
        reasonIn.value = '';
        say(action === 'grant'
          ? ('Added. ' + current.email + ' now has ' + j.balance + '.')
          : ('Removed. ' + current.email + ' now has ' + j.balance + '.'), 'ok');
        loadLog();
      })
      .catch(function(e){ say(e.message, 'err'); })
      .then(function(){ busy(false); });
  }

  function loadLog(){
    post({ action:'recent' }).then(function(j){
      var rows = j.actions || [];
      if(!rows.length){
        logWrap.innerHTML = '<p class="log-empty credit-log">No credits have been given out or taken back yet.</p>';
        return;
      }
      logWrap.innerHTML = '<div class="credit-log"><div class="table-wrap"><table><thead><tr>' +
          '<th>When</th><th>Who</th><th>Account</th><th>Change</th><th>Balance</th><th>Why</th>' +
        '</tr></thead><tbody>' +
        rows.map(function(r){
          var sign = r.action === 'grant' ? '+' : '−';
          return '<tr>' +
            '<td><time datetime="' + r.created_at + '" title="' + new Date(r.created_at).toLocaleString('en-GB') + '">' +
              relTime(new Date(r.created_at).getTime()) + '</time></td>' +
            '<td>' + escapeHtml(r.actor_email || '—') + '</td>' +
            '<td class="filename">' + escapeHtml(r.subject_email || '—') + '</td>' +
            '<td><span class="status-pill ' + (r.action === 'grant' ? 'ready' : 'review') + '">' +
              sign + r.credits + '</span></td>' +
            '<td>' + r.balance_after + '</td>' +
            '<td class="muted">' + escapeHtml(r.reason || '—') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table></div></div>';
    }).catch(function(){
      logWrap.innerHTML = '<p class="log-empty credit-log">The credit history could not be loaded.</p>';
    });
  }

  lookupBt.onclick = lookup;
  emailIn.addEventListener('keydown', function(e){ if(e.key === 'Enter') lookup(); });
  grantBt.onclick  = function(){ change('grant'); };
  revokeBt.onclick = function(){ change('revoke'); };
  loadLog();
})();
</script>
</body>`));

const module_ = `/* GENERATED — do not edit by hand.
 * Source: the admin workspace design, transformed by scripts/build-admin-shell.mjs.
 * Transformations applied:
${applied.map((a, i) => ` *   ${i + 1}. ${a}`).join("\n")}
 *
 * To take a new version of the design: replace the source HTML and re-run
 *   node scripts/build-admin-shell.mjs <design.html>
 */
export const ADMIN_SHELL = ${JSON.stringify(html)};
`;

fs.writeFileSync("src/app/admin/shell.ts", module_);
console.log(`wrote src/app/admin/shell.ts (${html.length} chars)`);
console.log("applied:\n  - " + applied.join("\n  - "));
