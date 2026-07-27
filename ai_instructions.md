# AI instructions for Maxine's Pop Tracker

## Maxine: how to use this file

Give your AI assistant access to this repository and say:

> Read `ai_instructions.md` completely, follow it for this task, and improve
> Maxine's Pop Tracker. My requested change is: **[describe the change here]**.

Include screenshots, example links, and what you expected to happen whenever
they are useful. Ask the AI to show you the finished result and explain anything
you need to do to run it. You should not need to understand or prescribe the
implementation.

The rest of this file is addressed to the AI assistant.

---

## Your role

You are improving **Maxine's Pop Tracker**, a personal, local-first Funko Pop
collection app. Work as a careful product engineer and collector: understand
Maxine's request, inspect the existing implementation, make the complete change,
test it in proportion to its risk, and leave the app straightforward to run on
Windows and Linux.

Lead with a working outcome. Do not require Maxine to translate her idea into
technical steps when the repository gives you enough context to proceed.

## Non-negotiable product requirements

- Keep the app local-first. Collection edits live in Maxine's browser, with JSON
  backup/restore and CSV export available from **Data & backup**.
- Do not introduce containers. The production app must continue to run with one
  command: `start.bat` on Windows or `./start.sh` on Spock/Linux.
- Keep Windows support and the SMB-share workflow working. The app requires
  Node.js 22.12 or newer, but it must not require Python or development packages
  at normal runtime.
- Keep the Linux launcher listening on the LAN so `http://spock.lan:4173` works
  from another computer. Keep the Windows launcher local to that PC unless
  Maxine explicitly asks otherwise.
- Preserve the modern, playful, comic-inspired visual language and responsive
  layout. This is an unofficial fan-made tool; do not add copyrighted Marvel or
  Funko artwork merely for decoration.
- Do not add logins, cloud storage, a hosted database, paid services, API keys,
  telemetry, or marketplace automation without explicit approval.
- Never invent product identifiers, prices, release details, or collection
  facts. Uncertain matches must remain suggestions that Maxine can verify.

## Protect Maxine's data

Maxine's current browser collection is more important than the checked-in seed
file. The app stores browser state under `maxines-pop-tracker:v1` in
`localStorage`.

- Never clear, overwrite, or migrate browser storage casually.
- Before a risky storage/schema change, tell Maxine to export a JSON backup and
  implement backward-compatible normalization or migration.
- Use a fresh browser profile for automated UI testing. Do not test destructive
  actions against Maxine's normal browser profile.
- Do not re-import the Excel workbook or regenerate `src/data/seed.json` unless
  Maxine explicitly requests it. Re-importing seed data is not a substitute for
  preserving live browser data.
- Preserve unknown fields when normalizing or migrating records.
- Do not inspect `.env` files unless Maxine explicitly authorizes it and the
  task genuinely requires it. Never print, commit, or expose their secrets.
  This app's normal public-source research does not require marketplace
  credentials.

## Repository and architecture

The canonical repository is:

- Linux/Spock working copy: `/mnt/data/code/funko`
- Gitea remote: `http://spock.lan:3000/flyrat/funko.git`
- On Windows the same SMB share may appear under a drive such as `X:\funko`.
  Use the actual repository root available in your environment.

Read `README.md` before changing behavior. The main implementation is:

- `src/App.tsx` — page routing and modal coordination
- `src/store.tsx` — local persistence, normalization, and collection mutations
- `src/types.ts` — data model and source/result contracts
- `src/lib.ts` — shared identifiers, images, search links, merging, and exports
- `src/components/ItemModal.tsx` — add/edit Pop workflow
- `src/components/InfoFinder.tsx` — shared information-finder interface
- `src/pages/Finder.tsx` — any-Pop and whole-library enrichment workflows
- `src/pages/Gaps.tsx` — number-run gaps and discovery candidates
- `src/pages/Library.tsx` — collection, wishlist, and for-sale views
- `src/pages/Dashboard.tsx` — summaries and valuation coverage
- `src/pages/Backup.tsx` — JSON backup/restore and CSV export
- `src/pages/Settings.tsx` — local preferences and source explanations
- `src/styles.css` — the established responsive design system
- `server.mjs` — static production server, safe image previews, and public
  product-information enrichment
- `scripts/validate_data.mjs` — validation for checked-in collection/catalog data
- `dist/` — committed production build used by the single-command launchers

The UI is React 19 and TypeScript, built with Vite. The server intentionally
uses Node's standard library. Prefer the existing small dependency footprint.

## Product-information rules

Treat identifiers as different facts:

- The **box number** is the number printed on the Pop box, such as `944`.
- A **Funko item ID/SKU** identifies the manufactured product, such as
  `FUN58178` or `58178`.
- A **UPC/EAN barcode** is a retail barcode, such as `889698581783`.
- An **Amazon ASIN** identifies an Amazon listing, such as `B091JFY844`; it is
  not a Funko box number or UPC.

When adding or changing an information source:

1. Prefer exact direct product URLs, UPCs, and Funko item IDs over title-only
   searches.
2. Use newly discovered identifiers for a second, more precise lookup.
3. Retain source name, exact source URL, and check date on applied information.
4. Require manual verification for weak title-only, sticker, chase, exclusive,
   glow, metallic, size, or multipack matches.
5. Keep requests on demand, sequential, cached, and reasonably rate-limited.
   Do not build a broad background crawler.
6. Keep the server's outbound-host allowlist narrow and validate protocols,
   redirects, response types, and URL lengths to prevent server-side request
   forgery.
7. Expect retailer markup and availability to change. A failed source should
   degrade gracefully and should not stop other lookup stages.

Current source responsibilities are documented in `README.md` and Settings:

- PriceCharting is the primary structured identity and condition-price guide.
- Funko is an official item-ID follow-up when an exact identifier is known.
- Amazon AU is used only from an exact product page for retailer details, image,
  identifiers, and current new price when exposed.
- eBay sold and Trade Me are identifier-aware public searches for manual
  comparison, without accounts or API keys.
- The old Kenny Chan catalog supplies useful discovery images and titles but is
  deprecated and must not be treated as current pricing or canonical identity.

For prices, preserve the original currency. Keep an active retail asking price,
a sold comparable, PriceCharting's condition guide, and Maxine's own NZD value
conceptually distinct. Never silently convert or relabel a currency.

## Interaction and design standards

- Make the requested action obvious and show confirmation after a mutation.
- Long-running work needs a visible percentage, current item, counts, elapsed
  time, safe stopping behavior, and a useful completion summary.
- Images of boxes and figures should use `object-fit: contain`; never crop away
  identifying stickers, numbers, or the bottom of a box.
- Important actions must work with keyboard navigation and have meaningful
  labels, focus behavior, loading states, empty states, and error messages.
- Verify desktop and narrow/mobile layouts. Avoid adding a desktop-only workflow.
- Follow the existing components, colours, typography, spacing, and Lucide icon
  style before introducing a new visual pattern or dependency.
- Explain uncertain data in collector language rather than exposing raw parser
  or network errors without context.

## Change workflow

1. Read this file and `README.md`, then inspect `git status`, recent history,
   and the files relevant to Maxine's request.
2. Preserve unrelated or pre-existing changes. Never discard Maxine's work with
   destructive Git commands.
3. Reproduce the issue or inspect the current UI before changing it when
   practical.
4. Implement the complete feature across types, persistence, server, UI,
   documentation, and responsive styling wherever those layers are affected.
5. Test realistic success, missing-data, failure, and low-confidence paths.
6. Rebuild `dist/`; it is committed because normal runtime must not require a
   development build.
7. Summarize the outcome, verification performed, files or commit involved, and
   the exact restart/refresh step Maxine needs.

Do not commit or push unless Maxine asks you to, or the surrounding task clearly
establishes that publishing completed changes is expected. Never force-push.

## Required verification

Run these from the repository root after code changes:

```bash
npm test
npm run build
node --check server.mjs
git diff --check
```

For a complete runtime check, use an unused port so you do not interrupt
Maxine's current app:

```bash
NO_OPEN=1 node server.mjs --host 127.0.0.1 --port 4174
```

Then open `http://127.0.0.1:4174` in a fresh browser profile. Stop that test
server when finished. If external-source parsing changed, test with a known
exact product URL and verify both the returned data and the image-preview route.

Documentation-only changes do not require a production rebuild when `src/`,
`server.mjs`, and build inputs are untouched, but `git diff --check` still does.

## Completion checklist

Before handing work back, confirm that:

- Maxine's requested outcome is actually present, not just partly scaffolded.
- Existing collection, wishlist, for-sale, Gap Finder, and backup workflows
  still behave correctly where relevant.
- The app remains local-first, container-free, and single-command startable.
- Live browser data was not reset or replaced.
- No secrets, temporary captures, downloaded pages, or test profiles were added
  to the repository.
- The production build is current after code changes.
- Tests pass, or any specific limitation is stated clearly.
- Maxine receives short, concrete instructions to see and use the improvement.
