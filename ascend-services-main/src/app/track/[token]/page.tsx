import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAppBaseUrl } from "@/lib/app-url";
import { findRequestByTrackingToken } from "@/lib/requests/service";
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_DESCRIPTIONS,
  REQUEST_STATUS_LABELS,
} from "@/lib/requests/status";
import { buildTrackingUrl, isWellFormedTrackingToken } from "@/lib/requests/tracking-token";

/** Bearer-token URL: keep it out of search indexes. */
export const metadata: Metadata = {
  title: "Your request · Ascend Services",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Requester self-service portal (Spec v6 §5). The tracking token in the URL is
 * the credential, so this private page — and only this page — may show the
 * requester their own `street_address` back.
 */
export default async function TrackRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isWellFormedTrackingToken(token)) notFound();

  const request = await findRequestByTrackingToken(token);
  if (!request) notFound();

  const currentStep = REQUEST_STATUSES.indexOf(request.status);

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <p className="text-sm font-medium uppercase tracking-wide text-ascend-taupe">
        Ascend Services
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ascend-navy">
        Your request
      </h1>
      <p className="mt-3 text-ascend-ink">
        Submitted{" "}
        {new Date(request.createdAt).toLocaleDateString("en-US", {
          dateStyle: "long",
        })}
        . Bookmark this page — the link is your private way back in.
      </p>

      <section className="mt-8 rounded-xl border border-ascend-taupe/30 bg-ascend-surface p-5">
        <p className="text-sm font-medium uppercase tracking-wide text-ascend-taupe">
          Status
        </p>
        <p className="mt-1 text-2xl font-semibold text-ascend-navy">
          {REQUEST_STATUS_LABELS[request.status]}
        </p>
        <p className="mt-1 text-ascend-ink">
          {REQUEST_STATUS_DESCRIPTIONS[request.status]}
        </p>

        <ol className="mt-5 flex flex-wrap gap-2">
          {REQUEST_STATUSES.map((status, index) => (
            <li
              key={status}
              aria-current={status === request.status ? "step" : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                index <= currentStep
                  ? "bg-ascend-navy text-white"
                  : "bg-ascend-bg text-ascend-taupe ring-1 ring-ascend-taupe/40"
              }`}
            >
              {REQUEST_STATUS_LABELS[status]}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 rounded-xl border border-ascend-taupe/30 p-5">
        <h2 className="font-medium text-ascend-navy">What you told us</h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <Detail label="Name" value={request.requester_name} />
          <Detail label="Help needed" value={request.service_type} />
          <Detail label="Neighborhood" value={request.neighborhood} />
          <Detail
            label="Street address"
            value={request.street_address}
            note="Private — shared only with your assigned volunteer."
          />
          {request.prayer_request ? (
            <Detail
              label="Prayer request"
              value={request.prayer_request}
              note={
                request.prayer_private
                  ? "Private — kept with ministry staff."
                  : "Shared with our prayer team."
              }
            />
          ) : null}
        </dl>
      </section>

      <p className="mt-6 break-all text-xs text-ascend-taupe">
        Your private link: {buildTrackingUrl(token, getAppBaseUrl())}
      </p>
    </main>
  );
}

function Detail({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <dt className="text-ascend-taupe">{label}</dt>
      <dd className="whitespace-pre-line text-ascend-ink">{value}</dd>
      {note ? <p className="text-xs text-ascend-taupe">{note}</p> : null}
    </div>
  );
}
