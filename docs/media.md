# Repository graphics

Regenerate the graphics from the current application:

```sh
npm run build
node scripts/capture-repo-media.mjs
```

The capture runs the isolated browser preview with reduced motion and the
product's built-in demonstration crew. Network requests are restricted to that
loopback preview. It does not connect to a Hermes gateway or load live sessions.

## Outputs

- `images/starter-realms.png`: README hero, 1440 × 720.
- `images/catalog-banner.png`: dedicated crop-safe catalog composition, 1440 × 720.
- `images/social-preview.png`: repository share card, 1280 × 640, under 1 MB.
- `images/*-scene.png`: full scene artwork, 960 × 600, without interface chrome.
- `images/tng-ship-feature.png`: promotional 50/50 Bridge–Engineering composite,
  960 × 600, also used for the TNG card in the hero, catalog and social graphics.
- Individual world screenshots, plus `display-mode.png` and `pw-agents.png`:
  real application views with demonstration disclosures.

The TNG screenshots show the current main-branch candidate. Tagged releases
may contain earlier art. Imported TNG packages are static bridge scenes; the
built-in ship also includes Main Engineering.

## Catalog fit and regeneration

The catalog card and plugin detail-page header use the same `image` URL, but
different frames. The card is 2:1. The current detail header uses `width: 100%`,
`max-height: 360px` and centered `object-fit: cover`. On a wide page its measured
image content box is 1134 × 359 (plus a 1px bottom border). A 1440 × 720 source
therefore retains only approximately y=132–588. Resizing to another 2:1 image
does not restore the cropped title.

`scripts/compose-catalog-media.mjs` owns the catalog layout separately from the
README and social layouts. It reads the existing scene captures and TNG
composite, keeping the title, benefit, demonstration disclosure, scene artwork
and captions inside the intersection of the card and detail crops, with a 24px
source-image margin. The current computed safe bounds are approximately
x=24–1416, y=156–564; the composition uses a narrower central column.
Decorative lines outside this region may be cropped. Do not copy the full
README poster back over this export.

To recompose only the catalog image without rebuilding the application or
changing the other graphics:

```sh
npm run media:catalog
npm run test:media
```

The full capture command above also calls this composer after refreshing its
scene inputs. `test:media` checks the crop calculation and rejects critical
content outside the safe area, then renders the actual composition without
writing an image. No gateway, real sessions or external images are used.

Before approving changed artwork, compare the source with the actual catalog
card and plugin page at wide, tablet and narrow widths in both themes. Check
small-card title/detail legibility as well as image bounds. A narrow page's
horizontal overflow is a separate website defect, not something to hide by
moving artwork. Remeasure the destination fixtures if upstream CSS changes:

- [Catalog authoring documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugin-catalog#whats-in-an-entry)
- [Detail-page CSS](https://github.com/NousResearch/hermes-agent/blob/main/website/src/components/PluginCatalog/pages.module.css)
- [Card CSS](https://github.com/NousResearch/hermes-agent/blob/main/website/src/pages/plugins/styles.module.css)

Gallery thumbnails use a separate 16:10 cover crop. README images preserve
their source ratio. GitHub's uploaded Social preview is another independent
destination; neither this composer nor a Git push changes that setting.

Local generation does not update the public listing. After publication
approval, commit the source and assets, update the catalog's reviewed pin and
its pinned image URL through the normal review process, then inspect the live
page again. Do not replace a reviewed image through a mutable branch URL.

## Treatment and attribution

The editorial frame uses a dark field, warm white type, restrained amber and
monospaced labels. Standalone scene captures remain unfiltered. Typography uses system
Courier New and Arial fallbacks; no proprietary fonts or external brand marks
are bundled. Pixel Worlds is a community Hermes plugin by ProDyn, not an
official Nous Research product. Original art and third-party-property boundaries
are described in [NOTICE.md](../NOTICE.md).

### TNG feature composite

`scripts/compose-tng-feature.mjs` uses the left half of the Bridge capture and
the right half of Engineering without squeezing either room. A thin blue
transporter beam covers the center seam, with a slight flare at each end.
The exact supplied metallic title reads **Added: Main Engineering!**, with
blue pixel-block decay around its edges. A localized bottom gradient and
title shadow improve contrast. This is promotional artwork, not a live UI.

The title and beam were supplied by Chris as `image_b45a0b.png` and
`image_720182.png`. Their cropped, black-background-removed PNG derivatives
are retained in `scripts/media-assets/`; they are supplied artwork rather
than output of the procedural scene renderer. No font file is bundled.
The title matte ramps from transparent at channel maximum 5 to opaque at 30;
the beam uses brightness as alpha, with RGB unpremultiplied to preserve glow.

The main capture script rebuilds the composite automatically. To recomposite
existing scene captures only, run `node scripts/compose-tng-feature.mjs`.

The scripts check browser errors, image dimensions, layout collisions,
catalog critical-content bounds and the social-card size. Inspect the generated
images before committing them. A file
in this directory does not change GitHub's uploaded social-preview setting;
that is a separate repository setting, not an automatic effect of a Git push.
