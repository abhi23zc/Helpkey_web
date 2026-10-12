import { z } from "zod";

const contact = z.string().trim().min(3).max(180).refine(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /^\+?[\d\s().-]{7,25}$/.test(value), "Enter a valid email address or phone number.");
export const privacyRequestSchema = z.object({
  kind: z.enum(["account-deletion", "privacy-question"]),
  name: z.string().trim().min(1).max(120),
  contact,
  accountIdentifier: z.string().trim().max(180).default(""),
  message: z.string().trim().max(2000).default(""),
  confirmed: z.literal(true),
  website: z.string().max(0).default(""),
}).superRefine((value, context) => {
  if (value.kind === "account-deletion" && !contact.safeParse(value.accountIdentifier).success) context.addIssue({ code: "custom", path: ["accountIdentifier"], message: "Enter the email or phone number on your Helpkey account." });
  if (value.kind === "privacy-question" && !value.message) context.addIssue({ code: "custom", path: ["message"], message: "Enter your privacy question." });
});
