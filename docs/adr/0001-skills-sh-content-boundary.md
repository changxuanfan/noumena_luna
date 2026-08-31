# ADR 0001: Keep runtime skill content on skills.sh

- Status: accepted
- Date: 2026-08-31

## Decision

The plugin uses `https://skills.sh/api/search` for search metadata and the
corresponding `https://skills.sh/<skill-id>` page for descriptions, install
counts, and the rendered `SKILL.md` body. It does not clone or fetch the
GitHub repository shown as a skill source.

The first release installs the page's `SKILL.md` document. Additional files
from a backing repository are outside the public skills.sh page contract and
are not fetched through another online source.

## Why

The task restricts runtime online data to skills.sh. Following a source
repository link would make GitHub an additional runtime data source and would
make redirects and repository changes part of the plugin's trust boundary.
Manual redirects are followed only to skills.sh's `www` host.

## Consequences

- A search can still show the source repository as metadata returned by
  skills.sh.
- A page without a usable description or `SKILL.md` is reported as invalid.
- Skills whose final name is not valid DSH kebab-case remain visible but are
  marked unavailable for installation.
- A future multi-file release needs an explicit skills.sh-supported content
  contract before it can expand the installed document.
