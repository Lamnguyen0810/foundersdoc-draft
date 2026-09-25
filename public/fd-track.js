/*
 * foundersdoc.com — visit and intent counting for the static pages.
 *
 * WHY THIS IS TWELVE LINES OF VANILLA JS AND NOT AN ANALYTICS TAG
 *   A tag from Google or similar means cookies, a consent banner, and a third
 *   party holding a record of who read which page on a law firm's website. This
 *   posts to foundersdoc.com's own endpoint, sets no cookie, and stores nothing
 *   on the visitor's machine except a random id that dies with the tab.
 *
 * WHAT IT RECORDS
 *   That a page was opened, and that one of three buttons was pressed. Nothing
 *   typed, nothing identifying, no scroll maps, no session replay.
 *
 * HOW IT IS ADDED TO A PAGE
 *   <script defer src="/fd-track.js"></script> before </body>. Nothing else.
 *   Adding a new page? Add that line. Forgetting it loses the page's counts and
 *   breaks nothing.
 */
(function () {
  "use strict";

  var KEY = "fd_anon";

  function anonId() {
    try {
      var id = sessionStorage.getItem(KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 24);
        sessionStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      return null; // private windows throw; the event still counts, unjoined
    }
  }

  function send(name, props) {
    try {
      var body = JSON.stringify({
        name: name,
        anon_id: anonId(),
        path: location.pathname,
        referrer: document.referrer || null,
        props: props || {},
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
        return;
      }
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true,
      })["catch"](function () {});
    } catch (e) {
      /* counting must never break a page */
    }
  }

  send("page_view");

  /* One delegated listener rather than a handler per button: the markup is not
     touched, and a button added to a page later is picked up for free.

     NOTE ON "Book a consultation": it points at /contact, not /fd-consult. The
     intent is what is being counted, not the URL, so both spellings — and the
     button's own words — all land on consult_click. Getting this wrong would
     have logged the firm's most valuable click as a page visit. */
  document.addEventListener(
    "click",
    function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a,button") : null;
      if (!a) return;

      var href = (a.getAttribute("href") || "").toLowerCase();
      var label = (a.textContent || "").trim().toLowerCase();
      var page = location.pathname.replace(/^\/|\.html$/g, "") || "home";

      var isConsult =
        label.indexOf("book a consultation") !== -1 ||
        label.indexOf("ask a lawyer") !== -1 ||
        href.indexOf("/fd-consult") === 0 ||
        href.indexOf("/contact") === 0;

      var isLaunch = href.indexOf("/draft") === 0 || label.indexOf("launch fd ai") !== -1;

      if (isConsult) send("consult_click", { source: page });
      else if (isLaunch) send("launch_fdai_click", { source: page });
    },
    true,
  );

  /* An actual enquiry, as opposed to someone merely reaching the form. This is
     the difference between interest and a lead, and only a submit event knows
     which one happened. No field values are read — only that it was sent. */
  document.addEventListener(
    "submit",
    function () {
      send("contact_submit", { source: location.pathname.replace(/^\/|\.html$/g, "") || "home" });
    },
    true,
  );

  /* "Read the article", defined honestly: reached the end AND stayed 30s. A
     page view on a blog post means someone clicked; this means someone read. */
  if (/\/(nda-vs-confidentiality-agreement|before-you-sign-an-nda|can-breaching-an-nda-be-expensive|what-is-a-term-sheet|is-a-term-sheet-legally-binding|term-sheet-checklist|term-sheet-mistakes)/.test(location.pathname)) {
    var landed = Date.now();
    var done = false;
    window.addEventListener(
      "scroll",
      function () {
        if (done) return;
        var seen = window.scrollY + window.innerHeight;
        if (seen < document.body.scrollHeight * 0.9) return;
        if (Date.now() - landed < 30000) return;
        done = true;
        send("article_read", { seconds: Math.round((Date.now() - landed) / 1000) });
      },
      { passive: true },
    );
  }
})();
