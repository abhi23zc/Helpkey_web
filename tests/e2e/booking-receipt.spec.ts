import { expect, test, type Page } from "@playwright/test";
import type { BookingReceiptData } from "../../components/trips/booking-receipt-modal";
import type { StayRequest } from "../../lib/stay/contracts";
const booking: BookingReceiptData = {
  id: "booking",
  confirmationCode: "KNP835224",
  propertyName: "Cosmozin Hotel",
  propertyAddress:
    "Saket Nagar, Saket Nagar, Kanpur, Uttar Pradesh, 208017, India",
  propertyPublicPhone: "+919876543210",
  roomName: "Normal",
  ratePlanName: "Night Rate",
  checkIn: "2026-11-02",
  checkOut: "2026-11-03",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  startAt: "2026-11-02T08:30:00Z",
  endAt: "2026-11-03T05:30:00Z",
  timezone: "Asia/Kolkata",
  nights: 1,
  adults: 2,
  children: 0,
  leadGuest: {
    name: "ABHISHEK",
    email: "abhishek@example.com",
    phone: "+919876543210",
  },
  bookingContact: {
    name: "ABHISHEK",
    email: "abhishek@example.com",
    phone: "+919876543210",
  },
  subtotalPaise: 60000,
  taxPaise: 9000,
  customerFeePaise: 1000,
  totalPaise: 70000,
  paidPaise: 70000,
  balanceDuePaise: 0,
  currency: "INR",
  bookingStatus: "confirmed",
  paymentStatus: "paid",
  paymentMethod: "online",
  createdAt: "2026-11-01T08:00:00Z",
  amenitySnapshot: {
    version: 1,
    roomAmenities: [],
    propertyAmenities: [{ code: "wifi", label: "Wi-Fi" }],
    rateInclusions: [],
  },
};
async function openReceipt(
  page: Page,
  changes: Partial<BookingReceiptData> = {},
) {
  await page.route("**/receipt-data", (route) =>
    route.fulfill({ json: { ...booking, ...changes } }),
  );
  await page.goto("/receipt-preview");
  await page.getByRole("button", { name: "View receipt", exact: true }).click();
  return page.getByRole("dialog", {
    name: "Booking payment receipt",
    exact: true,
  });
}
const row = (label: string) => `dl div:has(> dt:text-is("${label}"))`;
for (const width of [390, 768, 1366]) {
  test(`clear payment receipt and print layout at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const receipt = await openReceipt(page);
    await expect(
      receipt.getByText("Official Booking Payment Receipt", { exact: true }),
    ).toBeVisible();
    await expect(receipt.getByText("KNP835224", { exact: true })).toBeVisible();
    await expect(receipt.locator(row("Total amount"))).toContainText("₹700.00");
    await expect(receipt.locator(row("Amount paid"))).toContainText("₹700.00");
    await expect(receipt.getByText("✓ Paid in full • ₹0 Due at check-in", { exact: true })).toBeVisible();
    await expect(receipt.locator(row("Balance due at check-in"))).toHaveCount(0);
    await expect(receipt.getByText("Wi-Fi", { exact: false })).toBeVisible();
    await expect(
      receipt.getByText("Present at check-in", { exact: true }),
    ).toBeVisible();
    await expect(
      receipt.getByText("Same as staying guest", { exact: true }),
    ).toHaveCount(0);
    await expect(receipt.getByText("Booked by", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      receipt.getByText("Saket Nagar, Kanpur, Uttar Pradesh, 208017, India", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`receipt-${width}.png`),
      fullPage: true,
    });
    const print = receipt.getByRole("button", {
      name: "Print / Save PDF",
      exact: true,
    });
    await expect(print).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      receipt.getByRole("link", {
        name: "Contact Helpkey support",
        exact: true,
      }),
    ).toBeFocused();
    await page.emulateMedia({ media: "print" });
    await expect(print).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Receipt preview", exact: true }),
    ).toBeHidden();
    await expect(page.locator(".booking-receipt-body")).toHaveCSS(
      "overflow-y",
      "visible",
    );
    await expect(
      receipt.getByText("This payment receipt is not a tax invoice.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`receipt-print-${width}.png`),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page.keyboard.press("Escape");
    await expect(receipt).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "View receipt", exact: true }),
    ).toBeFocused();
  });
}

test("partial payments, missing breakdown and refund totals remain accurate", async ({
  page,
}) => {
  const receipt = await openReceipt(page, {
    subtotalPaise: undefined,
    taxPaise: undefined,
    customerFeePaise: undefined,
    paidPaise: 30000,
    balanceDuePaise: 40000,
    paymentStatus: "partially_paid",
  });
  await expect(
    receipt.getByText("Partially paid", { exact: true }),
  ).toBeVisible();
  await expect(receipt.locator(row("Amount paid"))).toContainText("₹300.00");
  await expect(receipt.locator(row("Balance due at check-in"))).toContainText("₹400.00");
  await expect(receipt.getByText("Room charges", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    receipt.getByText("Pay the remaining balance at the property.", {
      exact: true,
    }),
  ).toBeVisible();
  await receipt
    .getByRole("button", { name: "Close receipt", exact: true })
    .click();
  await page.unroute("**/receipt-data");
  const refunded = await openReceipt(page, {
    bookingStatus: "cancelled",
    paymentStatus: "partially_refunded",
    refundedPaise: 20000,
    refundDuePaise: 10000,
    balanceDuePaise: 0,
  });
  await expect(
    refunded.getByText("Refund pending", { exact: true }).first(),
  ).toBeVisible();
  await expect(refunded.locator(row("Amount refunded"))).toContainText(
    "₹200.00",
  );
  await expect(refunded.locator(row("Net amount paid"))).toContainText(
    "₹500.00",
  );
  await expect(
    refunded.getByText("Pay the remaining balance at the property.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("unpaid and free requests stay out of the receipt while separate paid extras retain references", async ({
  page,
}) => {
  const request: StayRequest = {
    id: "quiet",
    offeringId: "quiet",
    offeringVersion: 1,
    name: "Quiet room preference",
    description: "Quiet room",
    kind: "preference",
    variantId: null,
    variantName: null,
    quantity: 1,
    unitPricePaise: 0,
    totalPaise: 0,
    maxQuantity: 1,
    confirmation: "approval",
    status: "confirmed",
    deadlineAt: "2026-11-02T08:00:00Z",
    cancellationPolicy: null,
    preparationStarted: false,
    response: null,
    updatedAt: "2026-11-01T08:00:00Z",
  };
  const receipt = await openReceipt(page, {
    customizations: [
      request,
      {
        ...request,
        id: "cake",
        name: "Unpaid cake",
        unitPricePaise: 50000,
        totalPaise: 50000,
        status: "requested",
        agreementVersion: 2,
        settlement: "awaiting_payment",
        quote: {
          version: 1,
          scope: "Unpaid cake",
          conditions: "",
          amountPaise: 50000,
          status: "accepted",
          expiresAt: "2027-11-01T08:00:00Z",
        },
      },
    ],
    stayPaymentReceipts: [
      {
        requestId: "flowers",
        quoteVersion: 1,
        paymentId: "pay_flowers",
        orderId: "order_flowers",
        amountPaise: 30000,
        scope: "Flower arrangement",
        status: "paid",
      },
    ],
  });
  await expect(
    receipt.getByText("Quiet room preference", { exact: true }),
  ).toHaveCount(0);
  await expect(receipt.getByText("Unpaid cake", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    receipt.getByRole("heading", { name: "Additional payments", exact: true }),
  ).toBeVisible();
  await expect(
    receipt.getByText("Payment reference: pay_flowers", { exact: true }),
  ).toBeVisible();
  await expect(receipt.locator(row("Flower arrangement"))).toContainText(
    "₹300.00",
  );
  await expect(receipt.locator(row("Total amount"))).toContainText("₹700.00");
});

test("hourly stays show hotel-local times and separate booker and billing information", async ({
  page,
}) => {
  const receipt = await openReceipt(page, {
    bookingMode: "hourly",
    nights: 0,
    durationMinutes: 180,
    endAt: "2026-11-02T11:30:00Z",
    checkOut: "2026-11-02",
    bookingContact: {
      name: "Travel desk",
      email: "travel@example.com",
      phone: "",
    },
    billing: {
      legalName: "Example Ltd",
      gstin: "09EXAMPLE1234",
      address: {
        line1: "Office Road",
        city: "Kanpur",
        state: "Uttar Pradesh",
        postalCode: "208017",
      },
    },
  });
  await expect(receipt.getByText("3 hours", { exact: true })).toBeVisible();
  await expect(receipt.getByText("2:00 pm", { exact: true })).toBeVisible();
  await expect(receipt.getByText("5:00 pm", { exact: true })).toBeVisible();
  await expect(
    receipt
      .locator("dl div")
      .filter({ has: page.locator("dt").filter({ hasText: /^Booked by$/ }) }),
  ).toContainText("Travel desk");
  await expect(
    receipt.getByRole("region", { name: "Billing details", exact: true }),
  ).toContainText("Example Ltd");
});
