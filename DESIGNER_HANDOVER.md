# FD AI — handover for a designer

You have been asked to work on the front end of FD AI, the drafting tool for
Founders Doc (foundersdoc.com). This file tells you how to run it, where the
design lives, and what not to touch.

---

## 🔑 The one thing that makes this easy

You do **not** need an API key, a Google account, a database, or any credentials
to run this and see every screen. Set one variable to `mock` and the whole app
runs offline. The AI is faked; everything you would want to design is real.

---

## ▶️ Running it

You need [Node.js 20 or newer](https://nodejs.org). Then, in the project folder:

```bash
npm install

# Windows PowerShell
Set-Content .env.local "AI_PROVIDER=mock"

# macOS / Linux
echo "AI_PROVIDER=mock" > .env.local

npm run dev
```

Open **http://localhost:3000**. Edit any file and the browser updates itself.

| Screen | URL |
| --- | --- |
| 🏠 Home | `/` |
| ✍️ New draft — the main screen | `/draft` |
| 📚 Past drafts | `/history` |
| 📊 Usage | `/usage` |
| 🔐 Sign-in | `/login` |

On `/draft`, fill anything into the form and press **Generate draft**. In mock
mode it streams back the assembled prompt instead of a contract — which is
ideal, because it exercises the streaming, the editor and the loading states
without a network call.

---

## 🎨 Where the design lives

| File | What it holds |
| --- | --- |
| **`src/app/globals.css`** | **Start here.** The entire design system: colour tokens, type scale, buttons, nav, dropdowns, footer, forms, light **and** dark |
| `src/components/SiteChrome.tsx` | Nav bar and footer markup |
| `src/components/Logo.tsx` | Logo, with light/dark variants |
| `src/app/layout.tsx` | Wraps every page: fonts, the two banners at the top, the no-flash theme script |
| `src/app/page.tsx` | Home page |
| `src/app/draft/DraftForm.tsx` | The drafting screen — form, Generate button, output panel. The largest file, and the one that matters most |
| `src/app/history/page.tsx`, `usage/page.tsx`, `login/` | The smaller screens |

### How the styling works

It is **plain CSS with custom properties**, not Tailwind utility soup. Change a
token in `:root` and it changes everywhere:

```css
:root {
  --gold: #f3bf4b;
  --black: #0f0f0f;
  --grey-5: #666;
  /* ... */
}

html[data-theme="dark"] {
  --white: #0f0f0f;
  --black: #f4f4f4;   /* "strongest ink", not literally black */
  /* ... */
}
```

Dark mode works by redefining the same tokens. **If you add a colour, add it as
a token and give it a dark value** — a hard-coded hex will look wrong in one of
the two themes.

Class names match the marketing site exactly: `.btn`, `.btn-gold`, `.btn-white`,
`.nav`, `.has-sub`, `.nav-sub`, `.menu`, `.foot`, `.wrap`, `.card`, `.input`,
`.kicker`, `.sub`, `.glow`. If you have seen foundersdoc.com's source, you know
this stylesheet.

---

## ⛔ Please do not change

| Path | Why |
| --- | --- |
| `src/lib/**` | Prompts, the AI adapters, document types, Word export. Business logic, not design |
| `src/app/api/**` | Server routes |
| `src/middleware.ts` | Auth |
| The class names listed above | They are shared with the live marketing site. Renaming them breaks the visual match, which is the whole point of this design |

Restyle those classes freely. Just don't rename them.

---

## ✅ Before handing it back

```bash
npm run lint    # must pass
npm run build   # must pass
```

Then check every screen in **both themes** — the sun/moon button in the nav
toggles it — and at a narrow width, where the nav collapses to a burger menu.

Send back the whole folder, minus `node_modules` and `.next`.

---

## 🧭 Context worth having

- This app is deployed separately from foundersdoc.com but must look like one
  product. Someone clicking **Start drafting** on the marketing site should not
  notice they have crossed to a different application.
- The users are founders, often non-native English speakers, often on a phone.
  Clarity beats cleverness.
- The two banners at the top of every page are deliberate. The gold one
  ("AI-generated draft — must be reviewed by a qualified lawyer") is a legal
  requirement for the firm and stays. The dark one about accounts disappears on
  its own once the database is configured.
- Only one document type exists today (NDA). More are coming, so the home page's
  card grid and the form's document-type selector both need to still look right
  with eight or ten.
