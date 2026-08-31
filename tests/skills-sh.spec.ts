import { describe, expect, it, vi } from 'vitest'
import { SkillsShClient, SkillsShError } from '../src/skills-sh.ts'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => String(body),
  }
}

const page = `
  <script type="application/ld+json">
    {"@type":"SoftwareApplication","name":"PDF Helper","description":"Process PDF files.","interactionStatistic":{"userInteractionCount":1234}}
  </script>
  <div><span>SKILL.md</span></div>
  <div class="prose">
    <h1>PDF Helper</h1>
    <p>Use this skill for PDF files.</p>
    <ul><li>Read the document</li><li>Extract its text</li></ul>
  </div>
`

const pageWithFullContent = `
  <script type="application/ld+json">
    {"@type":"SoftwareApplication","name":"PDF Helper","description":"Process PDF files.","interactionStatistic":{"userInteractionCount":1234}}
  </script>
  <div><span>SKILL.md</span></div>
  <div class="prose"><h1>Preview</h1></div>
  <script>self.__next_f.push([1,${JSON.stringify('"restHtml":"$33"\\n33:T123,<h2>Full guide</h2>\\n<p>More instructions.</p>\\n34:C')}])</script>
`

describe('SkillsShClient', () => {
  it('searches skills.sh and hydrates the displayed metadata from each skills.sh page', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://skills.sh/api/search?')) {
        return response({
          skills: [{
            id: 'acme/skills/pdf-helper',
            skillId: 'pdf-helper',
            name: 'pdf-helper',
            installs: 1000,
            source: 'acme/skills',
          }],
        })
      }
      return response(page)
    })
    const client = new SkillsShClient(fetcher)

    const results = await client.search('pdf')

    expect(fetcher).toHaveBeenCalledWith(
      'https://skills.sh/api/search?q=pdf&limit=20',
      expect.objectContaining({ redirect: 'manual' }),
    )
    expect(results).toEqual([expect.objectContaining({
      id: 'acme/skills/pdf-helper',
      name: 'PDF Helper',
      description: 'Process PDF files.',
      source: 'acme/skills',
      installs: 1234,
      pageUrl: 'https://skills.sh/acme/skills/pdf-helper',
      content: expect.stringContaining('# PDF Helper'),
    })])
  })

  it('rejects malformed search responses instead of treating them as empty results', async () => {
    const client = new SkillsShClient(vi.fn(async () => response({ results: [] })))

    await expect(client.search('pdf')).rejects.toMatchObject({
      code: 'UPSTREAM_INVALID_RESPONSE',
    })
  })

  it('surfaces a network failure as a typed source error', async () => {
    const client = new SkillsShClient(vi.fn(async () => {
      throw new Error('offline')
    }))

    await expect(client.search('pdf')).rejects.toBeInstanceOf(SkillsShError)
    await expect(client.search('pdf')).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })

  it('refuses a page that redirects or returns an invalid skill document', async () => {
    const client = new SkillsShClient(vi.fn(async () => response('<html>no skill</html>')))

    await expect(client.getSkill('acme/skills/pdf-helper')).rejects.toMatchObject({
      code: 'UPSTREAM_INVALID_RESPONSE',
    })
  })

  it('combines the visible preview with the full skill body in the page payload', async () => {
    const client = new SkillsShClient(vi.fn(async () => response(pageWithFullContent)))

    const result = await client.getSkill('acme/skills/pdf-helper')

    expect(result.content).toContain('# Preview')
    expect(result.content).toContain('## Full guide')
    expect(result.content).toContain('More instructions.')
  })

  it('does not follow redirects to a source outside skills.sh', async () => {
    const fetcher = vi.fn(async () => ({
      ...response('', 302),
      headers: { get: () => 'https://github.com/acme/skill' },
    }))
    const client = new SkillsShClient(fetcher)

    await expect(client.getSkill('acme/skills/pdf-helper')).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
