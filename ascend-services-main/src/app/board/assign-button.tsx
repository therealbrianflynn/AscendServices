"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Maps the API's stable rejection codes to volunteer-facing copy. */
const ERROR_MESSAGES: Record<string, string> = {
  already_claimed: "Another volunteer just claimed this one.",
  not_found: "This request is no longer on the board.",
};

const FALLBACK_ERROR = "Something went wrong on our side. Please try again.";

/**
 * Claims a request for the signed-in volunteer. The server decides who wins a
 * race, so a rejection is shown as-is rather than optimistically hidden.
 */
export function AssignButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/board/requests/${requestId}/assign`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(ERROR_MESSAGES[body?.error as string] ?? FALLBACK_ERROR);
        return;
      }

      router.refresh();
    } catch {
      setError(FALLBACK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={claim}
        disabled={submitting}
        className="ascend-gradient w-full rounded-lg px-3 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
      >
        {submitting ? "Assigning…" : "Assign to me"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
    </>
  );
}
