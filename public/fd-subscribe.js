/*
 * foundersdoc.com — the mailing list, on the static pages.
 *
 * WHAT USED TO BE HERE
 *   A pop-up that opened on every visit, on every page, until people stopped
 *   reading past it. It collected 71 addresses and a lot of annoyance.
 *
 * WHAT THIS DOES INSTEAD — the pattern most sites settled on
 *   1. The footer form on every page is made real. It is already in the
 *      markup; until now it said "thanks" and saved nothing.
 *   2. At the end of each article, a box: people who read to the end are the
 *      ones who want the next one.
 *   3. One small card in the bottom corner, on the marketing pages only, after
 *      the visitor has scrolled halfway. It appears once; dismissed or used,
 *      it stays away for 60 days. Never shown to somebody who is signed in to
 *      FD AI — they are already in the firm's hands.
 *
 * All three post to /api/subscribe with the address and where it came from
 * ("Website footer", "Article", "Slide-in"), which is what Slack shows.
 *
 * HOW IT IS ADDED TO A PAGE
 *   <script defer src="/fd-subscribe.js"></script> before </body>.
 */
(function () {
  "use strict";

  var QUIET_KEY = "fd_sub_quiet_until";
  var QUIET_DAYS = 60;
  var ARTICLES = /^\/(nda-vs-confidentiality-agreement|before-you-sign-an-nda|can-breaching-an-nda-be-expensive|what-is-a-term-sheet|is-a-term-sheet-legally-binding|term-sheet-checklist|term-sheet-mistakes)(\.html)?\/?$/;

  function quiet(days) {
    try {
      localStorage.setItem(QUIET_KEY, String(Date.now() + days * 864e5));
    } catch (e) {}
  }
  function isQuiet() {
    try {
      return Number(localStorage.getItem(QUIET_KEY) || 0) > Date.now();
    } catch (e) {
      return true; // storage blocked: do not nag somebody we cannot remember
    }
  }
  function signedIn() {
    // Supabase keeps its session in cookies named sb-<ref>-auth-token.
    return /(^|;\s*)sb-[^=]*auth-token/.test(document.cookie);
  }

  /* One submit handler for all three forms. */
  function wire(form, source, onDone) {
    var input = form.querySelector('input[type="email"]');
    var msg = form.querySelector(".msg");
    var honey = form.querySelector('input[name="website"]');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (input.value || "").trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (msg) msg.textContent = "Enter a valid email address to subscribe.";
        input.focus();
        return;
      }
      if (button) button.disabled = true;
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email, source: source, website: honey ? honey.value : "" }),
      })
        .then(function (r) {
          return r.json().catch(function () {
            return {};
          }).then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (res) {
          if (button) button.disabled = false;
          if (!res.ok) {
            if (msg) msg.textContent = res.j.error || "Something went wrong. Please try again.";
            return;
          }
          form.reset();
          if (msg) msg.textContent = "You’re on the list. Thank you.";
          quiet(QUIET_DAYS);
          if (onDone) onDone();
        })
        .catch(function () {
          if (button) button.disabled = false;
          if (msg) msg.textContent = "We couldn’t reach the server. Please try again.";
        });
    });
  }

  /* A field no person sees. */
  function honeypot() {
    var h = document.createElement("input");
    h.type = "text";
    h.name = "website";
    h.tabIndex = -1;
    h.autocomplete = "off";
    h.setAttribute("aria-hidden", "true");
    h.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";
    return h;
  }

  /* 1. The footer form that was already there. */
  function footer() {
    var old = document.getElementById("nl-form");
    if (!old) return;
    var form = old.cloneNode(true); // drops the placeholder handler the page shipped with
    old.parentNode.replaceChild(form, old);
    form.appendChild(honeypot());
    wire(form, "Website footer");
  }

  var CSS =
    ".fd-sub{font-family:inherit;color:#0f0f0f}" +
    ".fd-sub h3{font-size:22px;line-height:1.25;margin:0 0 6px;font-weight:700}" +
    ".fd-sub p{margin:0 0 14px;color:#4a4a4a;font-size:15px;line-height:1.5}" +
    ".fd-sub .field{display:flex;border:1px solid #d6d6d6;border-radius:8px;overflow:hidden;background:#fff}" +
    ".fd-sub input{flex:1;border:0;padding:12px 14px;font:inherit;font-size:15px;outline:none;min-width:0;background:transparent}" +
    ".fd-sub button{background:#f3bf4b;color:#0f0f0f;border:0;padding:0 18px;font:inherit;font-weight:700;cursor:pointer}" +
    ".fd-sub button:disabled{opacity:.6}" +
    ".fd-sub .msg{margin:8px 0 0;font-size:13px;color:#4a4a4a;min-height:1em}" +
    ".fd-sub-box{background:#fbeec9;border-radius:14px;padding:26px 28px;margin:40px auto 0;max-width:720px}" +
    ".fd-sub-card{position:fixed;right:20px;bottom:20px;z-index:60;width:min(360px,calc(100vw - 40px));background:#fff;border:1px solid #e6e6e6;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.18);padding:22px 22px 18px;transform:translateY(24px);opacity:0;transition:transform .35s ease,opacity .35s ease}" +
    ".fd-sub-card.on{transform:none;opacity:1}" +
    ".fd-sub-card .x{position:absolute;top:8px;right:10px;background:none;border:0;font-size:22px;line-height:1;color:#7a7a7a;cursor:pointer;padding:4px 6px}" +
    ".fd-sub-card h3{font-size:18px;padding-right:24px}" +
    "@media (prefers-reduced-motion:reduce){.fd-sub-card{transition:none}}";

  function styles() {
    var s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function formHtml(id) {
    return (
      '<form class="fd-sub-form" novalidate><div class="field">' +
      '<input id="' + id + '" type="email" name="email" placeholder="Email address" autocomplete="email" required />' +
      '<button type="submit">Subscribe</button></div><p class="msg" aria-live="polite"></p></form>'
    );
  }

  /* 2. The box at the end of an article. */
  function articleBox() {
    if (!ARTICLES.test(location.pathname)) return;
    var article = document.querySelector("main article");
    if (!article) return;
    var box = document.createElement("section");
    box.className = "fd-sub fd-sub-box";
    box.innerHTML =
      "<h3>Found this useful? Get the next one by email.</h3>" +
      "<p>One short note when we publish a new guide for founders. No sales emails, and you can leave any time.</p>" +
      formHtml("fd-sub-article");
    article.parentNode.insertBefore(box, article.nextSibling);
    var form = box.querySelector("form");
    form.appendChild(honeypot());
    wire(form, "Article");
  }

  /* 3. The corner card, once. */
  function slideIn() {
    if (isQuiet() || signedIn()) return;
    if (location.pathname.indexOf("/draft") === 0) return;
    var shown = false;
    function maybe() {
      if (shown) return;
      var scrolled = window.scrollY + window.innerHeight;
      var full = document.documentElement.scrollHeight;
      if (full > 0 && scrolled / full < 0.5) return;
      shown = true;
      window.removeEventListener("scroll", maybe);
      var card = document.createElement("aside");
      card.className = "fd-sub fd-sub-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", "Subscribe to Founders Doc");
      card.innerHTML =
        '<button class="x" type="button" aria-label="Close">×</button>' +
        "<h3>Founder-friendly legal know-how, by email.</h3>" +
        "<p>A short note when we publish something worth your time. Leave any time.</p>" +
        formHtml("fd-sub-card-email");
      document.body.appendChild(card);
      requestAnimationFrame(function () {
        card.classList.add("on");
      });
      function close() {
        card.classList.remove("on");
        setTimeout(function () {
          if (card.parentNode) card.parentNode.removeChild(card);
        }, 350);
      }
      card.querySelector(".x").addEventListener("click", function () {
        quiet(QUIET_DAYS);
        close();
      });
      var form = card.querySelector("form");
      form.appendChild(honeypot());
      wire(form, "Slide-in", function () {
        setTimeout(close, 1800);
      });
    }
    window.addEventListener("scroll", maybe, { passive: true });
    setTimeout(maybe, 45000); // a long, slow read with no scrolling still counts as interest
  }

  function start() {
    styles();
    footer();
    articleBox();
    slideIn();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
