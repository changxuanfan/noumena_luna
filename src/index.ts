import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-skill'
import { SkillsShClient, SkillsShError } from './skills-sh.ts'
import {
  SkillManager,
  SkillManagerError,
  type SkillSource,
} from './skill-manager.ts'
import type { RemoteSkill } from './types.ts'

export const API_PREFIX = '/api/noumena-luna'

export {
  SkillsShClient,
  SkillsShError,
} from './skills-sh.ts'
export {
  ConfirmationRequiredError,
  SkillManager,
  SkillManagerError,
} from './skill-manager.ts'
export * from './path-safety.ts'

export interface ApiSuccess<T> {
  readonly data: T
}

export interface ApiFailure {
  readonly error: {
    readonly code: string
    readonly message: string
  }
}

export function apply(ctx: Context): void {
  ctx.inject(['webServer'], (webCtx) => {
    const source = new SkillsShClient()
    const manager = new SkillManager({
      root: dshHomePath('skills'),
      source,
      discover: () => ctx.emit('skills/change'),
    })
    const dispose = webCtx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: (request, response) => handleApiRequest(request, response, manager, ctx),
    })
    webCtx.effect(() => dispose, 'noumena-luna: API routes')
  })
}

export async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manager: SkillManager,
  ctx?: Pick<Context, 'logger'>,
): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const path = url.pathname.slice(API_PREFIX.length)
    if (request.method === 'GET' && path === '/skills/search') {
      const query = url.searchParams.get('q') ?? ''
      return sendJson(response, 200, { data: { skills: await manager.search(query) } })
    }
    if (request.method === 'GET' && path === '/skills/installed') {
      return sendJson(response, 200, { data: { skills: await manager.listInstalled() } })
    }
    if (request.method === 'POST' && path === '/skills/install') {
      const body = await actionBody(request)
      return sendJson(response, 200, { data: await manager.install(body.id, body.confirmed) })
    }
    if (request.method === 'POST' && path === '/skills/check-update') {
      const body = await actionBody(request)
      return sendJson(response, 200, { data: await manager.checkUpdate(body.id) })
    }
    if (request.method === 'POST' && path === '/skills/update') {
      const body = await actionBody(request)
      return sendJson(response, 200, { data: await manager.update(body.id, body.confirmed) })
    }
    if (request.method === 'POST' && path === '/skills/uninstall') {
      const body = await actionBody(request)
      await manager.uninstall(body.id, body.confirmed)
      return sendJson(response, 200, { data: { ok: true } })
    }
    return sendJson(response, 404, {
      error: { code: 'NOT_FOUND', message: 'The requested Skill Manager endpoint does not exist.' },
    })
  } catch (error) {
    const failure = publicFailure(error)
    if (failure.status >= 500) {
      ctx?.logger.error(error instanceof Error ? error : new Error(String(error)))
    }
    return sendJson(response, failure.status, {
      error: { code: failure.code, message: failure.message },
    })
  }
}

async function actionBody(request: IncomingMessage): Promise<{ id: string; confirmed: boolean }> {
  const raw = await readBody(request)
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new SkillManagerError('OPERATION_FAILED', 'The request body is not valid JSON.', 400, {
      cause: error,
    })
  }
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || typeof (value as { id?: unknown }).id !== 'string'
    || typeof (value as { confirmed?: unknown }).confirmed !== 'boolean'
  ) {
    throw new SkillManagerError(
      'OPERATION_FAILED',
      'The request must include a skill id and an explicit confirmation value.',
      400,
    )
  }
  return {
    id: (value as { id: string }).id,
    confirmed: (value as { confirmed: boolean }).confirmed,
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += buffer.length
    if (length > 64 * 1024) {
      throw new SkillManagerError('OPERATION_FAILED', 'The request body is too large.', 413)
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(response: ServerResponse, status: number, body: ApiSuccess<unknown> | ApiFailure): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function publicFailure(error: unknown): {
  status: number
  code: string
  message: string
} {
  if (error instanceof SkillManagerError || error instanceof SkillsShError) {
    return { status: error.status, code: error.code, message: error.message }
  }
  if (error instanceof Error) {
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'The Skill Manager could not complete the request.',
    }
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'The Skill Manager could not complete the request.',
  }
}

export type { RemoteSkill, SkillSource }
