/**
 * Lists the models your Gemini API key can actually use.
 *
 *   node --env-file=.env.local scripts/list-models.mjs
 *   GEMINI_API_KEY=AIza... node scripts/list-models.mjs
 *
 * Run this when a draft fails with "model was not found". Model ids change:
 * Google ships new lines and retires old ones, and an id that worked last month
 * can answer 404 today. This prints the truth for your key rather than a guess.
 */

const key = process.env.GEMINI_API_KEY?.trim();
if (!key) {
  console.error("GEMINI_API_KEY is not set. Add it to .env.local, or pass it inline.");
  process.exit(1);
}

const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
  headers: { "x-goog-api-key": key },
});

if (!res.ok) {
  console.error(`Google returned ${res.status}:`, (await res.text()).slice(0, 400));
  process.exit(1);
}

const { models = [] } = await res.json();

const usable = models
  .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
  .map((m) => ({
    id: (m.name ?? "").replace(/^models\//, ""),
    display: m.displayName ?? "",
  }))
  .filter((m) => m.id);

const flash = usable.filter((m) => m.id.includes("flash"));

console.log(`\n${usable.length} models can generate content with this key.\n`);
console.log("Flash models (fast and cheap — what FD AI wants):");
for (const m of flash) console.log(`  ${m.id.padEnd(34)} ${m.display}`);

console.log("\nEverything else:");
for (const m of usable.filter((x) => !x.id.includes("flash"))) {
  console.log(`  ${m.id.padEnd(34)} ${m.display}`);
}

console.log(
  "\nSet one of these as GEMINI_MODEL, or leave it unset to use the " +
    '"gemini-flash-latest" alias, which tracks the current Flash release.\n',
);
