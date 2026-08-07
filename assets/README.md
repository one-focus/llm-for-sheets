# Listing artwork

Sources are the two SVGs; the PNGs are generated. Edit an SVG, then:

```bash
./assets/build.sh
```

Headless Chrome does the rasterising — macOS ships no SVG converter, and Chrome is already
there.

## What the Marketplace asks for

| Asset             | Size                            | Status   | File                    |
| ----------------- | ------------------------------- | -------- | ----------------------- |
| Application icon  | 32×32, 48×48, 96×96, 128×128    | ready    | `icon-*.png`            |
| Card banner       | 220×140                         | ready    | `banner-220x140.png`    |
| Screenshot        | 1280×800                        | ready    | `screenshot-1.png`      |

At least one screenshot is required, ten at most. They must be full bleed — square corners,
no padding, no mockup frame — and must show the add-on working inside Google Sheets.

## Taking the screenshots

`build.sh` writes a blank canvas at the right size only when the file is missing, so the
capture below survives every later run. Duplicate it if you ever want more shots.

They cannot be generated: a listing screenshot has to be a real capture of the add-on
running in a spreadsheet. On macOS, capture a 1280×800 region and a Retina display gives
you 2560×1600, which the Marketplace accepts as-is:

```bash
screencapture -R 0,0,1280,800 assets/screenshot-1.png
sips -g pixelWidth -g pixelHeight assets/screenshot-1.png   # expect 2560 x 1600
```

Worth capturing, in this order:

1. **The add-on doing its job.** A column of answers already filled in, the sidebar open on
   the right. This is the one that sells it — a reviewer wants to see Sheets, not a floating
   panel.
2. **A formula being written.** `=LLM("Translate to German:", A2)` visible in the formula
   bar, with the source column beside it.
3. **The sidebar in detail.** Model Settings expanded on a provider and model, Formulas
   Overview showing real counts.

Before capturing: put plausible data in the sheet, not `test` and `123`. Reviewers read the
screenshots, and so does everyone deciding whether to install.
