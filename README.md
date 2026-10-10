# claude-mods

Claude Code mods (plugins). Install any of them once, from the prompt of a terminal
Claude Code session:

```
/plugin install <mod> --marketplace standbib/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. The mod is active from then
on in every terminal session.

| Mod | What it does |
| --- | --- |
| `remote-control-toggle` | Shows whether Remote Control is on, as a label in the footer under the prompt (or a band with a toggle button). Adds `/rc-status`. |
| `gate-board` | `/gate` opens a pane of what is waiting on you: open PRs with their checks, edge functions whose code on `main` isn't live, migrations missing from the database's history, and site changes since your last publish. Built for a Supabase + Lovable repo. |
| `voice-check` | Holds a Notion write that reads as meta commentary (changelog, how the page was made, defending its own choices, stage directions) and sends it back to Claude to rewrite. |
