import type { OfferingInput } from "./contracts";
export type OfferingTemplate = {
  id: string;
  keywords: string;
  draft: Partial<OfferingInput> &
    Pick<OfferingInput, "name" | "description" | "formType" | "category">;
};
const template = (
  id: string,
  keywords: string,
  draft: OfferingTemplate["draft"],
): OfferingTemplate => ({ id, keywords, draft });
export const offeringTemplates: OfferingTemplate[] = [
  template("pillow", "pillow bedding sleep cushion", {
    name: "Extra Pillow",
    description: "An additional pillow for a comfortable stay.",
    category: "comfort",
    formType: "quantity",
    maxQuantity: 2,
  }),
  template("towel", "towel bathroom bath", {
    name: "Extra Towels",
    description: "Additional towels beyond those included with your room.",
    category: "bathroom",
    formType: "quantity",
    maxQuantity: 4,
  }),
  template("charger", "charger phone usb connector adapter", {
    name: "Phone Charger Loan",
    description:
      "Borrow a charger during your stay. Please return it to reception.",
    category: "technology",
    formType: "variants",
    maxQuantity: 2,
    variants: [
      { id: "usb-c", name: "USB-C" },
      { id: "lightning", name: "Lightning" },
      { id: "micro-usb", name: "Micro-USB" },
    ],
  }),
  template("birthday-cake", "cake birthday flavour size message", {
    name: "Birthday Cake",
    description:
      "A cake for your celebration. Choose a size and flavour; the hotel confirms availability.",
    category: "celebrations",
    formType: "variants",
    travelerCategories: ["Special occasion", "Family"],
    variants: [
      { id: "half-kg", name: "500 g" },
      { id: "one-kg", name: "1 kg" },
    ],
    choiceGroups: [
      {
        id: "flavour",
        name: "Flavour",
        required: true,
        options: ["Chocolate", "Vanilla"],
      },
    ],
    noteLabel: "Message on cake",
    advanceNoticeMinutes: 1440,
  }),
  template("celebration-cake", "cake anniversary celebration", {
    name: "Celebration Cake",
    description:
      "Celebrate a special moment with a cake prepared for your stay.",
    category: "celebrations",
    formType: "variants",
    travelerCategories: ["Couple", "Special occasion"],
    variants: [
      { id: "half-kg", name: "500 g" },
      { id: "one-kg", name: "1 kg" },
    ],
    choiceGroups: [
      {
        id: "flavour",
        name: "Flavour",
        required: true,
        options: ["Chocolate", "Vanilla"],
      },
    ],
    noteLabel: "Message on cake",
    advanceNoticeMinutes: 1440,
  }),
  template("quiet", "quiet room noise business", {
    name: "Quiet Room Request",
    description:
      "Request a quieter room within your booked room type, subject to hotel availability.",
    category: "room_preferences",
    formType: "simple",
    kind: "preference",
    travelerCategories: ["Business", "Solo"],
  }),
  template("fragrance", "fragrance scent aroma", {
    name: "No Added Fragrance",
    description:
      "Request no added fragrance during room preparation. This does not guarantee an allergen-free room.",
    category: "room_preferences",
    formType: "simple",
    kind: "preference",
  }),
  template("decor", "decoration romance flowers package anniversary", {
    name: "Celebration Setup",
    description:
      "Choose a celebration package. The image is illustrative; the hotel confirms details.",
    category: "celebrations",
    formType: "package",
    pricingUnit: "package",
    travelerCategories: ["Couple", "Special occasion"],
    variants: [
      { id: "basic", name: "Basic", inclusions: "Balloons and a welcome card" },
      {
        id: "premium",
        name: "Premium",
        inclusions: "Balloons, flowers and a welcome card",
      },
      {
        id: "luxury",
        name: "Luxury",
        inclusions: "Balloons, flowers, cake and a welcome card",
      },
    ],
    advanceNoticeMinutes: 1440,
  }),
  template("transfer", "taxi airport pickup transfer transport", {
    name: "Airport Transfer",
    description:
      "Request a transfer for your party. Provide your pickup details for hotel review.",
    category: "transport",
    formType: "scheduled",
    kind: "service",
    peopleRequired: true,
    timeRequired: true,
    noteLabel: "Pickup point and flight details",
    noteRequired: true,
    pricingUnit: "stay",
  }),
  template("chef", "chef dining food meal villa", {
    name: "Private Chef",
    description:
      "Request a chef service during your stay. The hotel will confirm the menu and final price.",
    category: "groups",
    formType: "scheduled",
    kind: "service",
    peopleRequired: true,
    timeRequired: true,
    pricingUnit: "person",
    noteLabel: "Dietary requirements",
  }),
  template("kids", "kids children family kit", {
    name: "Children’s Welcome Kit",
    description:
      "A small activity kit for children, subject to hotel confirmation.",
    category: "family",
    formType: "quantity",
    travelerCategories: ["Family"],
    maxQuantity: 4,
  }),
  template("laundry", "laundry ironing housekeeping", {
    name: "Laundry Request",
    description:
      "Request laundry collection. The hotel will confirm the service and price.",
    category: "housekeeping",
    formType: "text",
    kind: "service",
    noteLabel: "Items and service needed",
    noteRequired: true,
  }),
  template("activity", "activity experience guide appointment yoga spa", {
    name: "Activity Appointment",
    description:
      "Request an activity appointment during your stay. The hotel will confirm availability.",
    category: "experiences",
    formType: "scheduled",
    kind: "service",
    pricingUnit: "person",
    peopleRequired: true,
    timeRequired: true,
  }),
  template("pet", "pet dog cat supplies", {
    name: "Pet Welcome Setup",
    description: "Request supplies for your pet at this pet-friendly property.",
    category: "pets",
    formType: "text",
    noteLabel: "Pet type and needs",
    noteRequired: true,
  }),
  template("custom", "custom special unlisted other", {
    name: "Special Request",
    description:
      "Tell the hotel what you need. Availability and any final price require review.",
    category: "other",
    formType: "custom",
    kind: "service",
    noteLabel: "What do you need?",
    noteRequired: true,
  }),
];
export function searchTemplates(query: string) {
  const q = query.trim().toLowerCase();
  return offeringTemplates.filter(
    (t) => !q || `${t.draft.name} ${t.keywords}`.toLowerCase().includes(q),
  );
}
