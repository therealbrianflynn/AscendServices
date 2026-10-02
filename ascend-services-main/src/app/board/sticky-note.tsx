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
      className={`${TILTS[index % TILTS.length]} flex flex-col gap-2 rounded-sm border-b-4 border-ascend-sun-deep bg-ascend-sun p-4 shadow-md transition-transform hover:rotate-0`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ascend-navy/70">
        Posted {postedFormat.format(new Date(request.createdAt))}
      </p>
      <h3 className="text-lg font-semibold leading-snug text-ascend-navy">
        {request.service_type}
      </h3>
      <p className="text-sm text-ascend-navy">{request.neighborhood}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </li>
  );
}
