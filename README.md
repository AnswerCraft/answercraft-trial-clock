# AnswerCraft trial deadline service

This project runs the signed warning and cutoff jobs created by AnswerCraft checkout. The checkout app owns call reservations, carrier hangups, alerts, subscriptions and payment rules. This service stores opaque random job IDs, callback types, delivery timestamps and completion receipts.

## Deploy

Use an isolated Netlify project with this directory as the source root. The Netlify build runs the tests and publishes the functions, edge functions and the small public directory. A static upload of the public directory alone cannot run the service. The project uses ordinary Netlify hosting, background functions, scheduled functions, and a site-global Blobs store. Netlify bills those under the team's hosting plan.

Configure three runtime environment variables on the service. The checkout app uses the same three values. Generate the two secrets independently, keep them in the hosting providers' secret stores, and never include them in the source, logs or a URL.

| Variable | Value |
| --- | --- |
| TRIAL_CLOCK_ORIGIN | The exact production HTTPS origin of this clock project on netlify.app |
| TRIAL_SCHEDULE_SECRET | A random 32-byte or longer secret for scheduling |
| TRIAL_CALLBACK_SECRET | A different random 32-byte or longer secret for delivery to checkout |

Use function/runtime scope for the secrets, including edge access to the scheduling secret. Distinct path signatures protect public job submission and internal dispatch. Every delivered callback goes to the fixed production AnswerCraft trial-clock endpoint. Supply the production secrets before testing authenticated delivery. Keep the separate checkout ten-day enrollment flag off until end-to-end checks succeed.

## Delivery and failure behavior

The scheduling endpoint commits an immutable job and a pending marker before reporting acceptance. An identical retry is safe. A changed deadline for the same job returns a conflict. The sweeper starts background delivery before the deadline. Each runner waits for the precise timestamp and retries transient errors. A future job needs a fresh sweeper heartbeat, and a near-term job needs an accepted dispatch. If either is missing, checkout must deny the controlled call.

The checkout callback may be delivered more than once and must remain idempotent. The service retains completion receipts for 14 days. A provider outage can delay delivery. The separate customer ledger caps reserved minutes independently.

## Checks

Run `node --test test/clock.test.mjs` for authentication, idempotency, retry, persistence, timing and fail-closed admission. After publishing, confirm four functions and both edge routes exist. Confirm the minute sweeper has run on the production deployment. Send a signed probe for an unassigned random opaque ID to check real callback authentication without contacting a caller. Verify delivery, retry and completion receipts in the clock project. Exercise controlled carrier and warning tests before activating new ten-day enrollments. Finally check the public storefront, all nine signup links, the website trial text, and actual Stripe trial timing in the billing sandbox.
