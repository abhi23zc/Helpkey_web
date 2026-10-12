import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { PrivacyRequestForm } from "@/components/legal/privacy-request-form";

export const metadata: Metadata = { title: "Delete Your Account | Helpkey", description: "Request deletion of your Helpkey account and associated personal data without installing the app or signing in." };

export default function Page() {
  return <LegalPage title="Delete your Helpkey account" description="Request permanent deletion of your account and associated personal data. You can submit a request here without installing the app or signing in.">
    <section id="request"><h2>Submit a deletion request</h2><PrivacyRequestForm kind="account-deletion" /></section>
    <section><h2>What happens next</h2><ul><li>We save your request and provide a reference number.</li><li>Helpkey contacts you to verify ownership of the account. Never share a password or OTP in this form.</li><li>We explain any pending bookings, refunds, or records we must retain and the applicable retention period.</li><li>After verification and processing, we confirm the outcome using your contact details. A submitted request is not confirmation that deletion has already happened.</li></ul></section>
    <section><h2>Data covered by your request</h2><p>Your request covers your Helpkey login account, profile information, saved preferences, and associated personal data no longer needed to provide the service. Any retained booking or financial records are subject to the exceptions below. Account deletion is permanent; you will lose access to the deleted account.</p></section>
    <section><h2>Records that may be retained</h2><p>Booking, payment, refund, invoice, security, and dispute records may be retained when required for legal obligations, fraud prevention, or unresolved transactions. Their retention period depends on the record and obligation and will be explained when your request is processed. Backup copies may remain until the backup cycle expires. Deleting your Helpkey account does not delete an independent Google account or records independently maintained by a hotel or payment provider.</p></section>
    <section><h2>Bookings and refunds</h2><p>A deletion request does not automatically cancel a reservation or issue a refund. Existing cancellation terms still apply. Tell us about any open reservation or refund when we contact you.</p></section>
    <section><h2>Privacy questions</h2><p>Read the <Link href="/privacy-policy">Helpkey Privacy Policy</Link> or use its <Link href="/privacy-policy#contact">privacy contact form</Link>.</p></section>
  </LegalPage>;
}
