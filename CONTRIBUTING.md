# Contributing realms

Start with the [creator guide](docs/realms.md) and optional
[creator skill](skills/pixel-worlds-creator/SKILL.md).

## Share a downloadable realm

Use the [realm submission form](https://github.com/cygnostik/pd-pixel-worlds/issues/new?template=realm-submission.yml)
or submit a pull request. Include:

- a `.pwrealm.json` data package and a short description;
- a screenshot using the demonstration crew;
- author credit, asset provenance and explicit redistribution licenses;
- proof that import, restart, selection, narrow layout and both views work;
- working, idle, waiting, error and completion examples.

Directory submissions are reviewed before they appear in the
[realm gallery](realms/README.md). A contribution PR should add its package,
demonstration screenshot and gallery/catalog entry together. New source-level
character styles or procedural animation require a normal plugin code review and
release; packages cannot load executable code.

Do not include private sessions, agent output, credentials, hostnames, user home
paths, unlicensed screenshots or development logs. New realms must not change the
runtime's interpretation of agent activity.

## Code changes

Run `npm ci`, `npm test`, `npm run build`, `npx playwright install chromium`,
`npm run test:browser`, `npm run test:display` and `npm run test:realms`.
Rebuild both committed desktop bundles when source changes. Keep generated media
limited to demonstrative data and verify the downloaded release, not just a source
preview.
