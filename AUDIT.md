# GroundUp — Platform Compliance Audit

**Version 1.0 — August 17, 2026**
**Status: STOPPED AT STEP 1.** Document generation (Step 2) not started — see
§0 for the two blockers.

Every finding below cites a file and line in this repository. Nothing here is
inferred from the build memo; where the memo and the code disagree, the code
is reported as-is per Hard Rule 3.

---

## §0 — Why generation stopped

### 0.1 Entity determination is unanswered (GATING)

`LEGAL_ENTITY`, `GOVERNING_LAW`, `VENUE`, `ENTITY_ADDRESS`, and
`CONTACT_EMAIL` are all `[[NEEDS INPUT]]` in the memo, and the memo directs
that documents not be generated with a placeholder entity. No document in
Step 2 can be drafted without it.

The repository does not resolve this. The only entity-like identifiers in the
code are email senders and a Stripe payout destination:

- Sender / admin address: `groundup@drginamerritt.net` (`api/_email.js`,
  and as the `ADMIN_EMAIL` fallback throughout `api/stripe.js`)
- Site origin: `https://community.drginamerritt.net` (`api/_email.js`)
- Stripe connected payout account: `NREUV_CONNECT_ACCOUNT`, an account
  labeled "NREUV Advisors LLC"

**This is materially relevant to the entity question and should go to counsel
with it:** the platform is the merchant of record and pays NREUV as a
downstream transfer, not the reverse. In `api/stripe.js`, the customer is
charged by the platform Stripe account; `splitCharge()` then issues a
`stripe.transfers.create(...)` to `NREUV_CONNECT_ACCOUNT` for NREUV's share
(75% of gross on memberships and passes, 90% on sessions and retainers, 100%
on Lunch & Learn). Whoever owns the platform Stripe account is the merchant of
record for every consumer transaction, and is therefore the party that consumer
billing law will look to first. That may not be the entity intended to own
GroundUp.

### 0.2 The memo's platform premise does not match the codebase

> Memo, Context: *"Built through Notable."*
> Memo, Step 1: *"Notable is a hosted platform, so much of this is
> configuration review rather than code review."*

This is not accurate, and it changes the shape of the work. GroundUp is a
**custom application owned in this repository**, not a hosted-platform tenant:

| Layer | Actual implementation |
|---|---|
| Frontend | React 18 + Vite SPA — `src/index.jsx`, `src/member.jsx` |
| Backend | Vercel serverless functions — `/api/*.js` |
| Database | Neon serverless Postgres — schema in `api/_migrate.js` |
| Payments | Stripe Checkout + Subscriptions + Connect — `api/stripe.js` |
| Email | Brevo — `api/_email.js` |
| Hosting | Vercel |

"Notable" is the name of a **separate Stripe account**, not the platform this
runs on.

Consequence: every Step 3 implementation item is a **build task in this
repository**, not a Notable configuration toggle. There is no vendor to
configure around the gaps in §1 — they have to be written. That is a schedule
fact worth knowing before the launch date is set.

---

## §1 — Billing and cancellation (priority section)

### 1.1 Self-service cancellation — RESOLVED August 17, 2026

Built via Stripe Billing Portal: a "Manage or cancel" button on the member
page (`ManageMembershipCard`, `src/member.jsx`) opens a portal session
(`action: 'portal'` in `api/stripe.js`) where the member can update their
card, view invoices, or cancel — same medium as signup, one click, no
retention gauntlet. Supporting mechanics:

- `customer.subscription.deleted` stamps `users.cancelled_at` and emails the
  member a confirmation stating the 15-day data-retention window
- The member page states the window *before* cancellation: access runs through
  the paid period; 15 days after it ends, account data (posts, messages,
  progress) is permanently deleted; rejoining before then loses nothing
- The 15-day promise is **enforced**, not just stated: `purgeCancelled()`
  runs on every webhook delivery, deletes DMs, community messages,
  entitlements, RSVPs, and session requests, and anonymizes the user row
  (name, email, password cleared). The row itself survives because deleting
  it would cascade into `bookings` and destroy financial records held under
  the 7-year tax retention. Team accounts are exempt. Rejoining
  (`fulfill()`) clears `cancelled_at` and stops the clock
- The retainer picker's "just tell the team" copy now points at the
  self-service flow

**Deploy note:** the Stripe Billing Portal requires a saved portal
configuration in live mode (Stripe Dashboard → Settings → Billing → Customer
portal → Save). If none exists, the button returns an error until it is saved
once. `[[NEEDS INPUT: confirm the portal configuration is saved and that
"Cancel subscriptions" is enabled in it.]]`

The original finding, preserved for the record:

**At audit time there was no self-service cancellation. Anywhere. On any tier.**

Searched the entire repository for a cancellation path. There is:

- No Stripe Billing Portal session creation (no `billingPortal` /
  `billing_portal` call anywhere in `/api`)
- No cancel endpoint, action, or route in `api/stripe.js`, `api/auth.js`, or
  any other function
- No cancel control in the member dashboard (`src/member.jsx`)

The only subscription-ending code path is **inbound**: `api/stripe.js` handles
the `customer.subscription.deleted` webhook — i.e. the system can react to a
cancellation performed in the Stripe dashboard by an administrator, but a
member cannot initiate one.

**What the site currently tells members**, in four places:

| File | Line | Text |
|---|---|---|
| `src/index.jsx` | 1064 | "No credit card · **Cancel anytime** · Scholarship access available" |
| `src/index.jsx` | 1394 | "Start free. Upgrade when you're ready. **Cancel anytime.**" |
| `src/index.jsx` | 1440 | "**Cancel anytime, no questions**" |
| `src/member.jsx` | 1110 | "Charged monthly. Change or **cancel anytime — just tell the team.**" |

The memo's instruction is explicit: *"Do not write 'cancel anytime' anywhere
unless the audit confirms self-service cancellation actually works on that
tier."* It does not work on any tier. Line 1110 is the sharpest version of the
problem — it states the mechanic accurately, and the accurate mechanic is
"email a human," which is a different medium from the one-click signup and is
the retention-gauntlet pattern ROSCA and the California ARL target directly.

This is the highest-exposure finding in the audit, and it sits on the
$599.99/mo tier as much as the $59.99 one.

**Fix:** Stripe Billing Portal is the shortest correct path — one endpoint
creating a portal session, one button in the member dashboard. It gives
same-medium, self-service cancellation, and Stripe maintains the flow.

### 1.2 No separate affirmative consent to recurring billing

`api/stripe.js` creates a Stripe Checkout session with
`mode: 'subscription'` and `recurring: { interval: 'month' }` (line 239).
Stripe's hosted page shows the price and interval, which is a partial
mitigation, but there is no separate, unchecked affirmative consent to the
recurring charge distinct from general terms acceptance — because there is no
general terms acceptance at checkout at all (§1.4).

### 1.3 No pre-charge disclosure block adjacent to purchase buttons

Purchase buttons call `startCheckout()` and redirect straight to Stripe. There
is no adjacent on-page block stating the amount, interval, renewal date, and
cancellation method before the charge.

### 1.4 No post-purchase acknowledgment email to the member

`api/stripe.js` sends transactional email on purchase — but on
`session_*` purchases and new retainers it emails **the admin**
(`ADMIN_EMAIL`), not the buyer. Subscription purchases (`sub_*`) send no
member email at all; `fulfill()` only updates `users.tier` and
`membership_status`.

Stripe sends its own receipt if configured, but a Stripe receipt does not
contain the subscription terms or cancellation instructions, which is what
ROSCA requires.

### 1.5 No advance renewal notice and no price-change notice

No scheduled job, cron, or webhook handler sends either. `invoice.payment_succeeded`
is handled *after* the charge, for revenue split and reactivation.

### 1.6 Member session discounts — did not exist at audit time; now built

At the time of the original audit, **no tier-based session discount existed**
in either the source or the deployed bundle. This was verified against the live
site (`community.drginamerritt.net`), not only the local checkout: the only
percent-off string in the shipped JavaScript was the 25% Lunch & Learn perk,
and session prices shipped flat at $500 / $425 / $550 / $375 / $275.

**Resolved August 17, 2026.** The 10% Premium / 30% Elite discount is now
implemented, server-side, in `api/stripe.js`:

- `sessionDiscountRate(tier)` — `{ Premium: 0.10, Elite: 0.30 }`
- `memberPrice(item, tier)` — applies the rate and rounds **down** to the
  nearest $5, so rounding never lands against the member
- The rate is computed from the signed-in user's tier on the server. The client
  never sends a price, so the discount cannot be forged from the browser
- Only active memberships qualify — a `past_due` account resolves to `Free`
- The Stripe line item is labeled with the tier and rate, so the member's
  receipt shows why they were charged less
- `bookings.amount` now records `session.amount_total` (what was actually paid)
  rather than the `CATALOG` sticker price

Resulting member pricing:

| Session | List | Premium (10%) | Elite (30%) |
|---|---|---|---|
| Deal Review | $500 | $450 | $350 |
| Strategy | $425 | $380 | $295 |
| Capital Stack | $550 | $495 | $385 |
| Community Development | $375 | $335 | $260 |
| BIPOC Developer | $275 | $275 | $275 |

The **BIPOC Developer Session is excluded** from the member discount
(`NO_MEMBER_DISCOUNT` in `api/stripe.js`) — it is already priced as an access
offering and the tier discount does not stack on top of it. The Stripe line
item label is derived from the actual price delta rather than the tier rate, so
an excluded session is never labeled as discounted on a member's receipt. Both
the booking-page banner and the tier feature bullets state the exclusion.

The separate **Lunch & Learn perk of 25% off the first month** of a membership
is unchanged — Stripe coupon `LNL25` (`percent_off: 25, duration: 'once'`),
gated by `users.lnl_discount_until`.

**Compliance note:** because the discount was never live, it was never
mis-marketed — there is no prior-representation exposure to remediate. Now that
it *is* live and stated on the pricing page and booking page, it becomes a
published offer and should be described accurately in the Terms.

### 1.7 Other pricing discrepancies between memo and code

| Item | Memo | Code (`api/stripe.js` CATALOG) |
|---|---|---|
| Retainers | "up to $10K/month" | $2,750 / $5,000 / $7,000 base, **billed at $3,025 / $5,500 / $7,700** (10% uplift). Max is $7,700/mo, not $10K |
| Retainer onboarding | not mentioned | **$1,500 one-time fee** (`retainer_onboarding`) — a real SKU the memo omits |
| Lunch & Learn | "$39.99/seat" | $39.99 for **6 months of access** (`entitlements … interval '6 months'`), not a single seat |
| Sessions | four listed | **five** — memo omits BIPOC Developer Session, $275 |
| Tiers | Basic/Premium/Elite ✓ | Matches: $59.99 / $165.99 / $599.99 |

The Lunch & Learn framing matters for the refund policy: a 6-month access
grant is a different consumer product from a single seat.

---

## §2 — Data

### 2.1 Personal information stored, mapped to CPRA categories

From `api/_migrate.js`:

| CPRA category | Fields | Table |
|---|---|---|
| Identifiers | `name`, `email`, `phone` | `users`, `waitlist` |
| Commercial information | `tier`, `membership_status`, `stripe_customer_id`, purchase and booking history | `users`, `entitlements`, `bookings`, `retainers` |
| Financial information | **Payment tokens only** — `stripe_customer_id`, `charge_id`. No card data touches the application; Stripe Checkout is hosted | `users`, `bookings` |
| Internet/network activity | `last_seen_community`, `last_seen_dm`, `seen_announcement_id` | `users` |
| User-generated content | messages, thread replies, poll votes, DMs, retainer messages and files | `messages`, `poll_votes`, `dms`, `retainer_messages`, `retainer_files` |
| Inferences | `learn`, `budget`, `reason`, `source` — self-reported intent captured at waitlist signup and used for plan recommendation | `waitlist` |

Note `poll_votes` — poll responses are stored **per user, non-anonymously**,
and the admin view surfaces voter names. Members are not told this at the point
of voting. Minor, but it is a disclosure item.

### 2.2 Member-uploaded deal documents — confirmed, and the memo is right to flag it

`retainer_files` (`api/_migrate.js`) stores `title`, `url`, `kind`
('link' or an uploaded file), and `uploaded_by`. `retainer_messages` stores
free-text project discussion between the client and the team.

This is where third-party confidential business information lands — pro formas,
capital stacks, term sheets, for named real projects. Findings:

- **No retention rule.** No expiry, no deletion trigger, no policy.
- **No deletion path.** Nothing deletes a `retainer_file` except the
  `ON DELETE CASCADE` that fires if the user row is deleted.
- **Access control is by retainer ownership plus admin role.** Every team
  member with an admin role can read every retainer client's uploaded
  documents and messages. There is no per-client access scoping.
- Uploads go to Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
  `[[NEEDS INPUT: are blob URLs unguessable-but-public, or access-controlled?
  If public-by-URL, a leaked link exposes a client's deal documents with no
  authentication. This should be verified before any retainer client uploads
  a real document.]]`

### 2.3 Subprocessors

Named, by function, from the code:

| Function | Subprocessor | Evidence |
|---|---|---|
| Hosting / serverless | Vercel | deployment target |
| Database | Neon | `@neondatabase/serverless`, `DATABASE_URL` |
| Payments | Stripe (incl. Connect) | `api/stripe.js` |
| Transactional email + contacts | Brevo | `api/_email.js` |
| File storage | Vercel Blob | `BLOB_READ_WRITE_TOKEN` |
| Video hosting | **YouTube (Google)** | lesson embeds, `src/index.jsx` |
| Scheduling | **Google** (Appointment Schedules) | booking link |

The last two are easy to miss and both need to be in the privacy policy.
YouTube in particular: lessons embed via `youtube.com/embed/...`, which is the
**cookie-setting domain**, not `youtube-nocookie.com`. Google may set cookies
on lesson view before any consent is captured (§2.5).

### 2.4 Session recordings

No recording infrastructure exists in the codebase. Recorded content is
attached manually as a YouTube link per lesson (the admin flow in
`CourseAttachmentsAdmin`, `src/index.jsx`).

`[[NEEDS INPUT: are live Lunch & Learns and 1:1 sessions recorded? If so —
on what platform, stored where, who can access them, retained how long, and is
consent captured before recording? None of this is in the system today. This
matters most for 1:1 Deal Review sessions, where a recording captures one
member's confidential deal in a durable, shareable artifact.]]`

### 2.5 Analytics and pixels — a clean finding

**No analytics or advertising pixels are present.** No Google Analytics, no
`gtag`, no Meta pixel, no Hotjar, nothing.

This is genuinely good news and it simplifies the privacy policy: the
"we do not sell or share personal information for cross-context behavioral
advertising" statement is currently **accurate**, and no "Do Not Sell or Share"
link is required. That stops being true the moment a marketing pixel is added,
so it should be recorded as a decision, not an accident.

The one caveat is the embedded YouTube player above, which is third-party
content that may set cookies on lesson view.

---

## §3 — Access and content

### 3.1 Access on non-payment — correctly enforced, server-side

This one is built properly and is worth stating plainly:

- `invoice.payment_failed` sets `membership_status = 'past_due'` and emails
  both the member and the team (`api/stripe.js`)
- `api/auth.js` returns `user.suspended` and **empties the entitlements array**
  when `membership_status !== 'active'`
- `resolveUser()` in `api/community.js` returns `null` for a non-active
  membership — a hard cutoff, not a hidden UI element
- `invoice.payment_succeeded` clears `past_due` and restores access

Access is enforced on the server, not merely concealed in the client. No
finding here.

### 3.2 Course content is downloadable in practice

Lesson video is an embedded YouTube iframe; lesson PDFs are served from Vercel
Blob URLs. Neither has a technical restriction against saving or sharing. The
protection is contractual only.

That is a normal and defensible posture — but it means the Terms' content
license clause is doing all the work, and it should say so honestly rather than
implying a technical control that does not exist.

### 3.3 Elite tier cap — was unenforced; now enforced

At audit time there was no cap, counter, waitlist gate, or seat check anywhere
in the subscription path: `fulfill()` set `tier = 'Elite'` for any successful
`sub_Elite` checkout without counting existing members. The system would have
sold the 21st seat of a publicly "limited" cohort.

**Resolved August 17, 2026.** `eliteSeats(sql)` in `api/stripe.js` counts
active Elite members — excluding team/admin accounts, which occupy no
commercial seat — against a cap stored in `settings.elite_cap`, defaulting to
**20**. `[[NEEDS INPUT: confirm 20 is the intended number. The memo says
"15–20"; 20 was chosen as the ceiling of that range. Change it by setting
`settings.elite_cap` — no deploy needed.]]`

Enforcement is layered:

1. **Before checkout** — a `sub_Elite` request from a non-Elite user returns
   HTTP 409 with `elite_full: true` when the cohort is full. The user is never
   charged for a seat that does not exist.
2. **At fulfillment** — two buyers can clear the pre-check simultaneously. If
   that happens, the seat is **honored** (they paid; revoking access silently
   would be worse) and the team is emailed "ELITE OVER CAP: N of 20" so it can
   be resolved deliberately — raise the cap or arrange a refund.
3. **In the UI** — the pricing page shows "N seats left" once 5 or fewer
   remain, and switches the Elite card to "Join the Elite waitlist" at
   capacity. `startCheckout()` handles the 409 explicitly rather than falling
   through to its generic mailto fallback.

Existing Elite members are exempt from the check, so a renewal or a return to
the billing flow is never blocked by the cap.

**Compliance note:** the "limited seats" claim is now backed by an enforced
mechanic, which is what makes it a truthful representation. Terms §2.4 should
state the cap number, how it is administered, and the waitlist terms — per the
checklist, once published, a seat limit is a commitment.

### 3.4 Free tier

One lesson total across all courses, tracked server-side via
`users.free_lesson_key` and the `claim_free_lesson` action in `api/auth.js`.
Correctly enforced.

---

## §4 — Consent and assent

### 4.1 Signup checkbox — exists, but is narrow and unrecorded

`src/member.jsx:140` renders an **unchecked-by-default, required** checkbox at
signup. Good pattern. Three problems:

1. **Scope.** It covers only the "Intellectual Property & Content Use Policy" —
   a paragraph of inline text. It does **not** reference Terms of Use or a
   Privacy Policy, because neither exists.
2. **No live hyperlinks.** The policy is inline body text, not a linked,
   versioned document.
3. **Assent is not recorded.** No column stores who agreed, when, or to which
   version. Confirmed against `api/_migrate.js` and `api/auth.js` — there is no
   `agreed_at`, `policy_version`, or equivalent field. The checkbox gates the
   form and is then discarded.

Per the checklist (§2.1 ★), the assent record is what makes the liability,
warranty, and dispute clauses enforceable. Right now there would be no way to
prove any given member accepted any given version.

### 4.2 No legal footer

No Privacy Policy, Terms of Use, Accessibility, or Contact links exist in the
footer on any route. Confirmed by search — the strings do not appear in
`src/`.

### 4.3 No cookie banner and no consent management

None present. Currently low-risk given §2.5 (no pixels), but the YouTube embed
is third-party content loading without consent.

---

## §5 — Accessibility

### 5.1 No captions or transcripts exist

Searched for `<track>`, `.vtt`, "caption", and "transcript" across `src/`. The
only hit is the word "transcripts" inside course prose (`src/index.jsx:215`),
not a captioning feature.

Lesson video is an embedded YouTube iframe. If captions exist, they exist
because they were added on the YouTube side per video; nothing in this platform
requires, verifies, or surfaces them.

`[[NEEDS INPUT: do the uploaded YouTube videos have human-reviewed captions?
YouTube auto-captions are generally not sufficient for WCAG 2.1 AA. The
answer determines whether the accessibility statement can claim anything at
all.]]`

Per the memo's DO NOT list, **no accessibility statement should claim WCAG
conformance or captioning until this is answered.**

### 5.2 Broader WCAG posture — not yet assessed

A full WCAG 2.1 AA pass (contrast ratios, focus indicators, keyboard traps,
heading order, ARIA on the community and course UIs) has not been run. Worth
noting that the site uses a deliberately low-contrast dark palette in places,
which is where contrast failures usually concentrate.

---

## §6 — Ranked blocker list

**Launch blockers — must be fixed before taking money from the public:**

1. ~~Self-service cancellation does not exist~~ — **RESOLVED** via Stripe
   Billing Portal + 15-day retention flow (§1.1); one manual step remains
   (save the portal configuration in the Stripe Dashboard).
2. **Entity determination unresolved** (§0.1) — blocks every document, and the
   merchant-of-record question underneath it is not cosmetic.
3. **No Terms of Use, Privacy Policy, or any published legal document exists.**
4. **Assent is not recorded** (§4.1) — nothing to enforce, once drafted.

**High priority:**

5. No post-purchase acknowledgment with terms and cancellation steps (§1.4)
6. No pre-charge disclosure adjacent to purchase buttons (§1.3)
7. No separate affirmative consent to recurring billing (§1.2)
8. Member-uploaded deal documents have no retention, no deletion path, and
   possibly public-by-URL storage (§2.2)
9. Captioning status unknown; accessibility statement blocked until answered
   (§5.1)

**Resolved August 17, 2026:**

- ~~Elite cap not enforced while being advertised~~ — now enforced (§3.3)
- ~~10%/30% session discounts do not exist~~ — now built server-side (§1.6)

**Resolve before drafting:**

10. Confirm the Elite cap number is 20 (§3.3)
11. Retainer, Lunch & Learn, and session SKU descriptions in the memo do not
    match the code (§1.7)
12. Session recording practice undefined (§2.4)

---

## §7 — Consolidated `[[NEEDS INPUT]]`

**Gating**
1. Legal entity owning GroundUp — and confirmation of which entity owns the
   platform Stripe account (merchant of record)
2. Governing law and venue (follows entity; likely DC, not Maryland)
3. Entity address and public contact email
4. Production domain

**Commercial**
5. Refund terms per SKU — subscriptions, $100/$250 passes, $39.99 Lunch &
   Learn 6-month access, five session types, retainers, $1,500 onboarding fee
6. Are the 10%/30% member session discounts intended, and have they been
   marketed?
7. Elite cap — the real number, and what happens at capacity
8. Minimum age (18+ recommended given payment obligations)
9. Damages cap formulation
10. Arbitration: yes or no

**Data**
11. Every retention period (account, financial 7-year floor, recordings,
    deal documents, support, logs, backups)
12. Are Vercel Blob URLs public-by-URL or access-controlled?
13. Are live sessions recorded? Where stored, who accesses, how long kept?
14. Soft-delete window length
15. Does a member deletion request remove them from a group recording other
    members paid to access? *(Flagged per memo — not resolved here.)*

**Accessibility**
16. Do course videos have human-reviewed captions?
17. WCAG 2.1 AA remediation owner and schedule

---

## §8 — Routed to counsel

- **Entity and merchant-of-record determination** — gates everything downstream
- **Auto-renewal compliance across all recurring SKUs** — ROSCA, California
  ARL, and NY/OR equivalents. Highest-penalty area, and the cancellation gap in
  §1.1 is a live one, not theoretical
- **Whether Deal Review and Capital Stack sessions approach regulated advice** —
  investment adviser, broker-dealer, or real estate brokerage. Members bring
  real deals with real numbers; the not-advice disclaimer is load-bearing
- **Enforceability of member-to-member confidentiality** in group sessions
- **Duty of care arising from member-uploaded deal documents** (§2.2)
- **Professional liability / E&O coverage** for educational and advisory content
- **DakJen Creative LLC services agreement** — separate from all GroundUp-facing
  documents; DakJen appears as a party in none of them

---

*No legal conclusions are drawn in this document. Nothing here is legal advice.
Findings are statements about what the code does and does not do.*
