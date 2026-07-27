# Maxine's Pop Tracker

A local-first Funko Pop collection tracker built for Maxine. It imports her
existing workbook, adds catalog-assisted images, and keeps collection, wishlist,
selling, gap-finding, and valuation workflows together in one comic-inspired
app.

## Start it

The production build is committed to this repository, so running the tracker
does not require installing the development dependencies.

### Windows

1. Install the current [Node.js LTS](https://nodejs.org/) if it is not already
   installed.
2. Double-click `start.bat`.
3. The tracker opens at `http://127.0.0.1:4173`.

When `start.bat` is opened from an SMB/network drive, Windows may show an “Open
File – Security Warning”. If this is your trusted share and this repository is
the expected copy, choose **Run**. This mode starts Node on the Windows PC, and
the command window must remain open while the tracker is in use.

### Run centrally on Spock (recommended for the SMB share)

From a shell on Spock:

```bash
./start.sh
```

The Linux launcher listens on the LAN. Leave that process running, then open
`http://spock.lan:4173` from Windows or another device on the same network.

### Local macOS or Linux

With Node.js 22.12 or newer installed:

```bash
npm start
```

`npm start` listens only on the local computer by default. Set `NO_OPEN=1` to
prevent it from opening a browser automatically, set `PORT` to use a different
port, or run `node server.mjs --host 0.0.0.0` to make it reachable on the LAN.

## What is included

- 919 collection records / 956 physical Pops from the Marvel and Others sheets.
- 146 entries from `ones to collect`.
- 320 entries from `Ones for sale`.
- Suggested product images matched against
  [`kennymkchan/funko-pop-data`](https://github.com/kennymkchan/funko-pop-data).
- Search, category/series filters, favourites, condition, shelf location, notes,
  quantity, and custom image editing.
- Per-Pop cost, estimated value, asking price, valuation source, and date.
- Collection-level recorded value, cost, paper gain/loss, and valuation coverage.
- Trade Me, eBay sold, and PriceCharting research links on every record.
- Optional connected active-listing searches for eBay and Trade Me.
- Number-run gap finder and an unowned-candidate catalog explorer.
- Full JSON backup/restore and CSV export.
- Browser-local persistence: no database or hosted account is required.

The app intentionally ignores `Movie order for shelves`, `Sheet5`, and the
archival/working sheets. The original Soda sheet is also outside the two
requested collection categories.

## Valuation and marketplace connections

The app starts with no invented values. Open a Pop, check comparable listings,
and record an estimate with its source. Collection totals include only records
that have an amount entered.

- **PriceCharting:** public search links work immediately. PriceCharting added
  Funko tracking in 2024, including boxed/out-of-box prices and sales history,
  but direct API access is paid. The tracker does not scrape it.
- **eBay:** public sold-search links work immediately. Optional production App
  ID / Cert ID credentials enable the official Browse API for current listings.
  Those are asking prices, not verified sale prices. eBay's sold-history API is
  limited release.
- **Trade Me:** public search links work immediately. An approved app's Consumer
  Key / Secret enables official NZD listing search. Trade Me member connection
  uses their OAuth 1.0a redirect flow and never asks for a Trade Me password.
  Since 10 April 2026, new Marketplace API app registration is restricted to
  in-trade sellers; existing approved apps may still be configured.

Credentials entered under **Settings & connections** are handled by the local
Node server and stored in `data/local-connections.json`. That plaintext local
file is excluded from Git, and saved secrets are never returned to browser code.
Protect the Windows account/app folder and back up credentials separately;
tracker JSON backups intentionally do not include them.

Changing the display currency relabels amounts but does not convert them. Check
the currency of any comparable listing before recording its value.

## Data and image caveats

The Kenny Chan catalog is MIT-licensed and contains useful titles, series tags,
and image links, but its data was last updated on 3 January 2021 and the project
is now deprecated. It does not contain box numbers or prices. Suggested matches
are visibly marked and can be replaced with a custom image URL.

Some old hobbyDB image links reject direct hotlinking. The optional image helper
uses the open-source [wsrv.nl image service](https://wsrv.nl/) to display those
suggestions. Turn it off in Settings if desired; placeholders remain available.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and license
details. Product names and trademarks belong to their owners. This personal app
is not affiliated with Funko, Marvel, hobbyDB, PriceCharting, Trade Me, or eBay.

## Development

```bash
npm install
npm run dev
```

The Vite development server serves the UI. Marketplace API routes are provided
by the production Node server, so use this when testing the complete app:

```bash
npm run build
NO_OPEN=1 npm start
```

Useful checks:

```bash
npm run typecheck
npm run build
node --check server.mjs
```

## Re-importing a workbook

The checked-in seed data is ready to use; Python is not required at runtime.
To regenerate it, clone/download the Kenny Chan data and run:

```bash
python3 scripts/import_workbook.py \
  --workbook "/path/to/Pop collection.xlsx" \
  --catalog "/path/to/funko-pop-data/funko_pop.json"
npm run build
```

The importer uses only Python's standard library and explicitly routes the four
requested sheets. Review the generated suggestions before treating any catalog
image as an exact variant match.
