# GroundUp — Pricing Rules (as implemented)

**Platform:** community.drginamerritt.net · **Last updated:** September 3, 2026
This document reflects every pricing rule currently implemented in code. Prices are in USD.

---

## 1. Membership tiers (monthly)

| Tier (display name) | Internal tier | Price | Notes |
|---|---|---|---|
| Member | Basic | $49.99/mo | Every course + community read access |
| Builder | Builder | $149.99/mo | + posting, free live L&Ls + recordings, view-only templates |
| Premium | Premium | $249.99/mo | + 3 downloads/mo, Opportunity Board, office hours, 10% off 1:1s |
| Elite ("Owner") | Elite | $499.99/mo | + deal support in advisory calls, DMs, unlimited downloads, 30% off 1:1s |

- **Elite cap:** advertised at 15 seats; internally allowed to 20 (the "quiet" seats are for insiders, admitted manually). Comped and admin accounts do not occupy seats. The public seat counter appears only when ≤5 seats remain.
- **Positioning rule:** Member/Builder/Premium are the *foundation* (industry essentials — curriculum, community, tools). Deal-specific support (YOUR numbers, YOUR gap, YOUR structure) exists **only** at Elite and the Senior Advisor retainer.
- **Tier changes happen ONLY via Stripe payment or admin action** — never from client input.

## 2. Annual billing (deliberately unpromoted)

- Annual versions of all four tiers exist but are **not shown on the website**. They appear only when a visitor arrives through a link carrying `?annual=1` (used in the pass-expiry email).
- Annual price = 12 × the monthly rate, with a **10% discount (coupon ANNUAL10)** applied visibly at Stripe checkout, every year. Effective first-year totals: Member $539.89 · Builder $1,619.89 · Premium $2,699.89 · Elite $5,399.89.
- **Annual refund rule:** cancel **within the first 6 months — plus a 10-day grace period past the mark** → half the annual payment (6 months) is refunded. More than 10 days into the second half → the refund is forfeited; access runs to the end of the paid year. (Stated in the Terms and the member billing card; the team gets a REFUND DUE alert with the NREUV transfer-reversal reminder.)

## 3. One-time course passes

| Pass | Price | Access |
|---|---|---|
| Single Course Pass | $100 | **60 days** of one course — written lessons only |
| All-Access Pass | $275 | **30 days** of every course — written lessons only |

- **Passes are read-only:** pass and trial holders get the written lessons (and lesson videos) but NOT worksheet/template/case-study PDF downloads — documents are a membership benefit, enforced server-side.
- **Pass-expiry funnel:** a daily cron emails anyone whose pass just ended (Free-tier accounts only): they have a **7-day window** to either (a) buy another pass, or (b) join as a member paying **annually at 15% off (coupon PASSJOIN15)** — the 15% *replaces* the usual 10% annual discount; they never stack. The 15% applies automatically at checkout for an annual plan bought within 7 days of pass expiry.

## 4. Lunch & Learn

- L&L access: **$39.99 for 6 months** (all live sessions + recordings). Codes can also grant access.
- **Attendee perk (LNL25):** 25% off the first month of any membership, valid for 2 months after purchase/redemption, applied automatically at checkout.
- Revenue split: **100% of L&L revenue goes to NREUV** (platform takes no cut).
- **Every paid member gets free invites to live sessions** (Member and up — RSVP included). The **recording library stays Builder and up**. Free accounts buy access ($39.99/6mo) or use a code — a purchase includes recordings.

## 5. 1:1 sessions with Dr. Merritt (45 min)

| Session | Sticker price |
|---|---|
| Deal Review | $500 |
| Strategy Session | $425 |
| Capital Stack Review | $550 |
| Community Development | $375 |
| BIPOC Developer Session | $275 — **never discounted** (already priced as an access offering) |

- **Member session discounts:** Premium 10% · Elite 30% (all sessions except BIPOC). Discounted prices round **down** to the nearest $5, always in the member's favor. Applied server-side; the client never sends an amount.
- Split: **90% NREUV / 10% platform**.

## 6. Senior Advisor retainer & the Full Project Intake

- **Full Project Intake — $1,500, sold standalone.** The front door for anyone with a live deal: Dr. Merritt takes in the entire project (pro forma, capital stack, site, timeline). If the client continues into a retainer, the **$1,500 is automatically credited against the first retainer month** (coupon INTAKE1500) and the intake is marked credited. The free engagement/discovery call remains the no-cost path.
- Retainer tiers (monthly): **5 hrs — $3,025 · 10 hrs — $5,500 · 15 hrs — $7,700.** All include everything in Elite. Split: 90% NREUV.
- Dr. Merritt's reference rate: $550/hr.

## 7. Discounts & how they stack (checkout order — first match wins, one per checkout)

1. **MONTHFREE gift link** — 100% off the first month; email-locked, single-use, 60-day expiry; can be issued in bulk via CSV with a personal message.
2. **INTAKE1500** — $1,500 off a retainer's first month for anyone with an unused paid intake.
3. **PASSJOIN15** — 15% off an annual plan, within 7 days of a course-pass expiry.
4. **ANNUAL10** — 10% off any annual plan, every year.
5. **STRETCH10 / STRETCH15** — the waitlist stretch offer (see §8); 10% (15% for first-10) off the first 12 months. Server-verified against the waitlist record; URL parameters alone cannot unlock it.
6. **LNL25** — 25% off the first membership month for Lunch & Learn attendees.

**Elite is never discounted** by the stretch offer. Gifts still collect card details and bill normally from month 2.

## 8. Waitlist perks & the recommendation engine

- **Founding 25 (insider waitlist only):** the first 25 insiders get their **first year of Lunch & Learns free** (even on a free account), a Founding badge, and **founding pricing for their FIRST YEAR** — Builder at $99.99/mo and Premium at $149.99/mo (the launch rates), applied automatically as a 12-month coupon at checkout (FOUND25B/P; annual variants once), then standard rates. Advertised in a banner on the insider /waitlist page.
- **First 10 (either list):** a **14-day trial of one course** claimable after signup, a **personal invite link** (`/invite/their-name`) that grants the same 14-day one-course trial to people who sign up through it, a First-10 badge — and they **always** receive the stretch offer at **15%** instead of 10%.
- **Recommendation algorithm** (budget first, need second):
  - Budget options: **$50 · $50–$150 · $150–$500 · $500+ · "I need general deal support & guidance" · "I need specific, customized deal help" · $2,000+**
  - $500+ → **Elite**
  - "I need general deal support & guidance" → **Premium**
  - $2,000+ → **Senior Advisor Retainer** (from $3,025/mo, engagement-call CTA)
  - $150–$500 → **Elite** when their answers point at Dr. Merritt directly (need 3), else **Premium** · legacy $300+/$500+ keep this/Elite meaning
  - $50–$150 → **Builder** if their answers point at the community (need ≥ 2), else **Member** · legacy $25–$100/$100–$200 keep their meaning
  - $50 → **Member**
  - **"I need deal-specific support on a live project"** (learn answer) → **Elite, regardless of budget** — only Elite and the retainer include deal support.
  - **"I need specific, customized deal help"** (budget answer) → **Elite** — same rule, from the budget question.
  - Admin can override any recommendation; comped waitlisters are excluded from MRR/ARR projections and receive no launch/recommend emails.
- **Stretch offer:** insiders recommended Member in the mid-budget band are offered **Builder** at 10% off (15% for first-10) for the first year.

## 9. Download & content rules

- **Downloads:** Builder = view-only · Premium = **3 downloads per billing month** (anchored to the tier-anniversary date, no rollover) · Elite = unlimited.
- **The Developer's Playbook:** view-only below Elite; download is Elite-only.
- **Digital products (shop):** priced per item with an optional "value" comparison; buyers must accept the IP disclaimer; purchases grant a permanent download in their account.
- **No dollar-value claims** anywhere ("$X value" language is banned); value is expressed qualitatively.

## 10. Gates

- **Advisory calls + the networking-event invite unlock after 4 months (120 days) of continuous membership** (Elite). Only these two benefits are gated — everything else is immediate. Gate length is a setting (`benefit_gate_days`).

## 11. Refunds & cancellation

- **All sales are final once content has been viewed or downloaded** (courses, passes, digital products).
- **Monthly plans:** cancel **before the 5th of the month** → that month is refunded. On/after the 5th → no refund; access runs through the paid period.
- **Annual plans:** cancel **within the first 6 months (10-day grace period honored)** → 6 months (half) refunded. More than 10 days into the second half → refund forfeited; access runs to the end of the paid year.
- Refunds are processed **manually** by the team (never automated) because the NREUV split has already been transferred — every refund requires **reversing the matching NREUV transfer**. The webhook sends a REFUND DUE alert with instructions.
- **15 days after a membership ends, account data (posts, messages, progress) is permanently deleted**; rejoining before then restores everything. Financial records are retained.

## 12. Revenue splits & the refund pot (NREUV share of GROSS, platform absorbs Stripe fees, capped at net)

**The refund pot:** 20% of every payment stays in the Stripe platform balance until its refund window closes — **capped at $1,000 total**; once the pot is full, new payments split 100% immediately, and room opens as slices release or fund refunds. Windows: 45 days for monthly and one-time payments, 193 days (6 months + the 10-day grace) for annual. Only the remaining 80% is split immediately at the rates below. The daily cron releases each pot slice on schedule, split at the same rate. If a refund-eligible cancellation happens first, the slice is consumed to fund the refund instead (it never transfers to NREUV), and the REFUND DUE alert states the exact dollar amounts: what to refund, what the pot covers, and what remains to reverse.

| Product | NREUV share |
|---|---|
| Memberships & course passes | 75% |
| 1:1 sessions & retainers (incl. the intake) | 90% |
| Lunch & Learn | 100% |

## 13. Partner tier (organizations)

- **Partner** is a contact-us tier for agencies, CDFIs, and nonprofit developer programs: the organization **sponsors a year of GroundUp for its cohort of developers at a group discount** (the developers pay nothing in the sponsored year); after the sponsored year, the developers continue as regular individual members at standard rates. Personalized access to the courses the cohort needs at a partner rate, a branded partner page (/partner/slug — company logo, only their curriculum), dedicated onboarding. No fixed price — negotiated per deal, routed through the contact page. Shown as a full-width button below the plan row.

## 14. Free accounts

- A free account sees **course titles and curricula only — no lesson content**, and gets **one free live Lunch & Learn** (the first RSVP grants access through that session, once ever) (the old one-free-lesson perk is retired; accounts that claimed one keep it). Free accounts can buy passes, L&L access, sessions, and shop items, claim earned perks (First-10 trial, gifts, LNL25), and set up their community profile.

## 15. Comped accounts

- Set by admins (including from the waitlist pre-launch). Comped members get full tier access but are excluded from MRR/ARR stats, Elite seat counts, and billing emails; the member billing card is hidden for them.
