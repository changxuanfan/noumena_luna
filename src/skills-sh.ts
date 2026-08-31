import { createHash } from 'node:crypto'
import type { RemoteSkill } from './types.ts'

const ORIGIN = 'https://skills.sh'
const SEARCH_LIMIT = 20

export interface FetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers?: {
    get(name: string): string | null
  }
  json(): Promise<unknown>
  text(): Promise<string>
}

export interface FetchInit {
  readonly headers?: Readonly<Record<string, string>>
  readonly redirect?: 'manual'
  readonly signal?: AbortSignal
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>

export type SkillsShErrorCode =
  | 'NETWORK_ERROR'
  | 'UPSTREAM_INVALID_RESPONSE'
  | 'SOURCE_UNAVAILABLE'

export class SkillsShError extends Error {
  constructor(
    readonly code: SkillsShErrorCode,
    message: string,
    readonly status = 502,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SkillsShError'
  }
}

export interface SkillsShClientOptions {
  readonly fetcher?: FetchLike
  readonly origin?: string
  readonly limit?: number
}

interface SearchEntry {
  readonly id: string
  readonly skillId?: string
  readonly name?: string
  readonly installs?: number
  readonly source?: string
  readonly description?: string
}

interface JsonLdSkill {
  readonly name?: unknown
  readonly description?: unknown
  readonly interactionStatistic?: unknown
}

export class SkillsShClient {
  readonly fetcher: FetchLike
  readonly origin: string
  readonly limit: number

  constructor(options?: SkillsShClientOptions | FetchLike) {
    if (typeof options === 'function') {
      this.fetcher = options
      this.origin = ORIGIN
      this.limit = SEARCH_LIMIT
    } else {
      this.fetcher = options?.fetcher ?? defaultFetch
      this.origin = options?.origin ?? ORIGIN
      this.limit = options?.limit ?? SEARCH_LIMIT
    }
    if (this.origin !== ORIGIN) {
      throw new Error(`skills.sh client only supports ${ORIGIN}`)
    }
  }

  async search(query: string, signal?: AbortSignal): Promise<readonly RemoteSkill[]> {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    const params = new URLSearchParams({ q: trimmed, limit: String(this.limit) })
    const payload = await this.fetchJson(`${this.origin}/api/search?${params.toString()}`, signal)
    if (!isRecord(payload) || !Array.isArray(payload.skills)) {
      throw new SkillsShError(
        'UPSTREAM_INVALID_RESPONSE',
        'skills.sh returned an invalid search response.',
      )
    }

    const entries = payload.skills.map(parseSearchEntry)
    return mapWithConcurrency(entries, 5, async (entry) => {
      const pageUrl = pageUrlFor(this.origin, entry.id)
      try {
        const detail = await this.getSkill(entry.id, signal)
        return {
          ...detail,
          installs: Math.max(entry.installs ?? 0, detail.installs),
          source: entry.source ?? detail.source,
        }
      } catch (error) {
        if (error instanceof SkillsShError) {
          return {
            id: entry.id,
            skillId: entry.skillId ?? lastSegment(entry.id),
            name: entry.name ?? entry.skillId ?? lastSegment(entry.id),
            description: entry.description ?? 'Description unavailable.',
            source: entry.source ?? sourceFor(entry.id),
            installs: entry.installs ?? 0,
            pageUrl,
            content: '',
            remoteRevision: '',
            detailError: error.message,
          }
        }
        throw error
      }
    })
  }

  async getSkill(id: string, signal?: AbortSignal): Promise<RemoteSkill> {
    validateSkillId(id)
    const pageUrl = pageUrlFor(this.origin, id)
    const response = await this.fetchText(pageUrl, signal)
    const metadata = parseJsonLd(response)
    const prose = extractProseBlock(response)
    const rest = extractRestBlock(response)
    if (metadata === undefined || prose === undefined) {
      throw new SkillsShError(
        'UPSTREAM_INVALID_RESPONSE',
        'The skills.sh page does not contain a usable skill document.',
      )
    }
    const content = htmlToMarkdown([prose, rest].filter((part): part is string => part !== undefined).join('\n'))
    if (content.trim().length === 0) {
      throw new SkillsShError(
        'UPSTREAM_INVALID_RESPONSE',
        'The skills.sh page contains an empty skill document.',
      )
    }
    const skillId = lastSegment(id)
    const name = stringValue(metadata.name) ?? skillId
    const description = stringValue(metadata.description)
    if (description === undefined || description.length === 0) {
      throw new SkillsShError(
        'UPSTREAM_INVALID_RESPONSE',
        'The skills.sh page does not contain a skill description.',
      )
    }
    const installs = numberValue(
      isRecord(metadata.interactionStatistic) ? metadata.interactionStatistic.userInteractionCount : undefined,
    ) ?? 0
    return {
      id,
      skillId,
      name,
      description,
      source: sourceFor(id),
      installs,
      pageUrl,
      content,
      remoteRevision: createHash('sha256').update(content).digest('hex'),
      canInstall: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillId),
    }
  }

  private async fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
    let response: FetchResponse
    try {
      response = await this.request(url, signal)
    } catch (error) {
      if (error instanceof SkillsShError) throw error
      throw new SkillsShError('NETWORK_ERROR', 'Unable to reach skills.sh.', 502, { cause: error })
    }
    if (!response.ok) {
      throw new SkillsShError(
        'SOURCE_UNAVAILABLE',
        `skills.sh search failed with HTTP ${response.status}.`,
        502,
      )
    }
    try {
      return await response.json()
    } catch (error) {
      throw new SkillsShError(
        'UPSTREAM_INVALID_RESPONSE',
        'skills.sh returned invalid JSON.',
        502,
        { cause: error },
      )
    }
  }

  private async fetchText(url: string, signal?: AbortSignal): Promise<string> {
    let response: FetchResponse
    try {
      response = await this.request(url, signal)
    } catch (error) {
      if (error instanceof SkillsShError) throw error
      throw new SkillsShError('NETWORK_ERROR', 'Unable to reach the skills.sh skill page.', 502, {
        cause: error,
      })
    }
    if (!response.ok) {
      throw new SkillsShError(
        'SOURCE_UNAVAILABLE',
        `The skills.sh skill page returned HTTP ${response.status}.`,
        502,
      )
    }
    try {
      return await response.text()
    } catch (error) {
      throw new SkillsShError(
        'UPSTREAM_INVALID_RESPONSE',
        'The skills.sh skill page could not be read.',
        502,
        { cause: error },
      )
    }
  }

  private async request(url: string, signal?: AbortSignal): Promise<FetchResponse> {
    let current = url
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(current, requestInit(signal))
      if (response.status < 300 || response.status >= 400) return response
      const location = response.headers?.get('location')
      if (location === null || location === undefined) return response
      const next = new URL(location, current)
      if (next.origin !== this.origin && next.origin !== 'https://www.skills.sh') {
        throw new SkillsShError(
          'SOURCE_UNAVAILABLE',
          'skills.sh redirected to an unsupported source.',
          502,
        )
      }
      current = next.toString()
    }
    throw new SkillsShError(
      'SOURCE_UNAVAILABLE',
      'skills.sh returned too many redirects.',
      502,
    )
  }
}

function parseSearchEntry(value: unknown): SearchEntry {
  if (!isRecord(value) || typeof value.id !== 'string' || !isSafeSkillId(value.id)) {
    throw new SkillsShError(
      'UPSTREAM_INVALID_RESPONSE',
      'skills.sh returned a search entry with an invalid identifier.',
    )
  }
  return {
    id: value.id,
    skillId: optionalString(value.skillId),
    name: optionalString(value.name),
    installs: optionalNumber(value.installs),
    source: optionalString(value.source),
    description: optionalString(value.description),
  }
}

function parseJsonLd(html: string): JsonLdSkill | undefined {
  const matches = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of matches) {
    try {
      const value: unknown = JSON.parse(decodeHtmlEntities(match[1] ?? ''))
      if (isRecord(value) && value['@type'] === 'SoftwareApplication') return value as JsonLdSkill
    } catch {
      // A page can carry unrelated JSON-LD. Continue until the skill record is found.
    }
  }
  return undefined
}

function extractProseBlock(html: string): string | undefined {
  const marker = html.search(/<span[^>]*>\s*SKILL\.md\s*<\/span>/i)
  if (marker < 0) return undefined
  const start = html.indexOf('<div', marker)
  if (start < 0) return undefined
  const openEnd = html.indexOf('>', start)
  if (openEnd < 0) return undefined
  const classAttribute = html.slice(start, openEnd + 1)
  if (!/\bclass=["'][^"']*\bprose\b/i.test(classAttribute)) {
    const proseMatch = /<div\b[^>]*class=["'][^"']*\bprose\b[^"']*["'][^>]*>/gi
    proseMatch.lastIndex = marker
    const match = proseMatch.exec(html)
    const proseStart = match?.index ?? -1
    if (proseStart < 0) return undefined
    return matchingDivContent(html, proseStart)
  }

  return matchingDivContent(html, start)
}

function extractRestBlock(html: string): string | undefined {
  const payload = decodeFlightPayloads(html)
  const reference = payload.match(/"restHtml":"\$([A-Za-z0-9]+)"/)?.[1]
  if (reference === undefined) return undefined
  const record = new RegExp(
    `${escapeRegExp(reference)}:T[^,]*,([\\s\\S]*?)(?=\\n[A-Za-z0-9]+:[A-Z](?:\\[|$)|$)`,
  ).exec(payload)
  return record?.[1]
}

function decodeFlightPayloads(html: string): string {
  const payloads: string[] = []
  for (const match of html.matchAll(/<script>self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)) {
    try {
      payloads.push(JSON.parse(`"${match[1]}"`) as string)
    } catch {
      // Ignore unrelated or malformed Flight chunks and keep parsing the page HTML.
    }
  }
  return payloads.join('\n')
}

function matchingDivContent(html: string, start: number): string | undefined {
  const openEnd = html.indexOf('>', start)
  if (openEnd < 0) return undefined
  let depth = 1
  const tags = /<\/?div\b[^>]*>/gi
  tags.lastIndex = openEnd + 1
  while (true) {
    const match = tags.exec(html)
    if (match === null) return undefined
    if (match[0].startsWith('</')) depth -= 1
    else if (!match[0].endsWith('/>')) depth += 1
    if (depth === 0) return html.slice(openEnd + 1, match.index)
  }
}

function htmlToMarkdown(html: string): string {
  let output = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, body: string) => `\n\n\`\`\`\n${stripTags(body)}\n\`\`\`\n\n`)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, body: string) => {
      return `\n\n${'#'.repeat(Number(level))} ${stripTags(body)}\n\n`
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body: string) => `\n- ${stripTags(body)}\n`)
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|ul|ol|blockquote|table|tr)>/gi, '\n')
    .replace(/<(p|div|section|article|ul|ol|blockquote|table|tr)\b[^>]*>/gi, '\n')
  output = stripTags(output)
  output = decodeHtmlEntities(output)
  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pageUrlFor(origin: string, id: string): string {
  return `${origin}/${id.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
}

function sourceFor(id: string): string {
  return id.split('/').slice(0, 2).join('/')
}

function lastSegment(id: string): string {
  return id.split('/').at(-1) ?? id
}

function validateSkillId(id: string): void {
  if (!isSafeSkillId(id)) {
    throw new SkillsShError('UPSTREAM_INVALID_RESPONSE', 'The skill identifier is invalid.', 400)
  }
}

function isSafeSkillId(id: string): boolean {
  const segments = id.split('/')
  return (
    segments.length >= 2
    && segments.length <= 8
    && segments.every(segment => /^[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=@%-]*$/.test(segment))
    && segments.every(segment => segment !== '.' && segment !== '..')
  )
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requestInit(signal?: AbortSignal): FetchInit {
  return {
    headers: { accept: 'application/json, text/html' },
    redirect: 'manual',
    signal,
  }
}

const defaultFetch: FetchLike = (url, init) => globalThis.fetch(url, init as RequestInit)

async function mapWithConcurrency<T, R>(
  entries: readonly T[],
  concurrency: number,
  callback: (entry: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(entries.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const index = next
      next += 1
      if (index >= entries.length) return
      results[index] = await callback(entries[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()))
  return results
}
