"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  REQUEST_FIELD_MAX_LENGTHS,
  type HelpRequestField,
  type RequestFieldErrors,
} from "@/lib/requests/input";

/** Maps the API's stable error codes to requester-facing copy. */
const FIELD_ERROR_MESSAGES: Record<string, string> = {
  required: "Please fill this in.",
  too_long: "That is longer than we can store — please shorten it.",
  unsupported: "Please choose one of the listed options.",
  invalid: "That does not look like an email address.",
};

const FALLBACK_ERROR = "Something went wrong on our side. Please try again.";

const labelClass = "block text-sm font-medium text-ascend-navy";
const fieldClass =
  "mt-1 w-full rounded-lg border border-ascend-taupe/50 bg-ascend-bg px-3 py-2 text-ascend-ink shadow-sm outline-none focus:border-ascend-sky-deep focus:ring-2 focus:ring-ascend-sky/60";

export interface RequestHelpFormProps {
  serviceTypes: string[];
}

export function RequestHelpForm({ serviceTypes }: RequestHelpFormProps) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<RequestFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      requester_name: form.get("requester_name"),
      requester_email: form.get("requester_email"),
      service_type: form.get("service_type"),
      neighborhood: form.get("neighborhood"),
      street_address: form.get("street_address"),
      prayer_request: form.get("prayer_request"),
      prayer_private: form.get("prayer_private") !== null,
    };

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors((body?.fields as RequestFieldErrors) ?? {});
        setFormError(body?.fields ? null : FALLBACK_ERROR);
        return;
      }

      router.push(body.tracking_path as string);
    } catch {
      setFormError(FALLBACK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-5">
      <Field
        name="requester_name"
        label="Your name"
        error={fieldErrors.requester_name}
      >
        <input
          id="requester_name"
          name="requester_name"
          type="text"
          autoComplete="name"
          required
          maxLength={REQUEST_FIELD_MAX_LENGTHS.requester_name}
          className={fieldClass}
        />
      </Field>

      <Field
        name="requester_email"
        label="Email (optional)"
        hint="Only used to introduce you to your volunteer once one is matched."
        error={fieldErrors.requester_email}
      >
        <input
          id="requester_email"
          name="requester_email"
          type="email"
          autoComplete="email"
          maxLength={REQUEST_FIELD_MAX_LENGTHS.requester_email}
          className={fieldClass}
        />
      </Field>

      <Field
        name="service_type"
        label="What kind of help do you need?"
        error={fieldErrors.service_type}
      >
        <select
          id="service_type"
          name="service_type"
          required
          defaultValue=""
          className={fieldClass}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {serviceTypes.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>

      <Field
        name="neighborhood"
        label="Community"
        hint="Name the part of the community where help is needed, so a nearby volunteer can reach you."
        error={fieldErrors.neighborhood}
      >
        <input
          id="neighborhood"
          name="neighborhood"
          type="text"
          required
          maxLength={REQUEST_FIELD_MAX_LENGTHS.neighborhood}
          className={fieldClass}
        />
      </Field>

      <Field
        name="street_address"
        label="Street address"
        hint="Kept private. Only shared with the volunteer assigned to you."
        error={fieldErrors.street_address}
      >
        <input
          id="street_address"
          name="street_address"
          type="text"
          autoComplete="street-address"
          required
          maxLength={REQUEST_FIELD_MAX_LENGTHS.street_address}
          className={fieldClass}
        />
      </Field>

      <Field
        name="prayer_request"
        label="Prayer request (optional)"
        error={fieldErrors.prayer_request}
      >
        <textarea
          id="prayer_request"
          name="prayer_request"
          rows={4}
          maxLength={REQUEST_FIELD_MAX_LENGTHS.prayer_request}
          className={fieldClass}
        />
      </Field>

      <label className="flex items-start gap-3 rounded-lg border border-ascend-taupe/30 bg-ascend-surface p-3 text-sm text-ascend-ink">
        <input
          id="prayer_private"
          name="prayer_private"
          type="checkbox"
          defaultChecked
          className="mt-0.5 h-4 w-4 rounded border-ascend-taupe accent-ascend-navy"
        />
        <span>
          Keep my prayer request private
          <span className="mt-0.5 block text-ascend-taupe">
            Unchecking lets our prayer team share it with the wider ministry.
          </span>
        </span>
      </label>

      {formError ? (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="ascend-gradient w-fit rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send my request"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: HelpRequestField;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-ascend-taupe">{hint}</p> : null}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {FIELD_ERROR_MESSAGES[error] ?? FALLBACK_ERROR}
        </p>
      ) : null}
    </div>
  );
}
