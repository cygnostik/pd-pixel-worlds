# Security

Pixel Worlds observes metadata already available through the Hermes Desktop SDK.
It does not upload telemetry, store message bodies or run jobs. Preferences are
stored through plugin-scoped host storage. Agent observation is kept in memory.
The optional preview binds to 127.0.0.1 and serves only its bundled fixture files.

The installed plugin runs with the privileges Hermes gives desktop plugins.
Review code before installing a third-party realm. Executable realm imports and
an automatic download system are not part of this release.

For a security issue, use GitHub private vulnerability reporting if enabled on
this repository. Do not post secrets or private session data in a public issue.
