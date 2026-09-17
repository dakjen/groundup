# GroundUp — The Partner (Organizational) Model

**Internal reference — not for distribution.** Last updated: September 16, 2026.
Everything here describes what is actually built and live at community.drginamerritt.net.

---

## 1. What the Partner model is

Partner is GroundUp's **organizational tier** — for agencies, CDFIs, housing departments, and nonprofit developer programs that want to put a **cohort of developers** through the curriculum. The organization pays; their developers don't.

The core deal:

- The organization **sponsors one year of GroundUp for its cohort** at a negotiated group discount. There is **no fixed price** — every partnership is priced per deal, based on cohort size and which courses they need.
- The cohort gets **personalized access**: only the courses their program actually calls for, at a partner rate, delivered through a **branded page carrying the organization's own logo**.
- **Dedicated onboarding** from the team — the accounts are set up for them; nobody in the cohort touches a checkout page.
- **After the sponsored year**, the developers continue (if they choose) as regular individual members at standard rates — the partnership is also a member-acquisition funnel with a one-year warm-up.

Positioning on the website: Partner appears as a full-width "Talk to Us →" band below the individual plan cards on the pricing page — deliberately a conversation, never a checkout.

## 2. The lifecycle of a partnership, step by step

1. **Interest arrives.** The organization fills out the Partner Interest form at `/partner-interest` (organization, contact, email, phone, cohort size, needs). The submission emails **djmj@nreuv.com and bhardie@nreuv.com** directly — no account required, nothing stored on a waitlist.
2. **The deal is negotiated by humans.** Price, cohort size, and curriculum are settled off-platform. Nothing in the system constrains the terms.
3. **The team builds their page.** In **Admin → Courses → Partner Pages**: enter the organization's name, choose a slug, upload their logo, and toggle on exactly the courses their cohort gets. Saving makes it live instantly at **`community.drginamerritt.net/partner/<slug>`** — with a copy-link button for handing to the partner.
4. **The team creates the cohort's accounts.** From **Admin → Users**: add each developer (optionally with a starting password), and grant access by either setting their tier and marking them **Comped**, or issuing **month-free gift links** in bulk via CSV with a personal message. Comped members are excluded from all revenue stats and billing emails, and never occupy Owner seats.
5. **The cohort learns.** Developers sign in through the partner page (or the main site — same accounts) and see the full member experience for the courses they've been granted.
6. **Year-end.** Comps are removed (manually — see §6); developers who continue join as ordinary paying members at standard rates.

## 3. The branded partner page (`/partner/<slug>`)

What the public/cohort sees at their page:

- The **organization's logo and name** presented alongside GroundUp branding
- **Only their curriculum** — the specific courses toggled on for them, and only ones that are published (hidden drafts never leak through a partner page)
- Copy explaining the courses were "selected for your cohort and taught by Dr. Gina Merritt," with a sign-in prompt for the accounts the program set up
- A path to explore the broader site

What it is **not**: a separate app or login system. It's a branded front door; content gating is identical to the main site — the cohort's access comes entirely from their individual accounts.

## 4. The admin tooling (all live today)

**Partner Pages manager** (inside Admin → Courses):
- Create/edit: name, slug, logo upload, per-course toggles (drafts shown to admins with a "(draft)" marker so future courses can be pre-assigned)
- Active flag — a partnership that ends can be switched off without deleting its history
- Copy-link button for each page

**Cohort account machinery** (Admin → Users + Referrals):
- Add users individually with tier + optional password; the `Partner` tier exists as a label option
- **Comped toggle** — full access, zero billing, excluded from MRR/ARR and seat counts
- **Bulk gift links via CSV** — one personal-message batch creates email-locked, single-use, 60-day links for a whole cohort at once
- The master **Contacts** compiler picks cohort members up automatically for email audiences

**Partner Interest inbox**: submissions land as email at djmj@nreuv.com and bhardie@nreuv.com with all form details.

## 5. Data model (for the technically curious)

- **`partners` table**: `slug` (unique), `name`, `logo_url`, `course_ids` (JSON list of course ids), `active`, `created_at`
- Cohort membership lives on the user: **`users.partner_slug`** ties a member to their program (set per row in Admin → Users via the cohort dropdown). A member with a `partner_slug` gets a **My Cohort tab** — their program's logo, name, selected curriculum, and a door into their channel.
- **Every partner page auto-creates a private cohort channel** (`channels.partner_slug`) visible only to that cohort and the team — "Acme Cohort," their room with Dr. Merritt. Access to everything else still comes from ordinary comped/gifted membership, so community, progress, entitlements, and email all work with zero special cases.
- Public API: `GET /api/resources?partner=<slug>` returns the branding plus only that partner's **published** courses; admin endpoints handle save/toggle. Server-side filtering — a partner page can never expose unpublished content or content outside its list.

## 6. Honest gaps — what the model does NOT yet do

Worth knowing before selling hard:

1. **No automated year-end expiry.** Comped access doesn't expire on its own; ending a sponsored year means un-comping the cohort from Admin → Users (the gift-link path self-limits to one month, so comping is the real tool and it's manual). A "cohort end date" with automatic reversion is buildable if partnerships multiply.
2. **No per-partner course *restriction* on accounts.** The partner page *displays* only their curriculum, but a comped account at a given tier can browse the full catalog like any member of that tier. In practice this is a feature (taste of the whole platform → conversion), but if a partner contract requires strict curriculum limits, that enforcement doesn't exist yet.
3. **No cohort-specific events yet.** The cohort channel is where cohort-only office hours or sessions get announced, but there's no separate scheduling machinery per cohort — Dr. Merritt posts the invite in their channel.
4. **No partner-facing dashboard.** The organization can't see their cohort's progress or usage; reporting to partners is manual. (Lesson-level progress data exists in the platform, so a cohort report is buildable.)
5. **No self-serve partner billing.** By design — every deal is negotiated — but it means invoicing lives outside the platform (QuickBooks/NREUV side).
6. **Partner tier label vs. reality.** The `Partner` tier value exists on user accounts as a label, but access really comes from the tier + comped combination; the label is cosmetic.

## 7. How Partner relates to everything else

- **Not the partner *referral* program** — that's individuals with referral codes earning discounts (Admin → Referrals). Same word, different machinery.
- **Not the NREUV partner *network*** — that's the Owner-benefit list of service companies with member referral codes on the Resources page.
- **Feeds the funnel**: cohort members finish their year already inside the community, already badged, one click from becoming standard members. The sponsored year is the longest, warmest trial the platform offers.

---

*For pricing context see PRICING-RULES.md §13. Questions about a specific partnership's setup → Dakotah.*
