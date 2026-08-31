import { createHash, randomUUID } from 'node:crypto'
import {
  access,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import {
  assertExistingPathContained,
  assertNotSymbolicLink,
  assertSafeSkillDirectoryName,
  PathSafetyError,
  resolveContainedPath,
} from './path-safety.ts'
import type { ManagedSkill, RemoteSkill, UpdateCheck } from './types.ts'

const MANIFEST_VERSION = 1
const METADATA_DIRECTORY = '.noumena-luna'
const MANIFEST_FILE = 'manifest.json'
const SKILL_FILE = 'SKILL.md'

export interface SkillSource {
  search(query: string): Promise<readonly RemoteSkill[]>
  getSkill(id: string): Promise<RemoteSkill>
}

export interface SkillManagerOptions {
  root: string
  source: SkillSource
  discover?: () => void | Promise<void>
}

interface ManagedRecord extends Omit<ManagedSkill, 'exists'> {}

interface Manifest {
  version: typeof MANIFEST_VERSION
  skills: Record<string, ManagedRecord>
}

export type SkillManagerErrorCode =
  | 'CONFIRMATION_REQUIRED'
  | 'INVALID_SKILL_ID'
  | 'INVALID_REMOTE_SKILL'
  | 'SOURCE_UNAVAILABLE'
  | 'UNMANAGED_CONFLICT'
  | 'STATE_CORRUPT'
  | 'NOT_MANAGED'
  | 'LOCAL_SKILL_MISSING'
  | 'ROLLBACK_FAILED'
  | 'OPERATION_FAILED'

export class SkillManagerError extends Error {
  constructor(
    readonly code: SkillManagerErrorCode,
    message: string,
    readonly status = 400,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SkillManagerError'
  }

}

export class ConfirmationRequiredError extends SkillManagerError {
  constructor(action: 'install' | 'replace' | 'update' | 'uninstall' = 'install') {
    super(
      'CONFIRMATION_REQUIRED',
      `Confirmation is required before ${action}ing a managed skill.`,
      409,
    )
    this.name = 'ConfirmationRequiredError'
  }
}

export class SkillManager {
  readonly root: string
  readonly source: SkillSource
  private readonly discover: () => void | Promise<void>

  constructor(options: SkillManagerOptions) {
    this.root = options.root
    this.source = options.source
    this.discover = options.discover ?? (() => {})
  }

  async search(query: string): Promise<readonly RemoteSkill[]> {
    return this.source.search(query)
  }

  async listInstalled(): Promise<readonly ManagedSkill[]> {
    const manifest = await this.readManifest()
    const skills = await Promise.all(Object.values(manifest.skills).map(async record => ({
      ...record,
      exists: await this.managedPathExists(resolveContainedPath(this.root, record.directory)),
    })))
    return skills.sort((left, right) => left.name.localeCompare(right.name))
  }

  async install(id: string, confirmed: boolean): Promise<ManagedSkill> {
    validateSkillId(id)
    const manifest = await this.readManifest()
    const existing = manifest.skills[id]
    if (!confirmed) {
      throw new ConfirmationRequiredError(existing === undefined ? 'install' : 'replace')
    }

    const remote = await this.loadRemote(id)
    const directory = existing?.directory ?? directoryFor(remote)
    const target = resolveContainedPath(this.root, directory)
    const targetExists = await this.pathExists(target)
    if (targetExists && existing === undefined) {
      throw new SkillManagerError(
        'UNMANAGED_CONFLICT',
        'A skill directory with this name exists but is not managed by this plugin.',
        409,
      )
    }
    if (existing !== undefined && targetExists) await this.assertManagedTarget(target)

    const now = new Date().toISOString()
    const record: ManagedRecord = {
      id: remote.id,
      skillId: remote.skillId,
      name: remote.name,
      description: remote.description,
      source: remote.source,
      installs: remote.installs,
      pageUrl: remote.pageUrl,
      directory,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      contentHash: hashDocument(toSkillDocument(remote)),
      remoteRevision: remote.remoteRevision,
    }
    await this.publish(
      target,
      toSkillDocument(remote),
      record,
      manifest,
      existing !== undefined && targetExists ? existing : undefined,
    )
    return { ...record, exists: true }
  }

  async checkUpdate(id: string): Promise<UpdateCheck> {
    validateSkillId(id)
    const manifest = await this.readManifest()
    const current = manifest.skills[id]
    if (current === undefined) {
      throw new SkillManagerError('NOT_MANAGED', 'The skill is not managed by this plugin.', 404)
    }
    const remote = await this.loadRemote(id)
    return {
      id,
      currentRevision: current.remoteRevision,
      latestRevision: remote.remoteRevision,
      hasUpdate: current.contentHash !== hashDocument(toSkillDocument(remote)),
      latest: remote,
    }
  }

  async update(id: string, confirmed: boolean): Promise<UpdateCheck> {
    validateSkillId(id)
    const manifest = await this.readManifest()
    const current = manifest.skills[id]
    if (current === undefined) {
      throw new SkillManagerError('NOT_MANAGED', 'The skill is not managed by this plugin.', 404)
    }
    if (!confirmed) throw new ConfirmationRequiredError('update')
    const checked = await this.checkUpdate(id)
    if (!checked.hasUpdate) return checked

    const remote = checked.latest
    const updated: ManagedRecord = {
      ...current,
      skillId: remote.skillId,
      name: remote.name,
      description: remote.description,
      source: remote.source,
      installs: remote.installs,
      pageUrl: remote.pageUrl,
      updatedAt: new Date().toISOString(),
      contentHash: hashDocument(toSkillDocument(remote)),
      remoteRevision: remote.remoteRevision,
    }
    const target = resolveContainedPath(this.root, current.directory)
    await this.assertManagedTarget(target)
    await this.publish(target, toSkillDocument(remote), updated, manifest, current)
    return {
      ...checked,
      currentRevision: updated.remoteRevision,
      latestRevision: updated.remoteRevision,
      hasUpdate: false,
    }
  }

  async uninstall(id: string, confirmed: boolean): Promise<void> {
    validateSkillId(id)
    const manifest = await this.readManifest()
    const current = manifest.skills[id]
    if (current === undefined) {
      throw new SkillManagerError('NOT_MANAGED', 'The skill is not managed by this plugin.', 404)
    }
    if (!confirmed) throw new ConfirmationRequiredError('uninstall')

    const target = resolveContainedPath(this.root, current.directory)
    if (await this.pathExists(target)) await this.assertManagedTarget(target)
    const backup = resolveContainedPath(this.root, `.noumena-luna-backup-${randomToken()}`)
    const nextManifest = {
      ...manifest,
      skills: withoutSkill(manifest.skills, id),
    }
    let moved = false
    try {
      if (await this.pathExists(target)) {
        await rename(target, backup)
        moved = true
      }
      await this.writeManifest(nextManifest)
      await this.discover()
      if (moved) await rm(backup, { recursive: true, force: false })
    } catch (error) {
      try {
        if (moved && !(await this.pathExists(target)) && await this.pathExists(backup)) {
          await rename(backup, target)
        }
        await this.writeManifest(manifest)
      } catch (rollbackError) {
        throw new SkillManagerError(
          'ROLLBACK_FAILED',
          'Uninstall failed and the previous skill state could not be restored.',
          500,
          { cause: rollbackError },
        )
      }
      throw error
    }
  }

  private async publish(
    target: string,
    document: string,
    record: ManagedRecord,
    previousManifest: Manifest,
    previousRecord: ManagedRecord | undefined,
  ): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const staging = resolveContainedPath(this.root, `.noumena-luna-staging-${randomToken()}`)
    const backup = resolveContainedPath(this.root, `.noumena-luna-backup-${randomToken()}`)
    const nextManifest: Manifest = {
      version: MANIFEST_VERSION,
      skills: { ...previousManifest.skills, [record.id]: record },
    }
    let moved = false
    let published = false
    try {
      await mkdir(staging, { recursive: false })
      const skillFile = resolveContainedPath(staging, SKILL_FILE)
      await writeFile(skillFile, document, { encoding: 'utf8', flag: 'wx' })
      if (hashDocument(await readFile(skillFile, 'utf8')) !== record.contentHash) {
        throw new SkillManagerError('OPERATION_FAILED', 'The staged skill content failed verification.', 500)
      }
      if (previousRecord !== undefined) {
        await rename(target, backup)
        moved = true
      }
      await rename(staging, target)
      published = true
      await this.writeManifest(nextManifest)
      await this.discover()
      if (moved) await rm(backup, { recursive: true, force: false })
    } catch (error) {
      try {
        if (published && await this.pathExists(target)) await rm(target, { recursive: true, force: false })
        if (moved && await this.pathExists(backup)) await rename(backup, target)
        if (await this.pathExists(staging)) await rm(staging, { recursive: true, force: false })
        await this.writeManifest(previousManifest)
      } catch (rollbackError) {
        throw new SkillManagerError(
          'ROLLBACK_FAILED',
          'The skill operation failed and the previous skill state could not be restored.',
          500,
          { cause: rollbackError },
        )
      }
      throw error
    } finally {
      if (await this.pathExists(staging)) await rm(staging, { recursive: true, force: true })
    }
  }

  private async assertManagedTarget(target: string): Promise<void> {
    await assertNotSymbolicLink(target)
    await assertExistingPathContained(this.root, target)
    const metadata = await lstat(target)
    if (!metadata.isDirectory()) {
      throw new SkillManagerError('UNMANAGED_CONFLICT', 'The managed skill target is not a directory.', 409)
    }
  }

  private async loadRemote(id: string): Promise<RemoteSkill> {
    let remote: RemoteSkill
    try {
      remote = await this.source.getSkill(id)
    } catch (error) {
      if (error instanceof SkillManagerError) throw error
      throw new SkillManagerError(
        'SOURCE_UNAVAILABLE',
        'The skill source is unavailable.',
        502,
        { cause: error },
      )
    }
    if (
      remote.id !== id
      || remote.pageUrl.startsWith('https://skills.sh/') === false
      || remote.content.trim().length === 0
    ) {
      throw new SkillManagerError(
        'INVALID_REMOTE_SKILL',
        'The skill source returned an invalid or incomplete skill.',
        502,
      )
    }
    return remote
  }

  private async readManifest(): Promise<Manifest> {
    const { directory, path } = this.manifestPaths()
    try {
      if (!(await this.pathExists(directory))) return emptyManifest()
      await this.assertDirectoryInsideRoot(directory)
      if (!(await this.pathExists(path))) return emptyManifest()
      await assertNotSymbolicLink(path)
      await assertExistingPathContained(this.root, path)
      const raw = await readFile(path, 'utf8')
      return parseManifest(raw)
    } catch (error) {
      if (isMissing(error)) return emptyManifest()
      if (error instanceof SkillManagerError) throw error
      throw new SkillManagerError('STATE_CORRUPT', 'The plugin management record could not be read.', 500, {
        cause: error,
      })
    }
  }

  private async writeManifest(manifest: Manifest): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const { directory, path } = this.manifestPaths()
    if (await this.pathExists(directory)) {
      await this.assertDirectoryInsideRoot(directory)
    } else {
      await mkdir(directory, { recursive: false })
      await this.assertDirectoryInsideRoot(directory)
    }
    if (await this.pathExists(path)) {
      await assertNotSymbolicLink(path)
      await assertExistingPathContained(this.root, path)
    }
    const temporary = resolveContainedPath(
      this.root,
      join(METADATA_DIRECTORY, `.manifest-${randomToken()}.tmp`),
    )
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  }

  private manifestPaths(): { directory: string; path: string } {
    const directory = resolveContainedPath(this.root, METADATA_DIRECTORY)
    return {
      directory,
      path: resolveContainedPath(this.root, join(METADATA_DIRECTORY, MANIFEST_FILE)),
    }
  }

  private async assertDirectoryInsideRoot(directory: string): Promise<void> {
    await assertNotSymbolicLink(directory)
    await assertExistingPathContained(this.root, directory)
    if (!(await lstat(directory)).isDirectory()) {
      throw new SkillManagerError('STATE_CORRUPT', 'The plugin metadata path is not a directory.', 500)
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  private async managedPathExists(path: string): Promise<boolean> {
    try {
      await assertNotSymbolicLink(path)
      await assertExistingPathContained(this.root, path)
      return (await lstat(path)).isDirectory()
    } catch (error) {
      if (isMissing(error) || error instanceof PathSafetyError) return false
      throw error
    }
  }
}

function parseManifest(raw: string): Manifest {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new SkillManagerError('STATE_CORRUPT', 'The plugin management record is not valid JSON.', 500, {
      cause: error,
    })
  }
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || (value as { version?: unknown }).version !== MANIFEST_VERSION
    || typeof (value as { skills?: unknown }).skills !== 'object'
    || (value as { skills?: unknown }).skills === null
    || Array.isArray((value as { skills?: unknown }).skills)
  ) {
    throw new SkillManagerError('STATE_CORRUPT', 'The plugin management record has an unsupported shape.', 500)
  }
  return value as Manifest
}

function emptyManifest(): Manifest {
  return { version: MANIFEST_VERSION, skills: {} }
}

function withoutSkill(skills: Record<string, ManagedRecord>, id: string): Record<string, ManagedRecord> {
  const next = { ...skills }
  delete next[id]
  return next
}

function directoryFor(remote: RemoteSkill): string {
  try {
    return assertSafeSkillDirectoryName(remote.skillId)
  } catch (error) {
    throw new SkillManagerError('INVALID_REMOTE_SKILL', 'The remote skill name is not safe to install.', 502, {
      cause: error,
    })
  }
}

function toSkillDocument(remote: RemoteSkill): string {
  directoryFor(remote)
  const description = JSON.stringify(remote.description)
  const content = remote.content.replace(/^---\s*[\s\S]*?\s*---\s*/, '').trim()
  if (content.length === 0) {
    throw new SkillManagerError('INVALID_REMOTE_SKILL', 'The remote skill has no usable content.', 502)
  }
  return `---\nname: ${remote.skillId}\ndescription: ${description}\n---\n\n${content}\n`
}

function hashDocument(document: string): string {
  return createHash('sha256').update(document).digest('hex')
}

function randomToken(): string {
  return randomUUID()
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function validateSkillId(id: string): void {
  const segments = id.split('/')
  if (
    segments.length < 2
    || segments.length > 8
    || segments.some(segment => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment))
    || segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw new SkillManagerError('INVALID_SKILL_ID', 'The skill identifier is invalid.', 400)
  }
}
