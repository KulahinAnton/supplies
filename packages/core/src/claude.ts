import Anthropic from "@anthropic-ai/sdk";
import { ruleMessage, type RuleMessage } from "./messages";

/**
 * Feature 32 — the only place this app talks to the Claude API.
 *
 * **Model: Claude Haiku 4.5, because the cheapest was asked for.** At $1/$5 per
 * million tokens it is the least expensive model available, and this request is
 * a short list in and a short recipe out — the task does not reward a larger
 * model. `ANTHROPIC_MODEL` overrides it without a deploy if that judgement
 * turns out wrong.
 *
 * Haiku 4.5 predates adaptive thinking and effort levels, so neither is set:
 * `effort` is rejected on this model, and a thinking budget would spend tokens
 * on deliberation this task does not need.
 *
 * Nothing here is cached. Prompt caching has a minimum cacheable prefix in the
 * thousands of tokens and this system prompt is a few hundred — a breakpoint
 * would cost a parameter and buy nothing.
 */

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

/**
 * Enough for a recipe with a handful of steps, and a hard ceiling on the
 * expensive half of the bill. Output is billed at five times input here, so
 * this number matters more than the pantry list does.
 */
const MAX_TOKENS = 900;

export type ClaudeText =
  | {
      ok: true;
      text: string;
      /** Reported back so the UI can price it — see `estimateCostUsd`. */
      model: string;
      usage: { input: number; output: number };
    }
  | { ok: false; error: RuleMessage };

/**
 * One request, one text answer.
 *
 * Never throws. A model that is unreachable, rate-limited or misconfigured is
 * an ordinary outcome for a button someone pressed, and the page shows a
 * Ukrainian sentence rather than an error boundary.
 */
export async function askClaude(
  system: string,
  prompt: string,
): Promise<ClaudeText> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: ruleMessage("recipe.notConfigured") };
  }

  /**
   * The SDK defaults are a 10-minute timeout and 2 retries — sane for a script,
   * wrong inside a serverless function. The platform would kill the function
   * long before the SDK gave up, so a hung upstream call would surface as a
   * generic Next error instead of the Ukrainian sentence this module exists to
   * guarantee.
   *
   * The arithmetic matters: worst case is `timeout × (maxRetries + 1)` plus
   * backoff, so 12s × 2 ≈ 25s, which fits inside the 30s `maxDuration` the
   * recipes segment declares. Raising either number without raising that one
   * puts the timeout back outside the platform's patience.
   *
   * A normal Haiku reply here takes a few seconds; 12s is a ceiling, not a
   * target.
   */
  const client = new Anthropic({ timeout: 12_000, maxRetries: 1 });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    // `content` is a discriminated union; only text blocks are expected here,
    // and joining rather than taking [0] survives the model splitting its
    // answer across blocks.
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return { ok: false, error: ruleMessage("recipe.empty") };

    return {
      ok: true,
      text,
      model: MODEL,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    };
  } catch (error) {
    // Most specific first — a rate limit is worth telling the user to wait
    // about, and a bad key is worth telling the household's admin about.
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: ruleMessage("recipe.notConfigured") };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: ruleMessage("recipe.rateLimited") };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`[claude] API error ${error.status}:`, error.message);
      return { ok: false, error: ruleMessage("recipe.unavailable") };
    }
    console.error("[claude] unexpected failure:", error);
    return { ok: false, error: ruleMessage("recipe.unavailable") };
  }
}
