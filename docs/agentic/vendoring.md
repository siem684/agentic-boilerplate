# External components (BMAD, graphify)

BMAD and graphify are owned by upstream. The template does not ship their files. It pins the versions it was tested with in `vendor.json` and records how to install each one.

Why not copy the files in: BMAD's installer writes project-specific config, so a "clean" copy is not clean, and graphify has no confirmed upstream yet. Copies would also add many files to every diff.

| Command | Effect |
|---|---|
| `node scripts/vendor.mjs list` | Show components, pinned version and source. |
| `node scripts/vendor.mjs verify` | Compare the installed version (read from the file in `detect`) with the pin. Exit 1 if missing or different, and print the install command. |

To see whether a newer version exists upstream, run `node scripts/staleness.mjs` (needs the network; it also covers the template and the GitHub Actions).

`vendor.mjs` is read-only and offline. A human runs the install command, commits the result in the spawned project, and changes the pin in `vendor.json` when upgrading. Customisations of BMAD go in `_bmad/custom`. The agent must not install or upgrade (see ADR 0004 and `CLAUDE.md`).
