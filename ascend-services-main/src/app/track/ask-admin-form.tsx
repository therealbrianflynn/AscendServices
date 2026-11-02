"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ASK_ADMIN_MESSAGE_MAX_LENGTH } from "@/lib/requests/ask-admin";

const FIELD_CLASS =
  "mt-1 w-full rounded-lg border border-ascend-taupe/50 bg-ascend-bg px-3 py-2 text-ascend-ink shadow-sm outline-none focus:border-ascend-sky-deep focus:ring-2 focus:ring-ascend-sky/60";

const ERROR_MESSAGES: Record<string, string> = {
  required: "Please write your question.",
  too_long: "That is longer than we can store — please shorten it.",
  rate_limited: "You have already sent several questions this hour. Please wait and try again.",
  invalid_body: "Something went wrong on our side. Please try again.",
  ask_admin_failed: "Something went wrong on our side. Please try again.",
};

export function AskAdminForm({ token }: { token: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    setSent(false);

    try {
      const response = await fetch(
        `/api/requests/track/${encodeURIComponent(token)}/questions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const code = typeof body?.error === "string" ? body.error : "ask_admin_failed";
        const field = typeof body?.field === "string" ? body.field : code;
        setError(ERROR_MESSAGES[field] ?? ERROR_MESSAGES[code] ?? ERROR_MESSAGES.ask_admin_failed);
        return;
      }

      setMessage("");
      setSent(true);
      router.refresh();
    } catch {
      setError(ERROR_MESSAGES.ask_admin_failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
      <label htmlFor="ask-admin-message" className="text-sm font-medium text-ascend-navy">
        Your question
      </label>
      <textarea
        id="ask-admin-message"
        name="message"
        rows={4}
        required
        maxLength={ASK_ADMIN_MESSAGE_MAX_LENGTH}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        className={FIELD_CLASS}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p role="status" className="text-sm text-ascend-navy">
          Sent. An admin will follow up using the contact details you gave us.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="ascend-gradient w-fit rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send to an admin"}
      </button>
    </form>
  );
}
