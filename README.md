This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

For Docker, VPS, worker, Firebase, and troubleshooting commands, see the [Helpkey command library](docs/commands.md).

To start Next.js and all local media processes together, run `npm run dev:all`.

## Getting Started

Create a local `.env.local` with the Firebase and WhatsApp credentials used by authentication:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

WHATSAPP_OTP_API_KEY=
WHATSAPP_OTP_API_URL=https://api2.dineezy.in/api/v1/dev/create-message
OTP_HASH_SECRET=
```

### Admin Aadhaar Lab

The `/admin/aadhaar-lab` console is disabled until its server-only settings are
present. Do not use `NEXT_PUBLIC_` for any of these values.

```bash
CASHFREE_AADHAAR_SANDBOX_CLIENT_ID=
CASHFREE_AADHAAR_SANDBOX_CLIENT_SECRET=
# Base64-encoded random 32-byte key, e.g. `openssl rand -base64 32`
AADHAAR_LAB_ENCRYPTION_KEY=
# Separate high-entropy value used only for Aadhaar HMAC rate-limit fingerprints
AADHAAR_LAB_HMAC_PEPPER=
AADHAAR_LAB_RETENTION_DAYS=30

# Omit these in ordinary deployments. Production stays unavailable unless all
# three values are configured; every request also needs a typed confirmation.
CASHFREE_AADHAAR_PRODUCTION_ENABLED=true
CASHFREE_AADHAAR_LIVE_CLIENT_ID=
CASHFREE_AADHAAR_LIVE_CLIENT_SECRET=
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
