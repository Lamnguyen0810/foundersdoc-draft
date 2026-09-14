/**
 * Proves the AI key works before you go looking for bugs in the app.
 *
 *   node --env-file=.env.local scripts/smoke-ai.mjs
 *
 * Node 22 reads .env.local with --env-file, so no dotenv dependency is needed.
 */

const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
console.log(`AI_PROVIDER = ${provider}`);

if (provider === "mock") {
  console.log("Mock provider needs no key. Nothing to check.");
  process.exit(0);
}

if (provider === "gemini") {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  if (!key) {
    console.error("GEMINI_API_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with exactly: FDAI OK" }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    },
  );
  if (!res.ok) {
    console.error(`Gemini returned ${res.status}:`, (await res.text()).slice(0, 400));
    process.exit(1);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  console.log("model  :", model);
  console.log("reply  :", text.trim() || "(empty)");
  console.log("tokens :", json.usageMetadata?.promptTokenCount, "in /", json.usageMetadata?.candidatesTokenCount, "out");
  console.log(text.includes("FDAI OK") ? "\n✅ Key works." : "\n⚠️ Key works but the reply was unexpected — check the model id.");
  process.exit(0);
}

console.log(`No smoke test written for "${provider}". Start the app and generate a draft instead.`);
