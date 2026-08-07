---
layout: default
title: LLM for Sheets
---

# LLM for Sheets

**LLM for Sheets is a Google Sheets add-on.** It adds one spreadsheet formula, `=LLM()`, so
you can ask an AI model a question from inside a cell and get the answer written into that
cell.

It is for anyone who already works in Google Sheets and wants a model to handle a column of
repetitive text work — translating, summarising, classifying, rewriting, extracting fields —
without exporting the data anywhere or copying answers back by hand.

```
=LLM("Write a tagline for an ice cream shop")
=LLM("Translate to German:", A2)
=LLM("Summarise in 5 words:", A2, "gemini-3.6-flash")
```

![LLM for Sheets running in Google Sheets](assets/screenshot-1.png)

## How the add-on uses your Google account data

- **It reads the spreadsheet you have open.** The formulas and the cells they reference are
  read so the prompt can be assembled, and the model's answer is written back into the
  cell. The add-on requests `spreadsheets.currentonly`, so it can only touch the file
  currently open — never anything else in your Google Drive.
- **It shows a sidebar** inside Google Sheets where you choose a provider, store your API
  key, and pick a model.
- **It sends your prompt to the AI provider you chose** — OpenRouter, OpenAI, Anthropic,
  Google AI, or any OpenAI-compatible endpoint — authenticated with your own API key.
- **Nothing is sent to the developer.** LLM for Sheets has no server, no analytics, and no
  account system. Your API key is stored in your own Apps Script user properties and is
  never transmitted anywhere except to the provider you configured.

Full details are in the [privacy policy](privacy/).

## Bring your own key

There is no subscription and no credits. You connect your own provider account and pay that
provider directly at cost.

## It does not bill you twice

Google Sheets recalculates formulas when a file is opened, when rows are added, when a
column is sorted. Every answer is cached against its document, so none of that costs a
second request. When you do want a fresh answer, one click regenerates the whole sheet, the
current selection, or only the cells that returned an error.

## The model list is live

Models are fetched from your provider's own catalogue, so a new one becomes available the
day the provider ships it. Nothing is hardcoded in the add-on.

## Open source

LLM for Sheets is MIT licensed. Every statement on this page can be checked against the
source, which is four files long.

[Source code](https://github.com/one-focus/llm-for-sheets) ·
[Privacy policy](privacy/) ·
[Terms of service](terms/)

Contact: kardash.by@gmail.com
