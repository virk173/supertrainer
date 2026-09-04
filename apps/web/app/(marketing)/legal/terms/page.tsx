import type { Metadata } from "next";

import { LegalDocument, LegalSection } from "@/components/marketing/legal";

export const metadata: Metadata = {
  title: "Terms of service — supertrainer",
  description: "The terms covering use of supertrainer. Draft pending legal review.",
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of service" updated="2026-09-04">
      <LegalSection title="1. What this covers">
        These terms govern a coach&rsquo;s use of supertrainer to run their coaching business,
        including the client portal their clients use. A coach is the controller of their
        clients&rsquo; data; we process it on their behalf.
      </LegalSection>
      <LegalSection title="2. What you are responsible for">
        The coaching itself. Plans, nutrition targets and messages are yours: the software drafts
        and computes, and you approve. You are responsible for holding the qualifications and
        insurance your jurisdiction requires, for obtaining your clients&rsquo; informed consent
        (we provide the flow and store the evidence), and for the accuracy of what you approve.
      </LegalSection>
      <LegalSection title="3. What we are responsible for">
        Running the service, keeping your data isolated from other coaches&rsquo; data, and giving
        it back to you in full on request. We will tell you about incidents that affect your data
        rather than waiting to be asked.
      </LegalSection>
      <LegalSection title="4. Not a medical service">
        Nothing produced through the service is medical advice, diagnosis or treatment. The system
        escalates medical, injury and mental-health topics to you rather than answering them, and
        neither you nor we may configure it to do otherwise.
      </LegalSection>
      <LegalSection title="5. Payments">
        Platform fees are billed by client count as published on the pricing page. Payments your
        clients make to you run through Stripe under your own connected account; we are not the
        merchant of record for your coaching fees.
      </LegalSection>
      <LegalSection title="6. Ending it">
        Cancel any time. Your data stays available for export for thirty days, then a deletion
        request erases it. We may suspend an account for non-payment or for use that puts clients
        at risk, and will say which.
      </LegalSection>
      <LegalSection title="7. Liability">
        To the extent the law allows, our liability is limited to the fees you paid in the twelve
        months before a claim. Nothing here limits liability for death or personal injury caused
        by negligence, or for fraud.
      </LegalSection>
    </LegalDocument>
  );
}
