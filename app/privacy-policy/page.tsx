import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { PrivacyRequestForm } from "@/components/legal/privacy-request-form";

export const metadata: Metadata = { title: "Privacy Policy | Helpkey", description: "How Helpkey handles account, booking, payment, and guest information, and how to request deletion." };

export default function Page() {
  return <LegalPage title="Privacy policy" description="How Helpkey collects and uses information when you discover hotels, manage your account, and book a stay.">
    <p className="text-sm text-[var(--hk-muted)]">Last updated: 12 October 2026. This policy covers the Helpkey mobile app and website.</p>
    <section><h2>Information we handle</h2><ul>
      <li><strong>Account information:</strong> your name, email address, phone number, profile image where provided, sign-in provider identifiers, verification status, and account preferences.</li>
      <li><strong>Booking and guest information:</strong> selected property, stay dates, rooms, guest details, contact information, booking references, cancellation requests, and relevant preferences you provide.</li>
      <li><strong>Payment information:</strong> order and transaction references, payment status, refunds, and invoices. Payment details entered through the payment provider are processed by that provider.</li>
      <li><strong>Content you provide:</strong> reviews, support messages, privacy requests, and property information or images submitted by partners.</li>
      <li><strong>Technical information:</strong> session identifiers, IP addresses, request logs, error information, and security records needed to operate and protect the service.</li>
      <li><strong>Identity verification:</strong> when a specific verification flow is offered, the information you choose to submit is used for that flow under the consent and retention information shown there. Do not send identity documents through our privacy contact form.</li>
    </ul></section>
    <section><h2>Why we use information</h2><p>We use information to create and authenticate accounts, search and display stays, complete bookings and payments, communicate about reservations and refunds, respond to requests, manage partner listings, prevent abuse, and meet applicable legal obligations.</p></section>
    <section><h2>Sharing and service providers</h2><p>We share the guest and reservation details needed to fulfil a booking with the relevant property. Our service uses Firebase for authentication and data services, payment providers such as Razorpay, and hosting and storage providers. Identity verification providers are involved only when the relevant verification flow is used. These providers process information for their services under their own applicable terms and privacy policies.</p><p>Information may also be disclosed where required by law, to resolve disputes, or to protect users and the service. Provider processing and hosting may occur outside your country.</p></section>
    <section><h2>Sessions and device permissions</h2><p>The website uses session cookies and browser storage, and the app stores sign-in credentials and preferences, to keep you signed in and support the service. Optional device permissions are requested when a feature needs them; you can manage permissions in your device settings. Disabling a permission may affect that feature.</p></section>
    <section><h2>Security and retention</h2><p>We use access controls and protected authentication to limit access to account information. No internet service can guarantee absolute security.</p><p>Account data is kept while your account is used to provide Helpkey services. When you request deletion, we verify ownership and remove associated personal data that is no longer needed. Booking, payment, refund, invoice, security, and dispute records may need to be retained for legal obligations, fraud prevention, or unresolved transactions. The applicable duration depends on the record and obligation; we will explain any retained records and their retention period when handling your request. Backup copies may persist until the applicable backup cycle expires.</p></section>
    <section><h2>Your choices and account deletion</h2><p>You can manage available profile details from your account. To request access, correction, or raise a privacy question, use the contact form below. To request deletion of your account and associated data, visit our <Link href="/delete-account">account deletion page</Link>. You do not need the app installed to submit a request.</p></section>
    <section><h2>Children and bookings</h2><p>Helpkey is a hotel booking service. An adult responsible for a booking should provide any necessary child guest details; those details are used to fulfil the reservation. If you believe a child has submitted personal information without appropriate permission, contact us using the form below.</p></section>
    <section><h2>Policy updates</h2><p>We may update this policy as the service changes. The date above identifies the latest revision.</p></section>
    <section id="contact"><h2>Contact Helpkey about privacy</h2><p className="mb-5">This form reaches Helpkey&apos;s privacy request inbox. Provide a working contact address so we can reply.</p><PrivacyRequestForm kind="privacy-question" /></section>
  </LegalPage>;
}
