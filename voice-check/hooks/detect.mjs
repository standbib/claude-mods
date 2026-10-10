// Finds lines in a Notion write that read as meta commentary: text that only
// makes sense because Claude wrote the page. Pure functions, no mods API.

// Each pattern names the kind of meta commentary it catches.
export const PATTERNS = [
  // Changelog: the page reporting its own edits
  { kind: 'changelog', re: /\b(an?|the) (earlier|previous|prior|older|first) (draft|version|pass) (said|had|of this)\b/i },
  { kind: 'changelog', re: /\b(this|it) (replaces|supersedes) (the|an?) (earlier|previous|old|prior)\b/i },
  { kind: 'changelog', re: /\b(corrected|revised|amended)\b[^.\n]{0,20}\b\d{4}-\d{2}-\d{2}\b/i },
  { kind: 'changelog', re: /^\W*withdrawn\b|\b(this|that|the) (claim|line|row|item|section|number|figure|point) (was|is|is now|has been) withdrawn\b/i },
  { kind: 'changelog', re: /\b(added|updated|changed) today\b/i },

  // Self-justification: defending the page's own choices
  { kind: 'self-justification', re: /\bnot (just )?decoration\b/i },
  { kind: 'self-justification', re: /\b(it'?s|they'?re|that'?s|is) the mechanism\b/i },
  { kind: 'self-justification', re: /\bthis isn'?t (just )?(aesthetics|decoration|cosmetic|a textbook)\b/i },
  { kind: 'self-justification', re: /\bwhy (this|these|that) and not\b/i },
  { kind: 'self-justification', re: /\bearns its place\b/i },
  { kind: 'self-justification', re: /\ba note on (the|this) (framework|format|structure|approach|method)\b/i },

  // Process provenance: how the page was made
  { kind: 'provenance', re: /\b(none of it|nothing here|not) (is |was )?(remembered|recalled)\b/i },
  { kind: 'provenance', re: /\bmeasured today\b/i },
  { kind: 'provenance', re: /\bverified against prod(uction)?\b/i },
  { kind: 'provenance', re: /\bread from the live (database|data|db)\b/i },
  { kind: 'provenance', re: /\b(built|drawn) from a panel of\b/i },
  { kind: 'provenance', re: /\bpanel of \d+ (agents|reviewers|critics|experts)\b/i },
  { kind: 'provenance', re: /\bthe (critics|reviewers|panel|agents) (killed|cut|rejected|struck)\b/i },
  { kind: 'provenance', re: /\b(Claude|the AI|the model) (drafted|wrote|generated)\b/i },

  // Editorial narration: the page describing itself
  { kind: 'narration', re: /\bthe (blocks?|sections?|parts?|bits?) that needs? explaining\b/i },
  { kind: 'narration', re: /\bcent(re|er)piece\b/i },
  { kind: 'narration', re: /\bwhat comes off,? on purpose\b/i },
  { kind: 'narration', re: /\bworth more than (any|all) of the above\b/i },

  // Stage directions: scripting the people who use the page
  { kind: 'script', re: /\b(said|say|read|reads) (it |this |them )?out loud\b/i },
  { kind: 'script', re: /\bwalk (over )?to the (desk|table|whiteboard|couch|kitchen)\b/i },
  { kind: 'script', re: /\bholds? the pen\b/i },
]

// Keys whose string values are page text in the Notion MCP write tools:
// create-pages pages[].content, update-page content / new_str /
// content_updates[].new_str, and create-comment markdown.
const TEXT_KEYS = new Set(['content', 'new_str', 'markdown'])

// Collects the text a Notion write would put on the page.
export function notionText(input) {
  const out = []
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (TEXT_KEYS.has(key)) out.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key)
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    }
  }
  walk(input, '')
  return out.join('\n')
}

// Returns each line that matches a pattern, once, with the first kind it matched.
export function findMetaLines(text) {
  const hits = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const match = PATTERNS.find((p) => p.re.test(line))
    if (match) hits.push({ line: line.length > 160 ? line.slice(0, 157) + '…' : line, kind: match.kind })
  }
  return hits
}

// Names the page a write targets, so a second write to the same page is recognised.
export function targetKey(input) {
  if (typeof input.page_id === 'string') return input.page_id
  const parent = input.parent && (input.parent.page_id || input.parent.data_source_id || input.parent.database_id)
  return String(parent || input.tool || 'notion')
}
