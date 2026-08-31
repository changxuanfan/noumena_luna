# Repository guidance

This repository contains the `noumena-luna` DSH plugin. Keep runtime skill
content reads on `skills.sh`, keep mutations below `$DSH_HOME/skills`, and run
the repository checks before opening a pull request.

## Agent skills

### Issue tracker

Issues live in the GitHub Issues tracker for
`changxuanfan/noumena_luna`; use `gh issue` for issue operations. See
`docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical labels `needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, and `wontfix` when triage is needed. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. Domain decisions are kept in
`docs/adr/` and the project rules in `docs/agents/`. See
`docs/agents/domain.md`.
