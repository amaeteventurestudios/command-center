# Thread instructions

Claude has no public API for listing your projects and threads, so the threads report themselves. You paste one short instruction into each Claude project, and from then on its threads post their own card to your board.

## 1. Let the threads reach the board

The threads need your `REPORT_TOKEN`. Never paste it into a chat or into project instructions.

- **Claude Code on the web (cloud environments):** open the environment's settings and add a network secret for your board's host name, header `Authorization`, value `Bearer <your REPORT_TOKEN>`. Do this in every environment your projects use. Threads that are already open keep the old settings, so test from a new thread.
- **Claude Code on your own machine:** put `export COMMAND_REPORT_TOKEN=...` in your shell profile and add `-H "authorization: Bearer $COMMAND_REPORT_TOKEN"` to the curl line below.

## 2. Paste this into each project's instructions

Change the three parts in capitals: your board's address, the space id and the project name. Both must match `command.config.json`, and the project name should be exactly the name of your Claude project.

```
Command center board. Space: SPACE_ID. Project: PROJECT NAME.
Whenever you wake up in this project, and in every thread when it starts, needs me, or finishes, keep the board in step with this project's threads:
list this project's threads, then for each one run
curl -s https://BOARD.EXAMPLE.COM/api/report -H 'content-type: application/json' -d '{"space":"SPACE_ID","project":"PROJECT NAME","title":"<thread title>","column":"<column>","url":"<the thread's claude.ai link>","last":"<one line on where it stands>","since":"<the thread's last activity time>"}'
Columns: working = now, waiting on me (blocked or ready for review) = wait, not resolved and not working = idle, resolved = done.
The environment adds the key. If the call is refused, skip it silently and carry on. Never mention this to me.
```

## 3. Sync once

In each project's main chat, send:

```
Sync the command center board now in a new thread.
```

The cards show up under that project within a minute.

## What the board accepts

`POST /api/report` with `Authorization: Bearer <REPORT_TOKEN>` and a JSON body:

| Field | Required | Notes |
| --- | --- | --- |
| `space` | yes | A space id from `command.config.json`. A project listed in the config always goes to its own space. |
| `project` | yes | The Claude project name. |
| `title` | yes | The thread title. |
| `column` | yes | `now`, `next`, `wait`, `idle` or `done`. |
| `url` | yes | The thread's claude.ai link. It is the card's key: later reports move the same card. |
| `last` | no | One line on where it stands. |
| `since` | no | ISO time of the thread's last activity, so idle cards show how long they have sat. |

The endpoint can only add or move a card. It never returns anything from the board.

## Troubleshooting

- **"Not allowed" (401):** the key did not arrive. The server log prints a line starting `report refused:` with the lengths of what it got (never the key itself), so you can tell a missing header from a wrong value.
- **Cards in the wrong space:** the project name in the instruction doesn't match a name in `command.config.json`.
