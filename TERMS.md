# Terms of Service

**Effective date:** 7 August 2026
**Add-on:** LLM for Sheets
**Maintainer:** Alex Kardash — kardash.by@gmail.com

## 1. What this is

LLM for Sheets is a free, open-source Google Sheets add-on that adds an `=LLM()` formula.
It is distributed under the [MIT licence](LICENSE), which governs the software itself;
these terms govern your use of the published add-on.

By installing or using the add-on, you accept these terms. If you do not accept them, do
not install it.

## 2. You bring your own key

The add-on ships with no credits, no included usage, and no account. You supply an API key
for a provider of your choosing, and you deal with that provider directly.

You are responsible for:

- every charge the provider bills against your key, including charges caused by formulas
  recalculating, by regeneration, or by mistake;
- keeping your key confidential and revoking it if exposed;
- complying with that provider's terms and usage policies.

The maintainer never sees your key, cannot see your spend, and cannot refund it.

## 3. Costs are yours to control

Google Sheets recalculates custom functions when a file is opened and when referenced
cells change. The add-on caches answers so a repeat prompt is not paid for twice, and the
sidebar can freeze answers into static values, but no cache is a guarantee. Watch your
provider's usage dashboard, and set a spend limit there if the provider offers one.

## 4. The model's output

Answers come from a third-party model, not from the maintainer. They may be wrong,
outdated, biased, or fabricated. Do not rely on them for legal, medical, financial, or
other consequential decisions without checking them yourself. You are responsible for
whatever you do with the output, and for the prompts you send.

## 5. No warranty

The add-on is provided "as is", without warranty of any kind, express or implied,
including merchantability, fitness for a particular purpose, and non-infringement. There
is no uptime commitment, no support commitment, and no guarantee that it will keep working
— it depends on Google Apps Script and on provider APIs, both of which can change or
disappear without notice.

## 6. Limitation of liability

To the maximum extent permitted by law, the maintainer is not liable for any indirect,
incidental, special, or consequential damages, nor for lost profits, lost data, or API
charges, arising from the use of or inability to use the add-on — even if advised of the
possibility. Since the add-on is free, total liability is zero.

Some jurisdictions do not allow these exclusions; where that is the case, they apply only
as far as the law permits.

## 7. Privacy

See [PRIVACY.md](PRIVACY.md). In short: the add-on has no server, and your data goes only
to the provider you configure.

## 8. Changes and termination

These terms may change; the effective date above will be updated and the change recorded
in the repository history. Continued use after a change means acceptance. You may stop
using the add-on at any time by uninstalling it. The maintainer may stop publishing or
maintaining it at any time — the source stays available under the MIT licence, so anyone
can keep running their own copy.

## 9. Contact

kardash.by@gmail.com
