"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import Logo from "./Logo";

/**
 * The marketing site and FD AI are one deployment on one domain now, so every
 * link here is a plain path. (This used to be an absolute host, from when the
 * app lived on its own Vercel URL.)
 */
const SITE = "";

const Chevron = () => (
  <svg
    viewBox="0 0 10 10"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 3.5l3 3 3-3" />
  </svg>
);

/* ------------------------------------------------------------------ theme */

/**
 * Theme, held as an external store over the `data-theme` attribute.
 *
 * It reads and writes the same key the marketing site uses (`fd-theme`), so a
 * visitor who chose dark on foundersdoc.com is not thrown back into light here
 * — provided the app is served from a foundersdoc.com subdomain, which is what
 * the CNAME step in the deployment notes buys. On a bare *.vercel.app host the
 * storage origin differs and the toggle simply starts from light.
 *
 * The first paint is done by the inline script in the root layout, before React
 * hydrates. `useState` + `useEffect` would be the obvious shape for the button,
 * but it renders once with the wrong answer and then corrects itself;
 * `useSyncExternalStore` lets the server render the light default and the client
 * read the real attribute in the same commit.
 */
let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

function useTheme() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("fd-theme", next);
    } catch {
      /* private browsing — the choice just does not survive the tab */
    }
    listeners.forEach((l) => l());
  }

  return { dark, toggle };
}

/* --------------------------------------------------------------- dropdown */

function Dropdown({
  label,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="has-sub" data-open={String(open)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {label} <Chevron />
      </button>
      <div className="nav-sub" onClick={onClose}>
        {children}
      </div>
    </div>
  );
}


/* ---------------------------------------------------------- account chip */

/** Two letters from the local part: fd.admin → FA, lam → LA. */
function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return (letters || "FD").toUpperCase();
}

/**
 * Who is signed in, in the top-right corner, opening a small account menu.
 *
 * It reuses the nav's own dropdown machinery (`.has-sub` / `.nav-sub`) so it
 * opens, closes and behaves exactly like FD AI or Resources — one interaction
 * model in the bar, not two.
 */
function AccountChip({
  email,
  open,
  onToggle,
  onClose,
}: {
  email: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [local, domain] = email.split("@");
  return (
    <div className="has-sub nav-acct" data-open={String(open)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Account: ${email}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <i aria-hidden="true">{initials(email)}</i>
        <span className="who">
          <b>{local}</b>
          <small>{domain}</small>
        </span>
        <Chevron />
      </button>
      <div className="nav-sub" onClick={onClose}>
        {/* Credits sits with the other account business. Before this, /billing
            was reachable only from the paywall — which is to say, only once you
            had already run out. Somebody wanting to top up in advance had no
            way in but to type the URL. */}
        <Link href="/billing">Credits</Link>
        <Link href="/usage">Usage</Link>
        <Link href="/settings">Settings</Link>
        <form action="/auth/signout" method="post">
          <button type="submit">Log out</button>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- nav */

export function AppNav({
  userEmail,
  signedIn,
}: {
  userEmail?: string | null;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // Same shrink-on-scroll behaviour as the site's nav.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Click anywhere else, or Escape, closes an open dropdown.
  useEffect(() => {
    const onClick = () => setOpenSub(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenSub(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const here = (href: string) => (pathname === href ? "page" : undefined);
  const sub = (name: string) => ({
    open: openSub === name,
    onToggle: () => setOpenSub(openSub === name ? null : name),
    onClose: () => setOpenSub(null),
  });

  /* ────────────────────────────────────────────────────────────────────────
     THE NAV BAR IS THE HOMEPAGE'S NAV BAR. Same items, same order, same
     wording, same links — signed in or signed out, on every screen of the app.
     A person moving between foundersdoc.com and FD AI should not be able to
     tell that anything underneath changed.

     Everything that belongs to a signed-in session — past drafts, usage, the
     theme, sign out — lives INSIDE the FD AI dropdown, so the visible bar never
     gains or loses an item.
     ──────────────────────────────────────────────────────────────────────── */
  return (
    <nav className={scrolled ? "nav scrolled" : "nav"} aria-label="Main">
      <div className="wrap">
        <Link className="logo" href="/" aria-label="Founders Doc — home">
          <Logo />
        </Link>

        <div className="links">
          {/* Draft and Review only. Everything to do with the session — past
              drafts, usage, settings, signing out — belongs to the account
              menu, and the theme belongs beside it. */}
          <Dropdown label="FD AI" {...sub("ai")}>
            <Link href="/draft" aria-current={here("/draft")}>
              Draft
            </Link>
            <a href="/#about">Review</a>
          </Dropdown>
          <a href="/#lawyers">Ask a Lawyer</a>
          <Dropdown label="Services" {...sub("svc")}>
            <a href="/fd-consult">FD Consult</a>
            <a href="/#services">FD Legal</a>
          </Dropdown>
        </div>

        <div className="links r">
          <Dropdown label="Resources" {...sub("res")}>
            <a href="/resources">Blog</a>
            <a href="/coming-soon?f=Courses">Courses</a>
            <a href="/podcast">Podcast</a>
          </Dropdown>
          <a href="/about">About us</a>
        </div>

        <div className="nav-cta">
          <a className="btn btn-white" href="/contact">
            Book a consultation
          </a>
          <Link className="btn btn-gold" href="/draft">
            Launch FD AI
          </Link>
          {/* Signed out: the account chip's place is taken by a plain Log in.
              The drafting screen is open to visitors now, so this is the only
              door back to an existing account that is always on screen. */}
          {!signedIn && (
            <Link className="nav-login" href="/login?next=%2Fdraft">
              Log in
            </Link>
          )}
        </div>

        {/* Light / dark, in the same corner as on the other subpages. */}
        <button
          className="theme"
          type="button"
          onClick={toggle}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title="Switch theme"
        >
          <svg
            className="sun"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <svg
            className="moon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          </svg>
        </button>

        {signedIn && userEmail && <AccountChip email={userEmail} {...sub("acct")} />}

        <button
          className="burger"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
        >
          <span></span>
        </button>
      </div>

      <div className="menu" id="menu" data-open={String(menuOpen)} onClick={() => setMenuOpen(false)}>
        <div className="wrap">
          <div className="menu-group">
            <span>FD AI</span>
            <Link href="/draft">Draft</Link>
            <a href="/#about">Review</a>
          </div>
          <a href="/#lawyers">Ask a Lawyer</a>
          <div className="menu-group">
            <span>Services</span>
            <a href="/fd-consult">FD Consult</a>
            <a href="/#services">FD Legal</a>
          </div>
          <div className="menu-group">
            <span>Resources</span>
            <a href="/resources">Blog</a>
            <a href="/coming-soon?f=Courses">Courses</a>
            <a href="/podcast">Podcast</a>
          </div>
          <a href="/about">About us</a>
          <a href="/contact">Contact us</a>
          {!signedIn && (
            <div className="menu-group">
              <Link href="/login?next=%2Fdraft">Log in</Link>
              <Link href="/signup">Sign up for free</Link>
            </div>
          )}
          {signedIn && (
            <div className="menu-group">
              <span>{userEmail}</span>
              <Link href="/billing">Credits</Link>
              <Link href="/usage">Usage</Link>
              <Link href="/settings">Settings</Link>
              <form action="/auth/signout" method="post">
                <button type="submit" style={{ padding: "4px 0 4px 12px", fontSize: 15 }}>
                  Log out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

/* ----------------------------------------------------------------- footer */

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="grid">
          <div>
            <a className="logo" href="/" aria-label="Founders Doc — home">
              <Logo forceWhite />
            </a>
            <p className="about">
              Contracts for founders everywhere, drafted by FD AI and reviewed by the practising
              lawyers behind it. Every draft is checked by a qualified lawyer before it leaves the
              firm.
            </p>
          </div>

          <div>
            <h4>FD AI</h4>
            <ul>
              <li>
                <Link href="/draft">New draft</Link>
              </li>
              <li>
                <Link href="/history">Past drafts</Link>
              </li>
              <li>
                <Link href="/usage">Usage</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Quick links</h4>
            <ul>
              <li>
                <a href="/">Home</a>
              </li>
              <li>
                <a href={`${SITE}/about`}>About us</a>
              </li>
              <li>
                <a href={`${SITE}/coming-soon?f=All%20services`}>Our services</a>
              </li>
              <li>
                <a href={`${SITE}/resources`}>Blog</a>
              </li>
              <li>
                <a href={`${SITE}/podcast`}>Podcast</a>
              </li>
              <li>
                <a href={`${SITE}/contact`}>Contact us</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>Useful links</h4>
            <ul>
              <li>
                <a href="/terms-of-service">Terms &amp; conditions</a>
              </li>
              <li>
                <a href="/privacy-policy">Privacy policy</a>
              </li>
              <li>
                <a href="/community-guidelines">Community guidelines</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>Contact us</h4>
            <ul>
              <li>
                <a href="https://wa.me/6594617390?text=Hi!">+65 9461 7390 (WhatsApp only)</a>
              </li>
              <li>
                <a href="mailto:administrator@foundersdoc.com">administrator@foundersdoc.com</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="bot">
          <span>© {new Date().getFullYear()} Founders Doc. All rights reserved.</span>
          <div>
            <a href="https://www.linkedin.com/company/foundersdoc/">LinkedIn</a>
            <a href="https://www.instagram.com/foundersdoc/">Instagram</a>
            <a href="https://www.youtube.com/channel/UCYQebtLCvD2esHthgPAxrFg">YouTube</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
