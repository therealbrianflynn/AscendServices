import { REQUEST_STATUS_LABELS } from "@/lib/requests/status";
import type { PublicRequestView } from "@/lib/requests/views";

/**
 * Hand-pinned look (Spec v6 §5, "Sticky Note" board). Tailwind needs literal
 * class names, so the tilts are a fixed set cycled by card position.
 */
const TILTS = ["-rotate-1", "rotate-1", "-rotate-2", "rotate-2"] as const;

const postedFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * One open request. The prop type is `PublicRequestView`, so an unclaimed note
 * has no requester name or street address to render even by accident.
 */
export function StickyNote({
  request,
  index,
  action,
}: {
  request: PublicRequestView;
  index: number;
  action?: React.ReactNode;
}) {
  return (
    <li
      className={`${TILTS[index % TILTS.length]} group relative flex flex-col gap-2 rounded-sm border-b-4 border-ascend-sun-deep bg-ascend-sun p-4 shadow-md transition-transform hover:rotate-0 focus-within:rotate-0`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ascend-navy/70">
        Posted {postedFormat.format(new Date(request.createdAt))}
      </p>
      <h3 className="text-lg font-semibold leading-snug text-ascend-navy">
        {request.service_type}
      </h3>
      <p className="text-sm text-ascend-navy">{request.neighborhood}</p>
      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-64 -translate-x-1/2 rounded-2xl bg-white p-4 text-sm text-ascend-navy shadow-lg ring-1 ring-ascend-navy/10 group-hover:block group-focus-within:block">
        <p>
          <span className="font-semibold">Service: </span>
          {request.service_type}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Community: </span>
          {request.neighborhood}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Posted: </span>
          {postedFormat.format(new Date(request.createdAt))}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Status: </span>
          {REQUEST_STATUS_LABELS[request.status]}
        </p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </li>
  );
}
