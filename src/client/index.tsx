import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ManagedSkill, RemoteSkill, UpdateCheck } from '../types.ts'

const API_PREFIX = '/api/noumena-luna'

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'noumena-luna',
    order: 25,
    label: 'DSH Skill Manager',
  }, SkillManagerSection))
}

interface ApiSuccess<T> {
  readonly data: T
}

interface ApiFailure {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure

interface SectionProps extends SettingsSectionOwnerProps {}

function SkillManagerSection({ close }: SectionProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly RemoteSkill[]>([])
  const [installed, setInstalled] = useState<readonly ManagedSkill[]>([])
  const [updates, setUpdates] = useState<Readonly<Record<string, UpdateCheck>>>({})
  const [loading, setLoading] = useState(false)
  const [installedLoading, setInstalledLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()

  const loadInstalled = useCallback(async () => {
    setInstalledLoading(true)
    setError(undefined)
    try {
      const payload = await requestJson<{ skills: readonly ManagedSkill[] }>('/skills/installed')
      setInstalled(payload.skills)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setInstalledLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInstalled()
  }, [loadInstalled])

  const search = useCallback(async () => {
    if (query.trim().length === 0) {
      setResults([])
      setError(undefined)
      return
    }
    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      const params = new URLSearchParams({ q: query.trim() })
      const payload = await requestJson<{ skills: readonly RemoteSkill[] }>(
        `/skills/search?${params.toString()}`,
      )
      setResults(payload.skills)
    } catch (cause) {
      setResults([])
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [query])

  const install = useCallback(async (skill: RemoteSkill) => {
    if (!window.confirm(`Install "${skill.name}" into the DSH skill directory?`)) return
    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await requestJson(`/skills/install`, {
        method: 'POST',
        body: JSON.stringify({ id: skill.id, confirmed: true }),
      })
      setMessage(`Installed ${skill.name}.`)
      await loadInstalled()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [loadInstalled])

  const checkUpdate = useCallback(async (skill: ManagedSkill) => {
    setError(undefined)
    try {
      const result = await requestJson<UpdateCheck>('/skills/check-update', {
        method: 'POST',
        body: JSON.stringify({ id: skill.id, confirmed: false }),
      })
      setUpdates(previous => ({ ...previous, [skill.id]: result }))
      setMessage(result.hasUpdate
        ? `${skill.name} has an update available.`
        : `${skill.name} is up to date.`)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  const update = useCallback(async (skill: ManagedSkill) => {
    if (!window.confirm(`Update "${skill.name}" and replace its current files?`)) return
    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await requestJson('/skills/update', {
        method: 'POST',
        body: JSON.stringify({ id: skill.id, confirmed: true }),
      })
      setMessage(`Updated ${skill.name}.`)
      setUpdates(previous => {
        const next = { ...previous }
        delete next[skill.id]
        return next
      })
      await loadInstalled()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [loadInstalled])

  const uninstall = useCallback(async (skill: ManagedSkill) => {
    if (!window.confirm(`Uninstall "${skill.name}" from the DSH skill directory?`)) return
    setLoading(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await requestJson('/skills/uninstall', {
        method: 'POST',
        body: JSON.stringify({ id: skill.id, confirmed: true }),
      })
      setMessage(`Uninstalled ${skill.name}.`)
      await loadInstalled()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [loadInstalled])

  const copy = useMemo(() => ({
    search: 'Search skills.sh',
    searchPlaceholder: 'Try pdf, testing, or react',
    installed: 'Managed local skills',
    noResults: query.trim().length === 0 ? 'Enter a keyword to search skills.sh.' : 'No skills found.',
    noInstalled: 'No skills are managed by this plugin yet.',
    loading: 'Loading…',
    searchButton: 'Search',
    install: 'Install',
    checkUpdate: 'Check update',
    update: 'Update',
    uninstall: 'Uninstall',
    missing: 'Directory missing',
    close: 'Close',
  }), [query])

  return (
    <section style={styles.section} aria-label="DSH Skill Manager">
      <header style={styles.header}>
        <div>
          <h2 style={styles.title}>DSH Skill Manager</h2>
          <p style={styles.subtitle}>Search, install, update, and remove skills from skills.sh.</p>
        </div>
        <button type="button" onClick={close} style={styles.secondaryButton}>{copy.close}</button>
      </header>
      {error ? <p role="alert" style={styles.error}>{error}</p> : null}
      {message ? <p role="status" style={styles.success}>{message}</p> : null}

      <div style={styles.card}>
        <h3 style={styles.heading}>{copy.search}</h3>
        <form
          style={styles.searchRow}
          onSubmit={(event) => {
            event.preventDefault()
            void search()
          }}
        >
          <input
            aria-label="Search skills.sh"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={copy.searchPlaceholder}
            style={styles.input}
            disabled={loading}
          />
          <button type="submit" style={styles.primaryButton} disabled={loading}>
            {loading ? copy.loading : copy.searchButton}
          </button>
        </form>
        {loading && results.length === 0 ? <p style={styles.muted}>{copy.loading}</p> : null}
        {!loading && results.length === 0 ? <p style={styles.muted}>{copy.noResults}</p> : null}
        <div style={styles.list}>
          {results.map(skill => (
            <article key={skill.id} style={styles.item}>
              <div style={styles.itemBody}>
                <h4 style={styles.itemTitle}>{skill.name}</h4>
                <p style={styles.description}>{skill.description}</p>
                {skill.detailError ? <p style={styles.warning}>Details unavailable: {skill.detailError}</p> : null}
                {skill.canInstall === false
                  ? <p style={styles.warning}>This skill name is not compatible with the DSH skill format.</p>
                  : null}
                <dl style={styles.details}>
                  <div><dt style={styles.term}>Source</dt><dd style={styles.value}>{skill.source}</dd></div>
                  <div><dt style={styles.term}>Installs</dt><dd style={styles.value}>{formatInstalls(skill.installs)}</dd></div>
                </dl>
                <a href={skill.pageUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  Open on skills.sh
                </a>
              </div>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={() => { void install(skill) }}
                disabled={loading || skill.content.length === 0 || skill.canInstall === false}
              >
                {copy.install}
              </button>
            </article>
          ))}
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.heading}>{copy.installed}</h3>
        {installedLoading ? <p style={styles.muted}>{copy.loading}</p> : null}
        {!installedLoading && installed.length === 0 ? <p style={styles.muted}>{copy.noInstalled}</p> : null}
        <div style={styles.list}>
          {installed.map(skill => {
            const updateInfo = updates[skill.id]
            return (
              <article key={skill.id} style={styles.item}>
                <div style={styles.itemBody}>
                  <h4 style={styles.itemTitle}>{skill.name}</h4>
                  <p style={styles.description}>{skill.description}</p>
                  <p style={skill.exists ? styles.muted : styles.warning}>
                    {skill.exists ? `${skill.source} · ${skill.directory}` : copy.missing}
                  </p>
                  {updateInfo?.hasUpdate ? <p style={styles.warning}>Update available.</p> : null}
                </div>
                <div style={styles.actions}>
                  <button type="button" style={styles.secondaryButton} onClick={() => { void checkUpdate(skill) }} disabled={loading}>
                    {copy.checkUpdate}
                  </button>
                  {updateInfo?.hasUpdate ? (
                    <button type="button" style={styles.primaryButton} onClick={() => { void update(skill) }} disabled={loading}>
                      {copy.update}
                    </button>
                  ) : null}
                  <button type="button" style={styles.dangerButton} onClick={() => { void uninstall(skill) }} disabled={loading}>
                    {copy.uninstall}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

async function requestJson<T = { ok: true }>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...init?.headers,
      },
    })
  } catch (cause) {
    throw new Error(`Unable to reach the DSH Skill Manager: ${errorMessage(cause)}`)
  }
  let body: ApiResponse<T>
  try {
    body = await response.json() as ApiResponse<T>
  } catch (cause) {
    throw new Error(`The DSH Skill Manager returned invalid data: ${errorMessage(cause)}`)
  }
  if (!response.ok || 'error' in body) {
    throw new Error(body && 'error' in body ? body.error.message : `Request failed with HTTP ${response.status}.`)
  }
  return body.data
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function formatInstalls(installs: number): string {
  return new Intl.NumberFormat().format(installs)
}

const styles: Readonly<Record<string, CSSProperties>> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 920,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: 16,
    justifyContent: 'space-between',
  },
  title: { margin: 0, fontSize: 20, fontWeight: 600 },
  subtitle: { color: 'var(--dsw-alias-label-secondary)', margin: '6px 0 0', fontSize: 13 },
  heading: { margin: '0 0 12px', fontSize: 15, fontWeight: 600 },
  card: {
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    padding: 16,
  },
  searchRow: { display: 'flex', gap: 8 },
  input: {
    background: 'var(--dsw-alias-bg-layer-3)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 8,
    color: 'var(--dsw-alias-label-primary)',
    flex: 1,
    font: 'inherit',
    minWidth: 0,
    padding: '9px 12px',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  item: {
    alignItems: 'flex-start',
    background: 'var(--dsw-alias-bg-layer-3)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10,
    display: 'flex',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  itemBody: { minWidth: 0 },
  itemTitle: { margin: 0, fontSize: 14, fontWeight: 600 },
  description: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 1.5, margin: '5px 0 8px' },
  details: { display: 'flex', flexWrap: 'wrap', gap: '4px 18px', margin: 0 },
  term: { color: 'var(--dsw-alias-label-tertiary)', display: 'inline', fontSize: 12 },
  value: { display: 'inline', fontSize: 12, margin: 0 },
  link: { color: 'var(--dsw-alias-brand-primary)', display: 'inline-block', fontSize: 12, marginTop: 8 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  primaryButton: {
    background: 'var(--dsw-alias-brand-primary)',
    border: 0,
    borderRadius: 7,
    color: 'white',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 12,
    padding: '8px 11px',
    whiteSpace: 'nowrap',
  },
  secondaryButton: {
    background: 'transparent',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 7,
    color: 'var(--dsw-alias-label-primary)',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 12,
    padding: '7px 10px',
    whiteSpace: 'nowrap',
  },
  dangerButton: {
    background: 'transparent',
    border: '1px solid var(--dsw-alias-label-error)',
    borderRadius: 7,
    color: 'var(--dsw-alias-label-error)',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 12,
    padding: '7px 10px',
    whiteSpace: 'nowrap',
  },
  muted: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, margin: '10px 0 0' },
  error: {
    background: 'color-mix(in srgb, var(--dsw-alias-label-error) 12%, transparent)',
    borderRadius: 8,
    color: 'var(--dsw-alias-label-error)',
    fontSize: 13,
    margin: 0,
    padding: '9px 11px',
  },
  success: {
    background: 'color-mix(in srgb, var(--dsw-alias-label-success) 12%, transparent)',
    borderRadius: 8,
    color: 'var(--dsw-alias-label-success)',
    fontSize: 13,
    margin: 0,
    padding: '9px 11px',
  },
  warning: { color: 'var(--dsw-alias-label-warning)', fontSize: 12, margin: '6px 0' },
}
