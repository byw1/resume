# Art for the landing page

Every product picture on hired.tools is drawn in HTML — a rebuild of the real screen using
the app's own tokens. That is deliberate: the page is complete with this folder empty, and
a rebuild never goes stale against a screenshot taken three releases ago.

When you want a real screenshot or a clip instead, drop a file in here named after its
slot. `motion.js` looks for it on load and, only if it loads, puts it on top of the
rebuild. There is no markup to edit and nothing to remove — a missing file is not a broken
image, it is the drawing you already have.

## The slots

Add `?slots` to the URL — `https://hired.tools/?slots` — and every slot on the page outlines
itself and prints its name in the corner. That is the authoritative list. As of now:

| File                          | What it replaces                        | Shape       |
| ----------------------------- | --------------------------------------- | ----------- |
| `hero-resume.png`             | The resume beside the hero transcript    | 4:5 portrait |
| `brain-role.png`              | A role open in the brain                 | 16:10        |
| `resume-editor.png`           | The split-pane resume editor             | 16:10        |
| `pipeline-board.png`          | The pipeline board                       | 16:10        |
| `crm-companies.png`           | The companies table                      | 16:10        |
| `dashboard-diagnosis.png`     | The diagnosis card on the dashboard      | wide, ~3:1   |

## Taking them

- Shoot in **dark mode** at **1440 × 900** or wider, at 2× device pixel ratio. The page is
  dressed in the app's dark theme; a light screenshot will look like a different product.
- Include the window chrome only if you are replacing a slot that already draws it — the
  slots inside a `.frame` already have a title bar above them, so shoot the app's own
  viewport and nothing else.
- Use real-looking but not real data. Nothing on this page may show someone's actual
  employers, salary or contact details.
- Save as PNG. If you have a 2× version, name it `<slot>@2x.png` and it is picked up
  automatically alongside the 1× file.

## Video

A slot marked `data-media="video"` looks for `<slot>.mp4` instead. Keep clips under about
six seconds, silent, and encoded so the first frame is worth looking at — they play muted
and loop, and anyone who has asked their system to calm down gets a paused clip with
controls rather than motion.

## The share card

`site/og.png` is the 1200×630 image that appears when the link is pasted anywhere. It is
rendered from `og-source.html` in this folder — open that file at exactly 1200×630 and
screenshot it, or:

```bash
npx playwright screenshot --viewport-size=1200,630 \
  site/media/og-source.html site/og.png
```

Change the headline there and re-render; do not edit the PNG.
