# Issue tracker

## System

Issues for this repository live in
[`changxuanfan/noumena_luna`](https://github.com/changxuanfan/noumena_luna)'s
GitHub Issues. Use the `gh` CLI for issue creation, updates, labels, and
queries.

## Workflow

Create one issue for each independently reviewable slice. Include:

- context and user-visible outcome;
- explicit acceptance criteria;
- non-goals and risks;
- dependencies on other issues when present.

Implement an issue on a focused branch, open a pull request that includes
`Closes #<issue-number>`, and record the relevant check commands and results in
the pull request description. Keep commits focused enough that the Issue →
branch → commit → pull request relationship is easy to review.

Pull requests are not an external request queue for triage; they are the
delivery surface for work already planned in this repository.
