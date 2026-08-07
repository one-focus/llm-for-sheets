# LLM for Sheets

A Google Sheets editor add-on that adds one custom function:

```
=LLM("Translate to German: hello")
=LLM("Summarise in 5 words:", A2)
=LLM("Classify sentiment", A2, "some-other-model-id")
```

Signature: `LLM(prompt, [value], [model])`. An answer that has been generated once is never
paid for twice — see [Answer cache](#answer-cache).

## Providers

Bring your own key. Keys are stored per provider in the user's own `UserProperties`, so
they follow the Google account across spreadsheets and never leave the script.

| Provider   | Wire format                  | Key                     |
| ---------- | ---------------------------- | ----------------------- |
| OpenRouter | OpenAI-compatible            | `sk-or-…`               |
| OpenAI     | OpenAI-compatible            | `sk-…`                  |
| Anthropic  | Messages API                 | `sk-ant-…`              |
| Google AI  | `generateContent`            | AI Studio key           |
| Custom     | OpenAI-compatible + base URL | DeepSeek, Groq, xAI, vLLM … |

No LangChain: Apps Script has no npm runtime and only synchronous `UrlFetchApp`, so the
three wire formats are called directly (`Providers.gs`, ~120 lines).

## Model list

No hardcoded model names anywhere, test fixtures included. The sidebar fetches the
provider's own `/models` endpoint (`fetchModels_`) and fills the dropdown from it, so a
model appears the day the provider ships it. Cached 6h per provider in the user cache;
**Reload** bypasses the cache. When the list cannot be loaded — no key yet, a custom
endpoint without `/models`, a network failure — the dropdown is replaced by a free-text
field so a model id can always be entered by hand.

Filters are ported from the extension's `packages/storage/lib/models/providerModels.ts` —
every provider mixes embeddings, TTS, whisper, image and moderation models into the same
response. OpenRouter's catalog is public, so its list loads before a key is entered;
everything else needs the key first.

`normalizeModel_()` strips a `vendor/` prefix for the native APIs — Gemini answers a
`google/…` id with `unexpected model name format` — and leaves it alone for OpenRouter and
for custom endpoints, where a slash is part of the id (`meta-llama/Llama-3-8B`).

## Sidebar actions

The sidebar reads the active sheet and finds cells whose formula calls `LLM()` — including
nested ones like `=IF(A1,LLM(B1),"")` — and reports how many exist, how many are selected,
and how many currently hold an error.

| Action            | What it does                                                                    |
| ----------------- | ------------------------------------------------------------------------------- |
| Retry errors      | Re-runs only the cells showing `#ERROR!`. Errors are never cached.               |
| Replace formulas  | Reveals **Selected cells** / **Whole sheet**, which freeze answers as static text. |
| ↻ on a counter    | Re-runs those cells against the model, ignoring stored answers.                  |

Caching is not a setting. It is always on, because a recalculation must never re-bill an
answer that already exists, and the only reason to want a fresh one is covered by the ↻ on
each counter: the whole sheet, the selection, or just the cells holding an error.

Settings autosave on change — there is no Save button. The key field shows a mask of the
stored key (`sk-o••••1f4a`); focusing it clears the field for a new key, leaving it
untouched puts the mask back. The mask is never sent as a key: the sidebar only submits a
key the user actually typed, and `saveSettings` additionally refuses any value containing
the mask character.

Sheets keeps a custom function's last result until its inputs change, so re-running one
means clearing the formula and writing it back — done one cell at a time, so an
interrupted run loses at most the cell in flight. Freezing skips cells still holding an
error: their formula is the only thing that can still produce an answer.

## System prompt

The settings field starts empty and holds only what the user writes. A constant baseline
(`BASELINE_` in `Code.gs`) is prepended to every request: plain text, no markdown, raw JSON
when JSON is asked for, answer only. Its last line is
`USER INSTRUCTIONS BELOW OVERRIDE EVERY RULE ABOVE ON CONFLICT`, so a user prompt that
contradicts the baseline wins.

The baseline is deliberately **not** part of the cache key — it never changes, so it must
never invalidate stored answers. Only the user's own text is hashed.

## Answer cache

An answer that has been generated once is never paid for twice. Two tiers, because
`CacheService` caps every entry at 6 hours:

| Tier                 | Lifetime  | Limits                          |
| -------------------- | --------- | ------------------------------- |
| `CacheService`       | 6 hours   | 100KB per entry                 |
| `DocumentProperties` | permanent | 9KB per value, 500KB per document |

Reads try the fast tier, fall back to the permanent one and re-warm the fast tier from it.
Both writes are best-effort — a full property store degrades to 6h caching rather than
turning a paid-for answer into an error.

The key is an MD5 of provider, model, thinking level, system prompt and the resolved
prompt text, so editing any of them produces a new entry and leaves the old one behind.
The store belongs to the document, inside the user's own Google account.

## Writing formulas through the Sheets API

Verified against a closed spreadsheet: a formula written with the Sheets API evaluates
server-side, no browser session needed. `PUT values/Sheet1!Z1000?valueInputOption=USER_ENTERED`
with `=LLM("…")` came back as the model's answer on the next read, 15 seconds later, with
the cell still holding the formula.

Two conditions:

- `valueInputOption` must be `USER_ENTERED`. With `RAW` the formula is stored as text and
  nothing evaluates it.
- The **spreadsheet owner** must have the add-on installed and configured. A headless
  recalculation has no viewing user, and `getUserProperties()` in a custom function reads
  the owner's store — so the owner's key and model are the ones used.

This removes the need for time-driven triggers or a Web App for API-driven sheets.

## Behaviour worth knowing

- **In a shared spreadsheet the owner pays.** Apps Script docs, custom functions:
  "`getUserProperties()` only gets the properties of the spreadsheet owner. Spreadsheet
  editors can't set user properties in a custom function." So `=LLM()` typed by an editor
  runs on the owner's key and model. Editors cannot read the key, only spend it.
- **30 second ceiling per cell.** A slower model returns `#ERROR!`. Pick a fast one for
  filled-down columns.
- Cells recalculate on open and on edit; the answer cache is what keeps that from re-billing.

## Layout

| File              | Contents                                                         |
| ----------------- | ---------------------------------------------------------------- |
| `Code.gs`         | menu, settings (UserProperties), `LLM()`                         |
| `Providers.gs`    | request builders, response parsers, retry, `llmSelfCheck()`      |
| `Sidebar.html`    | settings UI                                                      |
| `appsscript.json` | manifest and OAuth scopes                                        |
| `selfcheck.js`    | runs the assertions under node                                   |
| `assets/`         | listing icons and banner, regenerated by `assets/build.sh`       |

## Development

```bash
npm i -g @google/clasp
clasp login
cd sheets-addon
clasp create --type sheets --title "LLM for Sheets" --rootDir .
clasp push
```

`clasp create` writes `.clasp.json` with the script id — it is gitignored, each developer
creates their own. Then open the bound spreadsheet, reload it, and use
**Extensions → LLM for Sheets → Settings**.

Run `authorize` once from the editor to get the consent screen — `showSidebar` cannot do
it, because `getUi()` needs a container. Then open a spreadsheet and use
**Extensions → LLM for Sheets → Settings**.

`Cannot call SpreadsheetApp.getUi() from this context` means one of two things:

- The project is **standalone** — its editor URL is `script.google.com/home/projects/…`
  and it belongs to no spreadsheet, so opening one alongside changes nothing. Either
  develop in a bound project (`Extensions → Apps Script` from the spreadsheet itself), or
  install the standalone one through `Deploy → Test deployments → Install`.
- The project is bound but its spreadsheet is closed in every tab.

Run the checks after touching `Providers.gs` — no network, no spreadsheet, no key:

```bash
node selfcheck.js
```

The same assertions run inside Apps Script: pick `llmSelfCheck` in the editor and hit Run.

## Publishing to the Google Workspace Marketplace

Editor add-ons ship through the Marketplace only — the Chrome Web Store path is retired.
The script project must be **standalone**: "An Editor add-on is a standalone Apps Script
project". A container-bound project is the fastest way to develop but cannot be published.

1. **Attach a standard Cloud project.** Apps Script → Project Settings → Google Cloud
   Platform project → Change project. The default per-script project cannot be used for
   publishing.
2. **Configure the OAuth consent screen** in that Cloud project: External, app name,
   support email, logo, and public URLs for the privacy policy and terms — this repository
   ships both, so the raw file URLs work:
   `https://github.com/one-focus/llm-for-sheets/blob/main/PRIVACY.md` and
   `.../TERMS.md`. Enable GitHub Pages if you prefer a rendered page on your own domain.
3. **Enable the Google Workspace Marketplace SDK** — APIs & Services → Library.
4. **Deploy.** Apps Script → Deploy → New deployment → type **Add-on**. Note the version
   number; every listing update needs a new one.
5. **App Configuration** in the Marketplace SDK: visibility, the Sheets add-on extension,
   the script ID and deployment version, and the OAuth scopes from `appsscript.json`.
6. **Store Listing**: name, description, category, artwork from [`assets/`](assets) —
   icons at 32/48/96/128 and the 220×140 card banner are generated and committed; the
   1280×800 screenshots have to be captured by hand, see [assets/README.md](assets/README.md)
   — plus the support and privacy URLs.
7. **Submit for review.**

None of the three scopes in `appsscript.json` are sensitive or restricted
(`script.external_request`, `script.container.ui`, `spreadsheets.currentonly`), so no
security assessment is required — only the ordinary brand and app review.

Private (single domain) and unlisted publishing skip the review entirely and are the
fastest way to hand the add-on to real users. Before any of that, Deploy → Test
deployments → Install puts it on your own account, in every spreadsheet you open.

## Not built yet

- Range input (`=LLM(A2:A50)`) — needs `UrlFetchApp.fetchAll` to fit the 30s custom
  function budget. Fill the formula down instead.
- A "convert results to values" menu item.
- Managed keys / credits. Dropped for now: every provider is BYOK.

## Website

`site/` is a static build of `index.md`, `PRIVACY.md` and `TERMS.md`, produced by
`./site/build.sh` and committed so it can be dropped on any host — GitHub Pages is not an
option on this account, since Pages builds run on GitHub Actions and those are disabled.
Rebuild after editing any of the three sources.

## License and policies

- [MIT licence](LICENSE) — the code
- [Privacy policy](PRIVACY.md) — no server, no telemetry; prompts go only to the provider you configure
- [Terms of service](TERMS.md) — bring your own key, no warranty
