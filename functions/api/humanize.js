/* POST /api/humanize  { text, strength: "light" | "medium" | "strong" }
 * Requires Pages secret: ANTHROPIC_API_KEY
 *   npx wrangler pages secret put ANTHROPIC_API_KEY --project-name lll-humanize
 */
const MAX_CHARS = 5000;

const STYLE = {
  light:
    "Make minimal edits: vary a few sentence lengths, add natural contractions, remove stock transition phrases. Keep wording otherwise close to the original.",
  medium:
    "Rewrite with a natural, human rhythm: mix short and long sentences, use contractions, remove filler transitions (furthermore, moreover, in conclusion), and let the register be slightly conversational while keeping all facts and meaning intact.",
  strong:
    "Rewrite thoroughly in a distinctly human voice: irregular sentence rhythm, occasional fragments where natural, concrete phrasing over abstract phrasing, no stock transitions, first-person color where the original allows it. Preserve every fact, claim, and the original language of the text.",
};

export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json" };

  if (!env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "Server not configured: missing API key." }), { status: 500, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), { status: 400, headers });
  }

  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.text !== "string") {
    return new Response(JSON.stringify({ error: "Text must be a string." }), { status: 400, headers });
  }

  const text = body.text.trim();
  const strength = typeof body.strength === "string" && Object.hasOwn(STYLE, body.strength)
    ? body.strength : "medium";

  if (!text) {
    return new Response(JSON.stringify({ error: "Text is required." }), { status: 400, headers });
  }
  if (text.length > MAX_CHARS) {
    return new Response(JSON.stringify({ error: `Text too long (max ${MAX_CHARS} characters).` }), { status: 400, headers });
  }

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system:
          "You rewrite text to sound naturally human-written. " +
          STYLE[strength] +
          " Respond with ONLY the rewritten text, no preamble, no quotes, no markdown. Reply in the same language as the input.",
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => "");
      console.error("Anthropic API error", apiRes.status, detail.slice(0, 300));
      return new Response(JSON.stringify({ error: "Rewrite service unavailable. Try again shortly." }), { status: 502, headers });
    }

    const data = await apiRes.json();
    if (!Array.isArray(data.content)) throw new Error("Invalid rewrite response");
    const rewritten = data.content
      .filter((b) => b && b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!rewritten) throw new Error("Empty rewrite response");
    return new Response(JSON.stringify({ rewritten }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: "Rewrite service unavailable. Try again shortly." }), { status: 502, headers });
  }
}
