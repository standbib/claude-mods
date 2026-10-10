# gate-board

A Claude Code mod that answers "what's waiting on me?" Type `/gate` and a pane opens with:

- **Pull requests**: each open PR, whether its checks pass, and what its description says about the review panel.
- **Deploy gate**: edge functions whose code on `main` isn't live yet (comment-only changes don't count), functions on `main` that were never deployed, functions still live after being deleted from `main`, and migrations on `main` missing from the database's migration history.
- **Not published yet**: site changes merged to `main` since your last Lovable publish. Say "I published" in chat, or press `p` in the pane, after each publish.

Press `r` to refresh and Esc to close.

Install once, from any terminal session of Claude Code:

```
/plugin install gate-board --marketplace standbib/claude-mods
```

It needs `git` and `gh` signed in. The deploy gate needs a linked Supabase project (`supabase/.temp/project-ref`) and an access token in `SUPABASE_ACCESS_TOKEN` or `~/.supabase/access-token`. Every call it makes is read-only, and the token is sent only to `api.supabase.com`.
