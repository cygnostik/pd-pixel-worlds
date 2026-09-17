# Contributing realms

Start with [the realm authoring guide](docs/realms.md) and the optional
[creator skill](skills/pixel-worlds-creator/SKILL.md).

Open an issue to discuss a scene, or submit a pull request with:

- a short description and screenshot using the demonstration crew;
- source files and an explicit license/asset provenance statement;
- working, idle, waiting, error and completion examples;
- selection, capacity, small-layout and reduced-motion checks;
- passing unit and browser tests.

Do not include private sessions, agent output, credentials, hostnames, user home
paths, licensed screenshots or development logs. Keep contributions scoped; new
realms must not change the runtime's interpretation of agent activity.

For this alpha, submissions are reviewed source-code pull requests. A realm is
executable JavaScript, not a sandboxed wallpaper. There is no automatic installation
of unreviewed user code or online marketplace yet.

Run `npm ci`, `npm test`, `npm run build`, `npx playwright install chromium`,
`npm run test:browser` and `npm run test:display` before submitting. Rebuild the
committed `plugin.js` when source changes.
