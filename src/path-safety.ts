import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export class PathSafetyError extends Error {
  readonly code: 'PATH_OUTSIDE_SKILL_ROOT' | 'UNSAFE_RELATIVE_PATH' | 'SYMLINK_OUTSIDE_SKILL_ROOT'

  constructor(
    code: PathSafetyError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'PathSafetyError'
    this.code = code
  }
}

function isContained(root: string, candidate: string): boolean {
  const distance = relative(root, candidate)
  return distance !== '' && distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance)
}

/**
 * Resolve a single operation path and prove it remains below the supplied root.
 * The returned value is absolute, while the caller remains responsible for
 * checking the real path when the target already exists.
 */
export function resolveContainedPath(root: string, child: string): string {
  if (typeof child !== 'string' || child.length === 0 || child.includes('\0')) {
    throw new PathSafetyError('PATH_OUTSIDE_SKILL_ROOT', 'The operation path must name a child of the DSH skill root.')
  }
  const resolvedRoot = resolve(root)
  const candidate = resolve(resolvedRoot, child)
  if (!isContained(resolvedRoot, candidate)) {
    throw new PathSafetyError(
      'PATH_OUTSIDE_SKILL_ROOT',
      'The operation path must remain inside the DSH skill root.',
    )
  }
  return candidate
}

/**
 * Normalize an archive entry without allowing absolute paths or parent
 * traversal. Backslashes are treated as separators on every platform because
 * archives can be produced on a different operating system.
 */
export function assertSafeRelativePath(entry: string): string {
  if (typeof entry !== 'string' || entry.length === 0 || entry.includes('\0')) {
    throw new PathSafetyError('UNSAFE_RELATIVE_PATH', 'The archive entry must be a non-empty relative path.')
  }
  const normalized = entry.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new PathSafetyError('UNSAFE_RELATIVE_PATH', 'The archive entry must not be absolute.')
  }
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new PathSafetyError('UNSAFE_RELATIVE_PATH', 'The archive entry contains an unsafe path segment.')
  }
  return segments.join('/')
}

export function assertSafeSkillDirectoryName(name: string): string {
  const normalized = assertSafeRelativePath(name)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new PathSafetyError('UNSAFE_RELATIVE_PATH', 'The skill directory name is not a valid DSH skill name.')
  }
  return normalized
}

export async function assertExistingPathContained(root: string, target: string): Promise<void> {
  const [resolvedRoot, resolvedTarget] = await Promise.all([realpath(root), realpath(target)])
  if (!isContained(resolvedRoot, resolvedTarget)) {
    throw new PathSafetyError(
      'SYMLINK_OUTSIDE_SKILL_ROOT',
      'The existing path resolves outside the DSH skill root.',
    )
  }
}

export async function assertNotSymbolicLink(target: string): Promise<void> {
  const metadata = await lstat(target)
  if (metadata.isSymbolicLink()) {
    throw new PathSafetyError(
      'SYMLINK_OUTSIDE_SKILL_ROOT',
      'Symbolic links are not allowed for managed skill directories.',
    )
  }
}
