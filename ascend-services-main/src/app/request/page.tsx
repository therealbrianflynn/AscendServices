import type { Metadata } from "next";

import { getServiceTypeOptions } from "@/lib/requests/service-types";

import { PageIntro } from "../page-intro";
import { RequestHelpForm } from "./request-help-form";

export const metadata: Metadata = {
  title: "Request help · Ascend Services",
  description: "Tell us what you need and we will match you with a volunteer.",
};

export const dynamic = "force-dynamic";

export default function RequestHelpPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageIntro
        eyebrow="Ask for a hand"
        title="Request help"
        image={{
          src: "/ministry/meal.jpg",
          alt: "A homemade meal being shared across a wooden table",
        }}
      >
        No account needed. Tell us what would make the week lighter, and we will
        give you a private link so you can follow your request.
      </PageIntro>

      <div className="max-w-2xl rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5 sm:p-8">
        <RequestHelpForm serviceTypes={getServiceTypeOptions()} />
      </div>
    </main>
  );
}
