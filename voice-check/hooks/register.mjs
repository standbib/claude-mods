import { findMetaLines, notionText, targetKey } from './detect.mjs'

// The Notion MCP tools that put text on a page
const NOTION_WRITE = /^mcp__.*__notion-(create-pages|update-page|create-comment)$/

// A second hold on the same page within this window goes to the user
const ASK_WINDOW_MS = 15 * 60 * 1000

const REWRITE_RULE =
  'Rewrite them so every line would survive if the page owner had written it themselves: ' +
  'no changelog, no notes on how the page was made, no defending its own choices, ' +
  'no narration about the page, no stage directions for the people using it. Keep the facts, then send the write again.'

// When each page was last held, by page id
const held = new Map()

export function register(on) {
  on('tool.call', { tool: NOTION_WRITE }, async ($, e, next) => {
    const hits = findMetaLines(notionText(e))
    if (hits.length === 0) return next(e)

    const key = targetKey(e)
    const now = await $.clock.now()
    const lastHeld = held.get(key)
    held.set(key, now)
    const list = hits.slice(0, 6).map((h) => `• ${h.line} (${h.kind})`).join('\n')
    const more = hits.length > 6 ? `\n…and ${hits.length - 6} more` : ''

    // First hold: send it back to Claude to rewrite, without interrupting the user
    if (lastHeld === undefined || now - lastHeld > ASK_WINDOW_MS) {
      $.ui.log(`held a Notion write: ${hits.length} line(s) read as meta commentary`)
      return { deny: `Voice check held this Notion write. These lines read as meta commentary:\n${list}${more}\n${REWRITE_RULE}` }
    }

    // Held again on the same page: the user decides
    let answer = 'Rewrite'
    try {
      answer = await $.ui.ask(`Voice check: this Notion write still has lines that read as meta commentary.\n${list}${more}\nSend it anyway?`, [
        'Rewrite',
        'Send anyway',
      ])
    } catch {
      // Dismissed, or nobody is there to ask: keep holding
    }
    if (answer === 'Send anyway') {
      held.delete(key)
      return next(e)
    }
    return { deny: `Voice check: The user chose to rewrite these lines:\n${list}${more}\n${REWRITE_RULE}` }
  })
}
