import { expect, mock, test } from 'claude-code/testing'

const UPDATE = 'mcp__claude_ai_Notion__notion-update-page'
const CREATE = 'mcp__claude_ai_Notion__notion-create-pages'
const COMMENT = 'mcp__claude_ai_Notion__notion-create-comment'

// Lines that read as meta commentary, one per kind of rule
const META = [
  'Every figure below was read from the live database this morning — none of it is remembered.',
  '**Two ground rules, said out loud at the start.** Not decoration — they\'re the mechanism.',
  '## The blocks that need explaining',
  '### 0:15 — Demo the new flow (20 min) · **the centrepiece**',
  '**Walk to the desk.** Phones away.',
].join('\n')

// An ordinary agenda that should go out as written
const CLEAN = [
  '## Agenda',
  '1. **What changed since last week**',
  '2. **Interview plan:** who goes first, and which dates work',
  '- The October deadline is gone. Nothing forces the answer on a date.',
  '- Held off until now because the app kept changing and a tour would have gone stale.',
  '- A price that falls with tenure is legal, was withdrawn at its one software precedent.',
].join('\n')

// Answers each Notion write as written, and each question with `answer`
function stubTools(on, answer?: string) {
  const asked: string[] = []
  on('tool.call', ($, e) => {
    if (e.tool === 'AskUserQuestion') {
      asked.push(e.questions[0].question)
      return { result: { answers: { [e.questions[0].question]: answer ?? 'Rewrite' } } }
    }
    return { result: 'written' }
  })
  on('ui.log', () => ({ value: undefined }))
  return asked
}

test('holds meta-commentary lines and names each one', async ($, on) => {
  mock.clock(on)
  stubTools(on)
  const out = await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  expect(out.result).toBeUndefined()
  expect(out.deny).toContain('none of it is remembered')
  expect(out.deny).toContain('Not decoration')
  expect(out.deny).toContain('The blocks that need explaining')
  expect(out.deny).toContain('the centrepiece')
  expect(out.deny).toContain('Walk to the desk')
})

test('lets an ordinary agenda through', async ($, on) => {
  mock.clock(on)
  stubTools(on)
  const out = await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'replace_content', new_str: CLEAN })
  expect(out).toEqual({ result: 'written' })
})

test('checks new pages, content updates and comments', async ($, on) => {
  mock.clock(on)
  stubTools(on)
  const page = await $.tool.call({ tool: CREATE, parent: { page_id: 'hub' }, pages: [{ content: META }] })
  expect(page.deny).toBeDefined()
  const update = await $.tool.call({ tool: UPDATE, page_id: 'p2', command: 'update_content', content_updates: [{ old_str: 'x', new_str: META }] })
  expect(update.deny).toBeDefined()
  const comment = await $.tool.call({ tool: COMMENT, page_id: 'p3', markdown: 'Done. Verified against prod today.' })
  expect(comment.deny).toBeDefined()
})

test('leaves property-only updates alone', async ($, on) => {
  mock.clock(on)
  stubTools(on)
  const out = await $.tool.call({ tool: UPDATE, page_id: 'row', command: 'update_properties', properties: { Status: 'Done' } })
  expect(out).toEqual({ result: 'written' })
})

test('the first hold goes back to Claude without asking the user', async ($, on) => {
  mock.clock(on)
  const asked = stubTools(on, 'Send anyway')
  const out = await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  expect(out.deny).toContain('Voice check held this Notion write')
  expect(asked).toEqual([])
})

test('a second hold on the same page asks the user, and Send anyway writes it', async ($, on) => {
  mock.clock(on)
  const asked = stubTools(on, 'Send anyway')
  await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  const out = await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('Send it anyway?')
  expect(out).toEqual({ result: 'written' })
})

test('Rewrite keeps the write held', async ($, on) => {
  mock.clock(on)
  stubTools(on, 'Rewrite')
  await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  const out = await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  expect(out.deny).toContain('The user chose to rewrite')
})

test('a hold more than 15 minutes later starts over without asking', async ($, on) => {
  const clock = mock.clock(on)
  const asked = stubTools(on, 'Send anyway')
  await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  await clock.advance(16 * 60 * 1000)
  const out = await $.tool.call({ tool: UPDATE, page_id: 'agenda', command: 'insert_content', content: META })
  expect(asked).toEqual([])
  expect(out.deny).toBeDefined()
})
