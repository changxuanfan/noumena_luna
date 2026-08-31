import { mkdtemp, readFile, stat, symlink, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmationRequiredError, SkillManager, SkillManagerError } from '../src/skill-manager.ts'
import type { RemoteSkill } from '../src/types.ts'

const remoteSkill: RemoteSkill = {
  id: 'acme/pdf-helper',
  skillId: 'pdf-helper',
  name: 'PDF Helper',
  description: 'Process PDF files.',
  source: 'acme/skills',
  installs: 1234,
  pageUrl: 'https://skills.sh/acme/pdf-helper',
  content: '# PDF Helper\n\nUse this skill for PDF files.',
  remoteRevision: 'revision-1',
}

function createManager(root: string, remote = remoteSkill) {
  return new SkillManager({
    root,
    source: {
      getSkill: vi.fn(async () => remote),
      search: vi.fn(async () => [remote]),
    },
    discover: vi.fn(),
  })
}

describe('SkillManager lifecycle', () => {
  it('installs a skill inside the DSH root and records ownership', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const manager = createManager(root)

    const installed = await manager.install(remoteSkill.id, true)

    expect(installed.id).toBe(remoteSkill.id)
    expect(installed.directory).toBe('pdf-helper')
    expect(await readFile(join(root, 'pdf-helper', 'SKILL.md'), 'utf8')).toContain('# PDF Helper')
    expect(await stat(join(root, '.noumena-luna', 'manifest.json'))).toBeTruthy()
  })

  it('requires confirmation before replacing an installed skill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const manager = createManager(root)
    await manager.install(remoteSkill.id, true)

    await expect(manager.install(remoteSkill.id, false)).rejects.toBeInstanceOf(ConfirmationRequiredError)
  })

  it('updates after confirmation and keeps the new content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const manager = createManager(root)
    await manager.install(remoteSkill.id, true)
    const updated: RemoteSkill = { ...remoteSkill, content: '# PDF Helper v2', remoteRevision: 'revision-2' }
    vi.mocked(manager.source.getSkill).mockResolvedValueOnce(updated)

    const result = await manager.update(remoteSkill.id, true)

    expect(result.hasUpdate).toBe(false)
    expect(await readFile(join(root, 'pdf-helper', 'SKILL.md'), 'utf8')).toContain('# PDF Helper v2')
  })

  it('preserves the old version when an update cannot fetch its source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const manager = createManager(root)
    await manager.install(remoteSkill.id, true)
    vi.mocked(manager.source.getSkill).mockRejectedValueOnce(
      new SkillManagerError('SOURCE_UNAVAILABLE', 'The skill source is unavailable.', 502),
    )

    await expect(manager.update(remoteSkill.id, true)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(await readFile(join(root, 'pdf-helper', 'SKILL.md'), 'utf8')).toContain('# PDF Helper')
  })

  it('requires confirmation before uninstalling and removes only the managed skill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const manager = createManager(root)
    await manager.install(remoteSkill.id, true)

    await expect(manager.uninstall(remoteSkill.id, false)).rejects.toBeInstanceOf(ConfirmationRequiredError)
    await manager.uninstall(remoteSkill.id, true)

    await expect(stat(join(root, 'pdf-helper'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await stat(root)).toBeTruthy()
  })

  it('does not overwrite an unmanaged skill directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const unmanaged = join(root, 'pdf-helper')
    await mkdir(unmanaged)
    await writeFile(join(unmanaged, 'SKILL.md'), 'user-owned')
    const manager = createManager(root)

    await expect(manager.install(remoteSkill.id, true)).rejects.toMatchObject({
      code: 'UNMANAGED_CONFLICT',
    })
    expect(await readFile(join(unmanaged, 'SKILL.md'), 'utf8')).toBe('user-owned')
  })

  it('rejects a managed target that has been replaced by a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const outside = await mkdtemp(join(tmpdir(), 'noumena-luna-outside-'))
    const manager = createManager(root)
    await manager.install(remoteSkill.id, true)
    await rm(join(root, 'pdf-helper'), { recursive: true, force: false })
    await symlink(outside, join(root, 'pdf-helper'))
    const updated: RemoteSkill = { ...remoteSkill, content: '# PDF Helper v2', remoteRevision: 'revision-2' }
    vi.mocked(manager.source.getSkill).mockResolvedValueOnce(updated)

    await expect(manager.update(remoteSkill.id, true)).rejects.toMatchObject({
      code: 'SYMLINK_OUTSIDE_SKILL_ROOT',
    })
  })

  it('rolls an update back when DSH discovery fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-'))
    const discover = vi.fn()
    const manager = new SkillManager({
      root,
      source: {
        search: async () => [remoteSkill],
        getSkill: vi.fn(async () => remoteSkill),
      },
      discover,
    })
    await manager.install(remoteSkill.id, true)
    discover.mockRejectedValueOnce(new Error('discovery failed'))
    const updated: RemoteSkill = { ...remoteSkill, content: '# PDF Helper v2', remoteRevision: 'revision-2' }
    vi.mocked(manager.source.getSkill).mockResolvedValueOnce(updated)

    await expect(manager.update(remoteSkill.id, true)).rejects.toThrow('discovery failed')
    expect(await readFile(join(root, 'pdf-helper', 'SKILL.md'), 'utf8')).toContain('# PDF Helper')
  })
})
