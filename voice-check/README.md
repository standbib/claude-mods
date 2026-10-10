# voice-check

A Claude Code mod that keeps meta commentary out of Notion pages Claude writes: lines that only make sense because an AI wrote the page.

It holds a Notion write (new page, content update or comment) when a line reads as:

- **Changelog**: "an earlier draft said", "corrected 2026-09-09".
- **How the page was made**: "verified against prod", "read from the live database", "built from a panel of agents".
- **Defending its own choices**: "not decoration, it's the mechanism", "why this and not X".
- **Narration about the page**: "the blocks that need explaining", "the centrepiece".
- **Stage directions**: "said out loud", "walk to the desk".

The first hold goes back to Claude with the flagged lines, and Claude rewrites them. If the same page is held again within 15 minutes, you choose Rewrite or Send anyway. It matches set phrases, so it catches the common kinds and misses subtler ones.

Install once, from any terminal session of Claude Code:

```
/plugin install voice-check --marketplace standbib/claude-mods
```
