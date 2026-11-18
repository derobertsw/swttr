# Proposal: add gear from email or photos (#289)

> **Status: proposal, waiting for the maintainer's decision.** Nothing here is approved or built. This document changes no code, schema or service configuration. The decisions are listed at the end.

Today, adding gear means searching the catalog for each item or creating a custom item by hand. #289 asks whether we could read order confirmation emails, or recognize gear from a photo, so people can fill a wardrobe faster. This page covers how each could work within SWTTR's existing rules, what each would cost, and a recommended first step.

## How the wardrobe works today

These are the constraints any import has to respect.

- **Hand-curated catalog.** `garments`, `handwear` and `headwear` hold calibrated thermal and protection data: about 150 items in the October 18 test fixture (`src/test/fixtures/gear-catalog.json`). The policy is a curated catalog for popular gear, custom items for everything else, and **no bulk scraping of retailer sites** (#94). New catalog rows go through the `add-wardrobe-item` skill: researched estimates, a reviewed migration, and the SQL applied by hand.
- **Search runs in the browser.** `GET /api/wardrobe/available` returns the whole catalog. `useWardrobe` filters and ranks it by brand, model and category text (`src/hooks/useWardrobe.ts`).
- **Adding.**
  - `POST /api/wardrobe/gear` adds a catalog item.
  - `POST /api/wardrobe/custom` creates a custom item from a body part, a layer and a generic option, with a name of up to 50 characters. Its only thermal value is the clo from `src/data/genericLayerClo.ts`. It has no wind, water or breathability data.
  - **A user can have only one custom item per body part, layer and generic option**: `user_custom_items` is unique on that set (migration `010`). A second light base layer would collide.
- **Generic renames.** `user_item_mappings` stores each user's name for a standard generic option.
- **Access.** Only API routes touch Supabase, with the service-role key and Clerk user IDs. The browser never does.
- **No user uploads.** Catalog images are files in `public/` or curated URLs (`docs/catalog-images.md`). Supabase Storage was rejected because free projects pause (#83).
- **Privacy.** The policy (#140) and the App Privacy answers (#148) cover today's data, which includes no email content and no photos.

What follows from this:
1. **Most imported items won't be in the catalog.** For most people the real benefit is faster entry through custom items, not exact catalog matches.
2. **The one-custom-item-per-type rule blocks imports** of two items of the same kind. That needs a decision (decision 4).
3. **Imports must not create catalog rows.** The catalog stays hand-curated. At most, the brand and model names of unmatched items could be counted to show the maintainer which items are missing (decision 5).

## Shared pipeline

Email and photos would feed the same steps. Each step runs in an API route, per the rule that calculations stay server-side; the browser only uploads and shows the review.

1. **Extract.** Turn the email text or photo into structured candidates: brand, product name, readable tag text, product type, and a guess at body part, layer and generic option. A model does this with a fixed output schema, and the server validates the result.
2. **Match.** Our own code, not the model, compares each candidate with the catalog. It normalizes brand spellings (for example "Norrøna"/"Norrona") and model words, and returns up to three catalog items with a score. Picking catalog IDs in code keeps a bad model answer from adding the wrong item.
3. **Fall back.** If nothing matches well, propose a custom item: a body part, layer and generic option, plus the product name as its custom name (trimmed to 50 characters). Label it **Estimated**.
4. **Review.** A review sheet lists every candidate and adds nothing without confirmation. For each row the person picks the catalog match, a custom item or Skip.
   - **High confidence** (one clear catalog match on brand and model): pre-selected.
   - **Medium:** the person chooses from the candidates.
   - **Low:** the custom-item suggestion, not selected.
5. **Save** through the existing `/api/wardrobe/gear` and `/api/wardrobe/custom` logic, or a batch version of it.
6. **Discard** the email text or photo as soon as extraction finishes. Only confirmed wardrobe rows are kept.

## (a) Email

### Option A1: a forwarding address

- **How it works.** Each person gets a private address, such as `gear-<random token>@in.<our domain>`, and forwards order confirmations to it. An inbound email provider posts each message to a signed webhook, which runs the pipeline. The review then waits in the wardrobe.
- **Blocker.** It needs a domain we own: #17, which is P3 and also blocks Clerk production (#16).
- **Security.**
  - The token is unguessable, and the person can rotate or revoke it.
  - Only accept mail whose sender is one of the account's verified Clerk email addresses and that passes the provider's SPF/DKIM checks. Drop anything else without replying.
  - Verify the webhook signature, and limit messages per person per day.
- **Untrusted content.** Email text can carry instructions meant for the model. The extraction call has no tools and returns only the fixed schema. The server ignores everything else and chooses the catalog IDs itself.
- **Privacy.** Order emails contain a name, shipping address, phone number, order number and partial card details.
  - Send the model only the text it needs. Don't store the raw message, and delete it once extraction finishes.
  - Log counts only, as the Geoapify adapter does.
  - The privacy policy needs a new section before launch. App Privacy would declare "Emails or Text Messages" if mail is kept longer than it takes to process it.
- **Parsing.** Every retailer formats confirmations differently, so per-retailer parsers would be brittle. Extract with the model instead. When a message embeds schema.org order data (some retailers do), read it directly first; that's exact and costs nothing.
- **Cost.**
  - Inbound provider: Postmark's Pro plan includes inbound processing at $16.50 a month; its free tier is 100 emails a month ([pricing](https://postmarkapp.com/pricing), checked November 16, 2026). Other providers weren't compared.
  - Model: one text call per email, a few thousand tokens. See the cost table below.
- **Friction.** People have to find each email and forward it one at a time, which is clumsy on a phone.

### Option A2: connect Gmail or Outlook

- **How it works.** The person connects a mailbox. The server searches recent mail from outdoor retailers and runs the pipeline on matching messages.
- **Google** ([restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), checked November 16, 2026):
  - Reading message bodies needs a restricted Gmail scope.
  - An app that stores or sends that data through its servers must pass a security assessment by a Google-empanelled assessor, repeated at least every 12 months. Verification can take several weeks. Google's page doesn't publish the assessor's fee.
  - [Limited Use](https://developers.google.com/terms/api-services-user-data-policy) rules apply. The data may only power user-facing features; no ads; people may not read it except in narrow cases; and it may go to a third party (such as a model provider) only to provide the feature, with the user's consent.
- **Clerk.** Clerk's shared OAuth credentials can't request extra scopes or hand us the user's access token, so this needs our own Google credentials in Clerk or a separate OAuth flow outside Clerk. Before real users connect mail, it also needs a production instance (#16, which waits on #17).
- **Microsoft.** Outlook would use Microsoft Graph mail-read permission. Microsoft recommends publisher verification, and some work or school accounts need an administrator to approve. This wasn't checked in detail for this proposal.
- **Ongoing work.**
  - Refresh tokens: encrypted at rest under a new secret.
  - Disconnecting revokes them, and so must account deletion (#139, not built yet).
  - Asking to read someone's whole mailbox is a large request for a small app.
- **Verdict.** Not for a first version. Revisit only after launch, if forwarding proves popular and the yearly assessment is budgeted.

### Option A3: paste the email text

The person pastes an order confirmation, or any receipt text, into a box, and it runs through the same pipeline. This needs no domain, inbound provider or OAuth. It's the cheapest way to try email extraction. The first slice can include it at almost no extra cost.

## (b) Photos

- **What to photograph.** A hang tag or sewn-in label with the model name or style number is far easier to identify than the garment itself. Many shells and puffies look alike, and logos only give the brand. The capture screen should ask for the tag or label first, and accept a product photo as second best.
- **Where recognition runs.**
  - **On a server, with a vision model** (recommended to start). It reads tags well and can guess the product type from the garment. The photo leaves the device, costs a little per photo, and takes a few seconds.
  - **On the device: iOS text recognition through a native bridge in the Capacitor shell.** Free and private: only the recognized text goes to the server for matching. It needs native work in `ios/` (#144) and can't tell what kind of garment an unlabeled item is. It's a good second step for iPhone, not a replacement.
  - **In the browser.** Shrink the photo to at most about 1,500 px on the long edge and re-encode it before upload. That keeps it under Vercel's request-body limit and strips EXIF data, including GPS location. The browser can't reliably read tags itself.
- **Matching** is the shared pipeline above. The model returns text fields and a product-type guess; our matcher decides what's in the catalog.
- **Retention.**
  - Keep no photos: process the upload in memory and discard it, so there's nothing to store and nothing for #139 to delete later.
  - Using a person's photo as their item's picture would need file storage. That's a separate decision, and Supabase Storage on the free plan was already rejected.
  - Pick a model provider whose API terms rule out training on our inputs and keep retention short. Check that before sending any user photo.
- **iOS.** A camera file input works in the WKWebView shell, but it needs an `NSCameraUsageDescription` string in `ios/App/App/Info.plist`, which today declares only location.
- **App Privacy.**
  - Apple counts data as collected when it's kept longer than it takes to answer the request. Discarding photos after extraction may keep "Photos or Videos" off the label.
  - The model provider's own retention counts too, so recheck this in #148.
- **Abuse and cost control.** Signed-in only, a daily per-person cap (for example 30 photos), and a size limit.

### Model cost per item

These are rough estimates from Anthropic's list prices as of November 3, 2026. Other vision providers exist; choosing one is decision 2.

**Assumed inputs:**
- A tag photo shrunk to about 1,500 × 1,100 px. Vision input costs one token per 28 × 28 px block, so this is about 2,200 tokens.
- About 1,000 tokens of instructions.
- About 300 tokens of structured output, plus any reasoning tokens, which are billed as output.
- A pasted or forwarded email: about 3,000–6,000 tokens of text instead of the photo.

| Model | Price per 1M input / output tokens | Per photo | Per email |
|---|---|---|---|
| Claude Haiku 5.5 | $0.10 / $0.50 | ~$0.0005 | ~$0.001 |
| Claude Sonnet 5.5 | $2 / $10 | ~$0.01 | ~$0.015 |
| Claude Opus 5.5 | $4 / $20 | ~$0.02 | ~$0.03 |

A person adding a 30-item closet would cost from about two cents to under a dollar, depending on the model. No free tier is assumed. This adds one paid API, behind a new server-only key. The standing "free until launch" decision means it needs an explicit yes, and an entry in `docs/third-party-services.md` (#308).

## Recommended first slice

**"Add from a photo" on the web wardrobe page.** Photograph or upload a tag, label or product. The server extracts and matches it, the person reviews it, and it's added. A secondary "Paste an order email" box reuses the same extraction. Nothing is stored, and there's no domain, inbound email or OAuth.

Rough effort for one person, about **2 to 3 weeks**:

| Part | Estimate |
|---|---|
| Extraction route: model call, fixed schema, validation, per-person cap, counts-only logging | 2–3 days |
| Server-side catalog matcher: shared normalization with today's search, a brand alias list, scores | 2 days |
| Custom-item fallback: product type to body part, layer and generic option | 1 day |
| Upload: resize, strip EXIF, camera and file input | 1 day |
| Review sheet: per-row choice, low-confidence rows unselected, save | 2–3 days |
| Tests (route, matcher, review sheet) and an accuracy check | 2–3 days |
| Privacy policy and App Privacy notes, docs | 1 day |

**Accuracy check before shipping.** Measure on about 40 photos (tags, labels and products from a real closet) and about 15 order emails. For items that are in the catalog, the right one should be among the top three at least 90% of the time. An item that isn't in the catalog should never be marked high confidence.

**Later slices, each its own decision:**
- iPhone camera and on-device text recognition (#144).
- Several photos at once.
- A forwarding address once #17 lands.
- A count of unmatched brand and model names, to guide curation.
- Gmail or Outlook connection only after launch, with the assessment budgeted.

## Risks

- **Few catalog matches.** With a catalog of about 150 items, most imports become custom items with generic clo and no protection data, so recommendations are coarser than with catalog gear. Show **Estimated** clearly.
- **Duplicate types.** Without a change to the custom-item rule, a second item of the same type fails or replaces the first.
- **Wrong matches change recommendations.** Mitigated by mandatory review, the matched item's name and picture in the review sheet, and never adding anything automatically.
- **Prompt injection** through email or tag text. Mitigated by a model call with no tools, a fixed output schema, and catalog IDs chosen by the server.
- **New personal data.** Email content and photos need privacy policy and App Privacy updates, and a check of the provider's data terms, before launch.
- **Cost and abuse.** Mitigated by sign-in, per-person caps and size limits; spend is visible in the provider's usage reports.
- **Catalog creep.** Imports never write catalog rows; curation stays manual (#94).

## Decisions for the maintainer

1. **Build it at all, and which source first?** Recommended: photos of tags or labels, plus pasted email text. Forwarding comes later; mailbox connection is off for now.
2. **Vision provider and model.** Recommended: start with the cheapest capable model (for example Claude Haiku 5.5) and move up only if the accuracy check needs it. This also means accepting one small paid API before launch.
3. **Photo retention.** Recommended: keep none. The alternative, storing photos as item pictures, needs file storage.
4. **Custom-item rule.**
   - Option 1: allow several custom items of the same type, with different names. This needs a migration to drop the uniqueness rule and a change to how `POST /api/wardrobe/custom` reuses removed items.
   - Option 2: keep the rule, and let the review sheet offer "replace your existing one" or Skip.
5. **Curation signal.** May unmatched brand and model names be counted, with no user IDs, so the maintainer can see which items to add to the catalog?
6. **Email.** Paste-only for now, a forwarding address after #17, or neither? Is Gmail/Outlook connection ruled out until after launch?
7. **iPhone.** Ship the camera in the iPhone beta (#144), or web first?
8. **Bar to ship.** Is "top three right at least 90% of the time, no confident wrong matches" the right threshold?
