"use client";

import { useId, useState, type FormEvent } from "react";

import type { SlaFieldError, SlaFieldErrors } from "@/lib/settings/sla-input";
import {
  SLA_THRESHOLDS,
  slaThreshold,
  type SlaSettings,
  type SlaSettingsView,
  type SlaThresholdKey,
} from "@/lib/settings/sla-thresholds";

import { formatDay } from "./admin-grid";

const SLA_SETTINGS_ENDPOINT = "/api/admin/settings/sla";

const FALLBACK_ERROR = "Something went wrong on our side. Please try again.";

/** Maps the API's stable rejection codes to admin-facing copy. */
const FORM_ERRORS: Record<string, string> = {
  no_thresholds: "Change at least one threshold before saving.",
  forbidden: "Your session no longer has admin access. Please sign in again.",
  unauthenticated: "Your session has expired. Please sign in again.",
};

type SaveState = "idle" | "saving" | "saved";

/**
 * SLA thresholds editor (Spec v6 §6). Fields are generated from
 * `SLA_THRESHOLDS`, so adding a threshold to the contract adds it here — and the
 * server re-validates every value, because bounds enforced only in the browser
 * are not enforced at all.
 */
export function SlaSettingsForm({ settings }: { settings: SlaSettingsView }) {
  const fieldPrefix = useId();
  const [values, setValues] = useState(() => toFormValues(settings.thresholds));
  const [updatedAt, setUpdatedAt] = useState(settings.updatedAt);
  const [state, setState] = useState<SaveState>("idle");
  const [fieldErrors, setFieldErrors] = useState<SlaFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;

    setState("saving");
    setFieldErrors({});
    setFormError(null);

    try {
      const response = await fetch(SLA_SETTINGS_ENDPOINT, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(body?.fields ?? {});
        setFormError(
          body?.fields
            ? "Some thresholds need a second look."
            : (FORM_ERRORS[body?.error as string] ?? FALLBACK_ERROR),
        );
        setState("idle");
        return;
      }

      const saved = body?.settings as SlaSettingsView | undefined;
      if (saved) {
        setValues(toFormValues(saved.thresholds));
        setUpdatedAt(saved.updatedAt);
      }
      setState("saved");
    } catch {
      setFormError(FALLBACK_ERROR);
      setState("idle");
    }
  }

  return (
    <form onSubmit={save} className="mt-4">
      <dl className="grid gap-5 sm:grid-cols-3">
        {SLA_THRESHOLDS.map((threshold) => {
          const fieldId = `${fieldPrefix}-${threshold.key}`;
          const error = fieldErrors[threshold.key];
          return (
            <div key={threshold.key}>
              <dt>
                <label
                  htmlFor={fieldId}
                  className="text-sm font-medium text-ascend-navy"
                >
                  {threshold.label}
                </label>
              </dt>
              <dd className="mt-1">
                <div className="flex items-center gap-2">
                  <input
                    id={fieldId}
                    name={threshold.key}
                    type="number"
                    inputMode="numeric"
                    min={threshold.min}
                    max={threshold.max}
                    step={1}
                    required
                    value={values[threshold.key]}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [threshold.key]: event.target.value,
                      }))
                    }
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={`${fieldId}-help`}
                    className="w-24 rounded-lg border border-ascend-taupe/40 bg-ascend-bg px-3 py-2 text-sm text-ascend-ink focus:border-ascend-sky-deep focus:outline-none focus:ring-2 focus:ring-ascend-sky/60"
                  />
                  <span className="text-sm text-ascend-taupe">{threshold.unit}</span>
                </div>
                <p id={`${fieldId}-help`} className="mt-1 text-xs text-ascend-taupe">
                  {threshold.description}
                </p>
                {error ? (
                  <p role="alert" className="mt-1 text-xs text-red-800">
                    {fieldErrorMessage(threshold.key, error)}
                  </p>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={state === "saving"}
          className="ascend-gradient rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save thresholds"}
        </button>
        <p aria-live="polite" className="text-sm text-ascend-taupe">
          {state === "saved"
            ? "Thresholds saved."
            : updatedAt
              ? `Last changed ${formatDay(updatedAt)}`
              : "Running on the seed defaults — nothing saved yet."}
        </p>
      </div>

      {formError ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {formError}
        </p>
      ) : null}
    </form>
  );
}

function toFormValues(thresholds: SlaSettings): Record<SlaThresholdKey, string> {
  return Object.fromEntries(
    SLA_THRESHOLDS.map((threshold) => [
      threshold.key,
      String(thresholds[threshold.key]),
    ]),
  ) as Record<SlaThresholdKey, string>;
}

function fieldErrorMessage(key: SlaThresholdKey, error: SlaFieldError): string {
  const { min, max, unit } = slaThreshold(key);
  switch (error) {
    case "out_of_range":
      return `Choose between ${min} and ${max} ${unit}.`;
    case "not_an_integer":
      return `Use whole ${unit}, not a fraction.`;
    default:
      return "Enter a number.";
  }
}
