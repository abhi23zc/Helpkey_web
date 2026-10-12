# Play Store policy pages

Deploy this web project to your public HTTPS domain. The public pages require no login:

- Privacy Policy: `/privacy-policy`
- Account Deletion: `/delete-account`

For the current hosting domain, the intended links are `https://helpkey.workwebifyit.in/privacy-policy` and `https://helpkey.workwebifyit.in/delete-account`. They become available after deployment, not merely after a local build.

Both public forms save requests in the private Firestore `privacyRequests` collection through the server API. A success reference is returned only after the write succeeds. The endpoint uses same-origin protection, bounded validation, a honeypot, and the existing Redis rate limiter. Firestore admin credentials and Redis must be configured in production; the form reports errors if storage or rate limiting is unavailable.

Admins review the latest 100 requests at `/admin/privacy-requests`, available from the admin navigation. Monitor this inbox and contact requesters using their supplied details. Verify ownership before deleting anything. This implementation collects requests; it does not automatically delete Firebase identities, user records, booking records, provider records, or backups. Suspending an account is not deletion.

Before publishing, review the policy against your actual operations and Play Console Data safety declaration. Confirm the response/deletion timeframe and the exact categories and periods for legally retained data and backups; no unverified numeric retention deadline has been promised in these pages. Update the wording when those periods are established. Users should also be able to initiate deletion from inside the app; link its account settings to `/delete-account` or implement an equivalent in-app flow.

After deployment, verify both URLs load while signed out, submit a test privacy request, and confirm it appears in the admin inbox. Update the Privacy Policy URL and Account Deletion URL in the existing Helpkey Play Console app, then retry submission.
