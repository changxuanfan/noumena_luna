# DSH Skill Manager

`noumena-luna` is a DeepSeek Harness (DSH) plugin that adds a **DSH Skill
Manager** page to WebUI Settings. It searches the public
[skills.sh](https://www.skills.sh/) directory, shows skill metadata, and lets a
user confirm installation, update, and removal of skills managed by the plugin.

## Install from GitHub

```bash
dsh plugin --profile web add github:changxuanfan/noumena_luna
```

Restart the Web profile after installing a bundle plugin:

```bash
dsh --profile web
```

The plugin then appears at **Settings → DSH Skill Manager**.

## Features

- Keyword search against the `skills.sh` search endpoint.
- Skill name, description, source, install count, and `skills.sh` page link.
- Confirmed installation into the DSH skill directory.
- A local list containing only skills installed and recorded by this plugin.
- Content-hash update checks and confirmed updates.
- Confirmed uninstall with rollback if the local state update fails.
- Loading, empty-result, network/source, duplicate, and update failure states.
- Root-constrained filesystem operations, archive-entry validation helpers, and
  symlink protection.

## Data-source boundary

Runtime online reads are limited to `https://skills.sh/`:

1. Search metadata comes from `https://skills.sh/api/search`.
2. Descriptions, install counts, and the displayed `SKILL.md` body come from
   the corresponding `skills.sh` page.
3. The plugin does not clone, fetch, or fall back to a skill's GitHub source.

The public skills.sh page currently exposes the rendered `SKILL.md` document,
not a stable public multi-file download API. Version 0.1 installs that
document. Additional repository files are intentionally not fetched from
GitHub.

## Safety model

All managed state stays under:

```text
$DSH_HOME/skills/
├── <skill-name>/SKILL.md
└── .noumena-luna/manifest.json
```

The plugin:

- accepts skill identifiers rather than arbitrary local paths;
- rejects absolute paths, parent traversal, unsafe skill names, and unsafe
  archive entries;
- rejects managed targets that become symbolic links;
- stages content inside the DSH skill root before an atomic replacement;
- keeps the previous version when an update or discovery step fails; and
- requires an explicit `confirmed: true` operation from the UI/API for every
  mutation.

The plugin does not modify DSH source code.

## Development

```bash
npm install
npm run type-check
npm test
npm run build
# or all three checks in one command:
npm run check
```

The test suite uses mocked skills.sh responses and temporary DSH skill roots.
It covers installation, duplicate confirmation, updates, update rollback,
uninstall, network/source failures, and path/symlink safety.

## Project workflow

Development decisions and acceptance criteria are recorded in the repository's
[GitHub Issues](https://github.com/changxuanfan/noumena_luna/issues). Feature
work is submitted through branches and pull requests. See
[`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) for the
repository workflow.

## Demo video

The final 3–6 minute demo should show:

1. GitHub installation and the WebUI Settings entry.
2. A `skills.sh` search and the required metadata.
3. Confirmed installation and the managed local list.
4. Update checking, confirmed update, and confirmed uninstall.
5. `npm run check` passing.

Video link: **to be added after recording**.
