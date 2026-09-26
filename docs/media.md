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
- `images/catalog-banner.png`: catalog graphic, 1440 × 720.
- `images/social-preview.png`: repository share card, 1280 × 640, under 1 MB.
- `images/*-scene.png`: full scene artwork, 960 × 600, without interface chrome.
- `images/tng-ship-feature.png`: promotional 50/50 Bridge–Engineering composite,
  960 × 600, also used for the TNG card in the hero, catalog and social graphics.
- Individual world screenshots, plus `display-mode.png` and `pw-agents.png`:
  real application views with demonstration disclosures.

The TNG screenshots show the current main-branch candidate. Tagged releases
may contain earlier art. Imported TNG packages are static bridge scenes; the
built-in ship also includes Main Engineering.

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

The script checks browser errors, image dimensions, layout collisions and the
social-card size. Inspect the generated images before committing them. A file
in this directory does not change GitHub's uploaded social-preview setting;
that is a separate repository setting, not an automatic effect of a Git push.
