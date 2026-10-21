import { useState } from "react";
import type { ZodType } from "zod";
import { renderMessage } from "@supplies/core/messages";
import { ApiError } from "../api/client";
import { messageFor } from "../components/auth/field";

/**
 * The shape every public auth form has: local values, a schema checked before
 * the request, and one place for whatever the server refused.
 *
 * The Next versions use react-hook-form; these use `useState`. That is a
 * dependency difference, not a behavioural one — both resolve against the same
 * schema from `@supplies/core/validation/auth`, so the two clients refuse the
 * same input for the same reasons and the API refuses it again.
 *
 * Errors are keyed by field so each one renders next to its own input, and the
 * whole map clears on submit rather than per keystroke: correcting one field
 * should not make another's complaint vanish before it has been read.
 */
export function useAuthForm<T extends Record<string, unknown>>({
  schema,
  initial,
  submit,
}: {
  schema: ZodType<T>;
  initial: T;
  submit: (values: T) => Promise<void>;
}) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<keyof T, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof T | undefined;
        // First issue per field wins: a password that is both too short and
        // has no digit should say one thing, not stack two.
        if (field !== undefined && !next[field]) next[field] = messageFor(issue.message);
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      await submit(parsed.data);
    } catch (cause) {
      // `ApiError.message` is already the Ukrainian the API rendered from the
      // shared catalogue — the same sentence the web app shows for the same
      // refusal.
      setFormError(
        cause instanceof ApiError
          ? cause.message
          : renderMessage({ key: "error.unexpected" }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return { values, set, errors, formError, submitting, onSubmit };
}
