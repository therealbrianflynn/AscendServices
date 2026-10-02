import type { Metadata } from "next";

import { getServiceTypeOptions } from "@/lib/requests/service-types";

import { RequestHelpForm } from "./request-help-form";

export const metadata: Metadata = {
  title: "Request help · Ascend Services",
  description: "Tell us what you need and we will match you with a volunteer.",
};

export const dynamic = "force-dynamic";

export default function RequestHelpPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <p className="text-sm font-medium uppercase tracking-wide text-ascend-taupe">
        Ascend Services
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ascend-navy">
        Request help
      </h1>
      <p className="mt-3 text-ascend-ink">
        No account needed. When you send this we will give you a private tracking
        link so you can check on your request any time.
      </p>

      <RequestHelpForm serviceTypes={getServiceTypeOptions()} />
    </main>
  );
}
