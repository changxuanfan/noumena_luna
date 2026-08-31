# Domain documentation layout

This repository uses a single-context layout:

- project-wide domain vocabulary belongs in `CONTEXT.md` when the vocabulary
  becomes large enough to need a durable glossary;
- irreversible design decisions belong in `docs/adr/`;
- development-process configuration belongs in `docs/agents/`.

The current implementation vocabulary is intentionally small: a **remote
skill** is the validated `skills.sh` representation, a **managed skill** is a
skill recorded in `.noumena-luna/manifest.json`, and the **DSH skill root** is
`dshHomePath('skills')`.
