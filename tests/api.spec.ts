import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { handleApiRequest } from '../src/index.ts'
import { SkillManager } from '../src/skill-manager.ts'
import type { RemoteSkill } from '../src/types.ts'

const remoteSkill: RemoteSkill = {
  id: 'acme/skills/testing',
  skillId: 'testing',
  name: 'Testing',
  description: 'A testing skill.',
  source: 'acme/skills',
  installs: 20,
  pageUrl: 'https://skills.sh/acme/skills/testing',
  content: '# Testing',
  remoteRevision: 'revision-1',
}

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })))
})

async function startApi(manager: SkillManager): Promise<string> {
  const server = createServer((request, response) => {
    void handleApiRequest(request, response, manager)
  })
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind a TCP address.')
  return `http://127.0.0.1:${address.port}`
}

describe('Skill Manager HTTP interface', () => {
  it('exposes search, confirmation, and installed-skill operations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-api-'))
    const manager = new SkillManager({
      root,
      source: {
        search: async () => [remoteSkill],
        getSkill: async () => remoteSkill,
      },
    })
    const baseUrl = await startApi(manager)

    const search = await fetch(`${baseUrl}/api/noumena-luna/skills/search?q=testing`)
    expect(search.status).toBe(200)
    expect((await search.json()).data.skills[0].id).toBe(remoteSkill.id)

    const confirmation = await fetch(`${baseUrl}/api/noumena-luna/skills/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: remoteSkill.id, confirmed: false }),
    })
    expect(confirmation.status).toBe(409)
    expect((await confirmation.json()).error.code).toBe('CONFIRMATION_REQUIRED')

    const install = await fetch(`${baseUrl}/api/noumena-luna/skills/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: remoteSkill.id, confirmed: true }),
    })
    expect(install.status).toBe(200)

    const installed = await fetch(`${baseUrl}/api/noumena-luna/skills/installed`)
    expect((await installed.json()).data.skills).toHaveLength(1)
  })

  it('returns a structured error for malformed action requests', async () => {
    const root = await mkdtemp(join(tmpdir(), 'noumena-luna-api-'))
    const manager = new SkillManager({
      root,
      source: { search: async () => [], getSkill: async () => remoteSkill },
    })
    const baseUrl = await startApi(manager)

    const result = await fetch(`${baseUrl}/api/noumena-luna/skills/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"id":',
    })

    expect(result.status).toBe(400)
    expect((await result.json()).error.code).toBe('OPERATION_FAILED')
  })
})
