# Privacy Policy

**Effective date:** 7 August 2026
**Add-on:** LLM for Sheets
**Maintainer:** Alex Kardash — kardash.by@gmail.com

## Short version

LLM for Sheets has no server. Nothing is sent to the maintainer, and there is nowhere for
it to be sent: the add-on runs entirely inside your Google account and talks only to the
AI provider you configure, using the API key you supply.

## What the add-on handles

**Your API keys.** Stored in your own Apps Script `UserProperties`, inside your Google
account. They are attached to a request only when calling the provider you selected. They
are never sent anywhere else, never logged, and the maintainer has no way to read them.
The settings sidebar displays only a mask (`sk-o••••1f4a`), never the key itself.

**Your prompts.** When a `=LLM()` formula runs, the text of that formula — including the
contents of any cells it references — is sent to the AI provider you chose: OpenRouter,
OpenAI, Anthropic, Google AI, or the custom endpoint you entered. That provider's own
privacy policy governs what happens to it from there. Choosing a provider is choosing who
sees your spreadsheet data.

**The answers.** Cached inside your document (Apps Script `DocumentProperties` and
`CacheService`) so that a recalculation does not pay for the same prompt twice. This
storage lives in your Google account. The cache can be flushed by regenerating cells from
the sidebar.

**Your settings.** Provider, model, thinking level and system prompt, in `UserProperties`
alongside the keys.

## What the add-on does not do

- No analytics, no telemetry, no crash reporting, no usage statistics.
- No server operated by the maintainer, and therefore no logs, accounts, or databases.
- No sale, sharing, or transfer of your data to anyone. The only outbound request goes to
  the AI provider you configured.
- No advertising, and no use of your data to train any model. What the provider does is
  governed by its own terms.

## Permissions the add-on asks for

| Scope                         | Why                                                          |
| ----------------------------- | ------------------------------------------------------------ |
| `script.external_request`     | to call the AI provider's API                                  |
| `spreadsheets.currentonly`    | to read formulas in the open spreadsheet and write answers back |
| `script.container.ui`         | to show the settings sidebar                                   |

`spreadsheets.currentonly` is deliberately narrower than full spreadsheet access: the
add-on can only touch the file you have open, never the rest of your Drive.

## Google user data

LLM for Sheets' use of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

## Sharing a spreadsheet

A custom function runs with the settings of the **spreadsheet owner** — that is how Google
Sheets works, not a choice made here. If you share a file, an editor who types `=LLM()`
spends the owner's API key. They cannot read the key itself.

## Retention and deletion

Everything the add-on stores lives in your Google account: settings under your user
properties, cached answers under the document. Uninstalling the add-on ends its access.
To remove cached answers first, use the regenerate controls in the sidebar, or delete the
spreadsheet.

## Source code

The add-on is open source under the MIT licence:
<https://github.com/one-focus/llm-for-sheets>. Every claim above can be checked against the
code — there are four files.

## Changes

Material changes to this policy will be published in the repository, with the effective
date above updated. The commit history is the change log.

## Contact

kardash.by@gmail.com
