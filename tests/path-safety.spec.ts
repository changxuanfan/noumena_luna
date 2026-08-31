import { describe, expect, it } from 'vitest'
import { assertSafeRelativePath, resolveContainedPath } from '../src/path-safety.ts'

describe('path safety', () => {
  it('resolves a normal child inside the DSH skill root', () => {
    expect(resolveContainedPath('/tmp/dsh/skills', 'pdf')).toBe('/tmp/dsh/skills/pdf')
  })

  it.each(['../outside', '../../outside', '/tmp/outside', 'nested/../../outside'])(
    'rejects a path outside the DSH skill root: %s',
    (candidate) => {
      expect(() => resolveContainedPath('/tmp/dsh/skills', candidate)).toThrowError(
        expect.objectContaining({ code: 'PATH_OUTSIDE_SKILL_ROOT' }),
      )
    },
  )

  it.each(['../outside.txt', '/absolute.txt', 'nested/../../outside.txt', ''])(
    'rejects an unsafe relative archive entry: %s',
    (candidate) => {
      expect(() => assertSafeRelativePath(candidate)).toThrowError(
        expect.objectContaining({ code: 'UNSAFE_RELATIVE_PATH' }),
      )
    },
  )

  it('accepts nested relative archive entries', () => {
    expect(assertSafeRelativePath('docs/guide.md')).toBe('docs/guide.md')
  })
})
