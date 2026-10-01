/*
 * foundersdoc.com — the mailing list, on the static pages.
 *
 * WHAT IS ON THE PAGE
 *   1. The footer form on every page (already in the markup; this makes it
 *      save the address).
 *   2. At the end of each article, a box: people who read to the end are the
 *      ones who want the next one.
 *   3. A card in the bottom-right corner. It slides in as soon as the visitor
 *      scrolls past the first screen. Closing it leaves a small "Stay updated" envelope
 *      button in its place; pressing that opens the card again.
 *
 * WHO SEES THE CARD
 *   Everybody, on every visit — except somebody who has already subscribed
 *   on this browser: they see neither the card nor the button again.
 *   Within one visit, once the card has been closed the following pages show
 *   only the button, so nobody is asked twice in five minutes. To have the
 *   card open on every single page instead, set REOPEN_EACH_PAGE to true.
 *
 * All three post to /api/subscribe with the address and where it came from
 * ("Website footer", "Article", "Slide-in"), which is what Slack shows.
 *
 * HOW IT IS ADDED TO A PAGE
 *   <script defer src="/fd-subscribe.js"></script> before </body>.
 */
(function () {
  "use strict";

  var REOPEN_EACH_PAGE = false;
  var SUBSCRIBED_KEY = "fd_subscribed"; // localStorage: this browser has subscribed
  var CLOSED_KEY = "fd_sub_closed"; // sessionStorage: closed during this visit
  var ARTICLES = /^\/(nda-vs-confidentiality-agreement|before-you-sign-an-nda|can-breaching-an-nda-be-expensive|what-is-a-term-sheet|is-a-term-sheet-legally-binding|term-sheet-checklist|term-sheet-mistakes)(\.html)?\/?$/;

  function get(store, key) {
    try {
      return window[store].getItem(key);
    } catch (e) {
      return null;
    }
  }
  function set(store, key, value) {
    try {
      window[store].setItem(key, value);
    } catch (e) {}
  }
  function isSubscribed() {
    return get("localStorage", SUBSCRIBED_KEY) === "1";
  }

  var card = null;
  var launcher = null;

  /* Somebody subscribed, from any of the three forms: the corner goes quiet. */
  function subscribed() {
    set("localStorage", SUBSCRIBED_KEY, "1");
    if (launcher) launcher.classList.remove("on");
    if (card) setTimeout(function () { hideCard(); }, 2200);
  }

  /* One submit handler for all three forms. */
  function wire(form, source) {
    var input = form.querySelector('input[type="email"]');
    var msg = form.querySelector(".msg");
    var honey = form.querySelector('input[name="website"]');
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (input.value || "").trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (msg) msg.textContent = "Please enter a valid email address.";
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
          if (msg) msg.textContent = "You’re in! 🎉 Look out for our next email.";
          subscribed();
        })
        .catch(function () {
          if (button) button.disabled = false;
          if (msg) msg.textContent = "We couldn’t connect just now. Please try again.";
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

  var ENVELOPE =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>';

  var CSS =
    ".fd-sub{font-family:inherit;color:#0f0f0f}" +
    ".fd-sub h3{font-size:22px;line-height:1.25;margin:0 0 8px;font-weight:700}" +
    ".fd-sub p{margin:0 0 14px;color:#4a4a4a;font-size:15px;line-height:1.5}" +
    ".fd-sub .field{display:flex;border:1px solid #d6d6d6;border-radius:10px;overflow:hidden;background:#fff}" +
    ".fd-sub input{flex:1;border:0;padding:12px 14px;font:inherit;font-size:15px;outline:none;min-width:0;background:transparent}" +
    ".fd-sub button[type=submit]{background:#f3bf4b;color:#0f0f0f;border:0;padding:0 16px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}" +
    ".fd-sub button[type=submit]:hover{background:#e9b23b}" +
    ".fd-sub button:disabled{opacity:.6}" +
    ".fd-sub .msg{margin:8px 0 0;font-size:13px;color:#4a4a4a;min-height:1em}" +
    ".fd-sub .fine{margin:10px 0 0;font-size:12px;color:#7a7a7a}" +
    ".fd-sub ul{list-style:none;margin:0 0 14px;padding:0}" +
    ".fd-sub li{font-size:14px;line-height:1.5;color:#2f2f2f;padding-left:24px;position:relative;margin:4px 0}" +
    ".fd-sub li:before{content:'✓';position:absolute;left:2px;top:0;color:#c9962a;font-weight:800}" +
    ".fd-sub-box{background:#fbeec9;border-radius:14px;padding:26px 28px;margin:40px auto 0;max-width:720px}" +
    ".fd-sub-card{position:fixed;right:20px;bottom:20px;z-index:60;width:min(370px,calc(100vw - 40px));background:#fff;border:1px solid #e6e6e6;border-radius:16px;box-shadow:0 18px 44px rgba(0,0,0,.2);padding:0 22px 18px;overflow:hidden;transform:translateY(24px);opacity:0;pointer-events:none;transition:transform .35s ease,opacity .35s ease}" +
    ".fd-sub-card.on{transform:none;opacity:1;pointer-events:auto}" +
    ".fd-sub-card .band{margin:0 -22px 16px;padding:14px 22px;background:#0f0f0f;color:#f3bf4b;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}" +
    ".fd-sub-card .x{position:absolute;top:6px;right:8px;background:none;border:0;font-size:24px;line-height:1;color:#bdbdbd;cursor:pointer;padding:4px 8px}" +
    ".fd-sub-card .x:hover{color:#fff}" +
    ".fd-sub-card h3{font-size:20px}" +
    ".fd-sub-fab{position:fixed;right:20px;bottom:20px;z-index:59;height:56px;min-width:56px;border-radius:28px;border:0;background:#f3bf4b;color:#0f0f0f;box-shadow:0 10px 26px rgba(0,0,0,.22);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 16px;font:inherit;font-weight:700;font-size:14px;transform:scale(.6);opacity:0;pointer-events:none;transition:transform .25s ease,opacity .25s ease}" +
    ".fd-sub-fab.on{transform:none;opacity:1;pointer-events:auto}" +
    ".fd-sub-fab:hover{background:#e9b23b}" +
    "@media (max-width:520px){.fd-sub-fab .lbl{display:none}.fd-sub-fab{padding:0}}" +
    "@media (prefers-reduced-motion:reduce){.fd-sub-card,.fd-sub-fab{transition:none}}";

  function styles() {
    var s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function formHtml(id, cta) {
    return (
      '<form class="fd-sub-form" novalidate><div class="field">' +
      '<input id="' + id + '" type="email" name="email" placeholder="Your email address" autocomplete="email" required />' +
      '<button type="submit">' + cta + "</button></div>" +
      '<p class="msg" aria-live="polite"></p></form>'
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
      "<h3>Enjoyed this? Discover more.</h3>" +
      "<p>Be the first to hear about new FD AI features, fresh guides from our lawyers " +
      "and what’s coming next. A short email now and then, never spam.</p>" +
      formHtml("fd-sub-article", "Keep me updated") +
      '<p class="fine">Unsubscribe any time with one click.</p>';
    article.parentNode.insertBefore(box, article.nextSibling);
    var form = box.querySelector("form");
    form.appendChild(honeypot());
    wire(form, "Article");
  }

  /* 3. The corner card, and the envelope button it leaves behind. */
  function showCard() {
    if (launcher) launcher.classList.remove("on");
    card.classList.add("on");
  }
  function hideCard() {
    if (!card) return;
    card.classList.remove("on");
    if (!isSubscribed() && launcher) launcher.classList.add("on");
  }

  function corner() {
    if (isSubscribed()) return;

    card = document.createElement("aside");
    card.className = "fd-sub fd-sub-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Stay updated with Founders Doc");
    card.innerHTML =
      '<div class="band">Stay in the loop</div>' +
      '<button class="x" type="button" aria-label="Close">×</button>' +
      "<h3>Discover more from Founders Doc ✨</h3>" +
      "<p>Be the first to know when we launch something new.</p>" +
      "<ul><li>New FD AI features, as soon as they go live</li>" +
      "<li>Fresh guides and insights from our lawyers</li>" +
      "<li>A short email now and then, never spam</li></ul>" +
      formHtml("fd-sub-card-email", "Keep me updated") +
      '<p class="fine">Unsubscribe any time.</p>';
    document.body.appendChild(card);

    launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "fd-sub-fab";
    launcher.setAttribute("aria-label", "Stay updated with Founders Doc");
    launcher.innerHTML = ENVELOPE + '<span class="lbl">Stay updated</span>';
    document.body.appendChild(launcher);

    card.querySelector(".x").addEventListener("click", function () {
      set("sessionStorage", CLOSED_KEY, "1");
      hideCard();
    });
    launcher.addEventListener("click", function () {
      showCard();
      var input = card.querySelector('input[type="email"]');
      if (input) input.focus();
    });
    var form = card.querySelector("form");
    form.appendChild(honeypot());
    wire(form, "Slide-in");

    // Closed earlier in this visit: just the button, straight away.
    if (!REOPEN_EACH_PAGE && get("sessionStorage", CLOSED_KEY) === "1") {
      launcher.classList.add("on");
      return;
    }

    // Otherwise the card opens once the first screen has scrolled away.
    var opened = false;
    function check() {
      if (opened) return;
      if (window.scrollY < window.innerHeight * 0.85) return;
      opened = true;
      window.removeEventListener("scroll", check);
      showCard();
    }
    window.addEventListener("scroll", check, { passive: true });
    check();
  }

  function start() {
    styles();
    footer();
    articleBox();
    corner();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
