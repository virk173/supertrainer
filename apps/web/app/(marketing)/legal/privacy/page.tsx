import Link from "next/link";
import type { Metadata } from "next";

import { LegalDocument, LegalSection } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Privacy — supertrainer",
  description: "What personal data supertrainer holds, why, and how to get it out or erased. Draft pending legal review.",
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy" updated="2026-09-04">
      <LegalSection title="Who holds what">
        Your coach is the controller of your coaching data; supertrainer is the processor acting
        on their instructions. For a coach&rsquo;s own account data, we are the controller.
      </LegalSection>
      <LegalSection title="What we hold about a client">
        What you give your coach: contact details, the intake questionnaire, health flags and
        allergies, weigh-ins, meals, workouts, photos you upload, messages with your coach, and
        payment records (card details are held by Stripe, never by us).
      </LegalSection>
      <LegalSection title="Why">
        To deliver the coaching you signed up for: producing plans, tracking adherence, sending
        reminders, and billing. We do not sell personal data, and we do not use client data to
        train models.
      </LegalSection>
      <LegalSection title="Automated processing">
        An AI drafts messages and plan proposals from your coach&rsquo;s own methods. A human — your
        coach — approves anything that reaches you. Medical, injury and mental-health topics are
        routed to your coach rather than answered automatically.
      </LegalSection>
      <LegalSection title="Your rights">
        Access, correction, export and erasure. Export and deletion are self-service, in the
        portal, and documented on{" "}
        <Link href="/docs/data" className="underline underline-offset-4">
          the data page
        </Link>
        . Deletion runs on a thirty-day delay you can cancel; after it, rows and files are removed,
        and only an anonymised record that the deletion happened remains.
      </LegalSection>
      <LegalSection title="Where it lives, and for how long">
        Data is stored in Supabase (Postgres and object storage). Coaching data is kept while the
        coaching relationship is live, and afterwards only as long as a coach&rsquo;s own record-keeping
        obligations require.
      </LegalSection>
      <LegalSection title="Sub-processors">
        Supabase (database, storage, auth), Vercel (hosting), Anthropic (model inference), Stripe
        (payments), Resend (email), and our error and product analytics providers. We will keep this
        list current rather than generic.
      </LegalSection>
    </LegalDocument>
  );
}
