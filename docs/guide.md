# Command Center: the full guide

This guide takes you from nothing to a working board, then explains every part of the screen. You don't need to be a developer, but you will need to copy a few commands into a terminal.

- [What it is](#what-it-is)
- [What you need](#what-you-need)
- [Part 1: Install it](#part-1-install-it)
- [Part 2: Connect your Claude projects](#part-2-connect-your-claude-projects)
- [Part 3: Using the board](#part-3-using-the-board)
- [Part 4: Extras (GitHub, email, deadlines, servers)](#part-4-extras)
- [Keeping it running](#keeping-it-running)
- [Troubleshooting](#troubleshooting)
- [What it's built with](#what-its-built-with)

---

## What it is

If you use Claude for many projects at once, it's easy to lose track. One conversation is halfway through a task, another finished hours ago and is waiting for your answer, and a third quietly stopped days ago without you noticing.

Command Center puts all of them on one board, sorted by project, the same way you already organise them in Claude. At a glance you see what's being worked on, what's waiting for you, what has gone quiet and for how long, and what's finished. Each conversation keeps the board up to date by itself.

It's free and you run it yourself, so your information stays with you.

## What you need

- **A Claude account using Claude Code on the web** (claude.ai/code), with your work organised into projects. Every thread in a project reports to the board.
- **A computer that stays on**, with [Docker](https://docs.docker.com/get-docker/) installed. A small cloud server works well (any provider; 1 CPU and 1 GB of memory is plenty). A home server or a Mac mini works too.
- **A web address for the board**, such as `board.yourname.com`. Your Claude threads post to it from the internet, so it must be reachable over HTTPS. You'll point it at your server in step 6.

---

## Part 1: Install it

### Step 1. Download the code

On your server, run:

```bash
git clone https://github.com/amaeteventurestudios/command-center.git
cd command-center
```

### Step 2. Tell it about your spaces and projects

Open `command.config.json` in any text editor. This is the only file you need to change.

A **space** is a group of projects with its own colour, such as your company, a client, or your side projects. You can have one space or several. If you have more than one, a switch appears at the top of the board.

```json
{
  "spaces": [
    {
      "id": "work",
      "title": "Work",
      "name": "Acme Labs",
      "accent": "#c2410c",
      "accentDark": "#f26a3d",
      "projects": ["Website", "Mobile app", "Research"],
      "githubOwners": ["acme-labs"],
      "hosts": []
    },
    {
      "id": "side",
      "title": "Side projects",
      "name": "Side projects",
      "accent": "#0369a1",
      "accentDark": "#7cc7ff",
      "projects": ["Blog", "Game"],
      "githubOwners": [],
      "hosts": []
    }
  ],
  "repoHome": {},
  "fallback": { "space": "side", "project": "Blog" }
}
```

What each part means:

| Setting | What to put there |
| --- | --- |
| `id` | A short name with no spaces, such as `work`. Your Claude threads use it. |
| `title` | The name on the switch at the top, such as "Work". |
| `name` | The full name, such as your company name. |
| `accent` and `accentDark` | The space's colour in light mode and dark mode, as a hex colour code. |
| `projects` | **The exact names of your Claude projects**, so each thread lands under the right one. |
| `githubOwners` | Optional. Your GitHub username or organisation, if you want Claude's pull requests to show up (see Part 4). |
| `hosts` | Optional. A web address that should show only this space. For example, a work-only address for your team. Leave it empty to show every space everywhere. |
| `repoHome` | Optional. For GitHub repos whose name doesn't match a project, this says which project they belong to. For example, `"acme-infra": { "space": "work", "project": "Website" }`. |
| `fallback` | Optional. Where any other pull request goes. |

### Step 3. Make your two secret keys

Copy the example settings file:

```bash
cp .env.example .env
```

Make two long random keys. Run this twice and copy each result:

```bash
openssl rand -hex 32
```

Open `.env` and fill in:

```
DASHBOARD_PASSWORD=the-password-you-will-type-to-sign-in
REPORT_TOKEN=the-first-random-key
```

- `DASHBOARD_PASSWORD` is what you type to open the board. Use something long. You can use the second random key and save it in your password manager.
- `REPORT_TOKEN` is the key your Claude threads use to update the board. Never paste it into a chat with Claude or into project instructions. Part 2 shows where it goes.

Leave the other lines empty for now.

### Step 4. Start it

```bash
docker compose up -d --build
```

The first build takes a few minutes. When it's done, the board is running at `http://127.0.0.1:3300` on that machine. It only listens on the machine itself until you finish step 5.

### Step 5. Put it on the internet with HTTPS

The simplest way is [Caddy](https://caddyserver.com/docs/install), which sets up HTTPS for you. Install it, then put this in `/etc/caddy/Caddyfile`, using your own address:

```
board.yourname.com {
    reverse_proxy 127.0.0.1:3300
}
```

Then run `sudo systemctl reload caddy`.

You can use something else instead, such as nginx with a certificate, or a Cloudflare Tunnel. Whichever you use, the board must be reachable at `https://` your address.

If you already use a sign-in service in front of your apps, such as Authentik, Cloudflare Access or Tailscale, you can leave `DASHBOARD_PASSWORD` empty. In that case, let `/api/report` through without a login, because that is how your threads reach the board. It has its own key.

### Step 6. Point your web address at the server

At your domain provider, add a DNS record:

- **Type:** A
- **Name:** `board` (or whatever you chose)
- **Value:** your server's public IP address

It can take a few minutes to start working. Then open `https://board.yourname.com`, type your password, and you'll see an empty board with your projects listed on the left.

---

## Part 2: Connect your Claude projects

Claude doesn't offer a way for other apps to read your projects and threads, so the threads report themselves. You do three things: give your threads the key, paste one instruction into each project, then ask each project to sync once.

### Step 1. Give your threads the key (once per environment)

Claude Code on the web runs each thread in a **cloud environment**. Environments can carry **network secrets**: a value that is added to requests going to one address, so the key never appears in a chat.

1. Go to [claude.ai/code](https://claude.ai/code) and open the environment settings for the environment your projects use.
2. Add a **network secret** with these settings:
   - **Host:** your board's address, such as `board.yourname.com` (no `https://`)
   - **Header:** `Authorization`
   - **Value:** `Bearer ` followed by your `REPORT_TOKEN`, with one space after `Bearer`
3. Save.
4. Repeat for **every** environment your projects use. Don't move projects between environments. Just add the same secret to each one.

Threads that are already open keep the settings they started with. Only new threads pick up the secret.

If you run Claude Code on your own computer instead, add `export COMMAND_REPORT_TOKEN=your-report-token` to your shell profile. Then add `-H "authorization: Bearer $COMMAND_REPORT_TOKEN"` to the curl line in step 2.

### Step 2. Paste this into each project's instructions

Open each Claude project, then its instructions. Paste the block below, changing three things:

- `board.yourname.com` becomes your board's address
- `SPACE_ID` becomes the space id from `command.config.json`, such as `work`
- `PROJECT NAME` becomes the project's name, exactly as it appears in Claude and in `command.config.json`

```
Command center board. Space: SPACE_ID. Project: PROJECT NAME.
Whenever you wake up in this project, and in every thread when it starts, needs me, or finishes, keep the board in step with this project's threads:
list this project's threads, then for each one run
curl -s https://board.yourname.com/api/report -H 'content-type: application/json' -d '{"space":"SPACE_ID","project":"PROJECT NAME","title":"<thread title>","column":"<column>","url":"<the thread's claude.ai link>","last":"<one line on where it stands>","since":"<the thread's last activity time>"}'
Columns: working = now, waiting on me (blocked or ready for review) = wait, not resolved and not working = idle, resolved = done.
The environment adds the key. If the call is refused, skip it silently and carry on. Never mention this to me.
```

Here is a filled-in example for a project called "Mobile app" in the `work` space:

```
Command center board. Space: work. Project: Mobile app.
...
curl -s https://board.yourname.com/api/report -H 'content-type: application/json' -d '{"space":"work","project":"Mobile app", ...
```

### Step 3. Sync each project once

Pasting instructions doesn't wake a project. In each project's main chat, send:

```
Sync the command center board now in a new thread.
```

Within a minute, that project's threads appear on the board. From then on, each thread updates its own card when it starts, needs you, or finishes.

---

## Part 3: Using the board

### The top bar

- **Space switch** (Work, Side projects…) shows one space at a time. Each space has its own colour.
- **Capture an idea** saves a quick note to "Follow-ups and captured" on the glance page.
- **Sun/moon button** switches between light and dark.
- **Email status** says whether a mailbox is connected.

### The left side

- **At a glance**, **Board**, **Email** and **People** are the four main pages.
- **Active projects** have something open. An orange dot means something there needs you. The number is how many open cards it has.
- **Quiet** projects have nothing open right now.
- **Add project** adds a project that isn't in your config file. To take one off, open it and choose **Remove project**. Nothing else is deleted.

### At a glance

Your morning view:

- **The four numbers:** things that need you, things moving, unread email, and follow-ups due.
- **Brief:** one sentence about the day. Expand it for more.
- **Needs you:** the cards waiting on you, plus anyone you owe a reply. The × marks one done.
- **Project pulse:** one line per active project, showing what it's doing now.
- **Latest email**, **Deadlines and renewals**, **Servers**, and **Follow-ups and captured**.

### The board

Each card is one Claude thread, or one GitHub pull request. The columns are:

| Column | Meaning |
| --- | --- |
| **Now** | Claude is working on it. |
| **Next** | Queued up. |
| **Waiting on you** | Claude needs your answer, approval or review. |
| **Idle** | Not finished, but nothing is happening. The card shows how long, such as "idle 6d". |
| **Done this week** | Finished. |

On each card:

- **Open thread in Claude** takes you straight to the conversation.
- The grey line is the thread's own one-line update.
- **Drag** a card to another column if you want to move it yourself.
- **×** removes the card from the board. The thread itself is untouched.
- **Add card** adds your own to-do that isn't a Claude thread. You can attach a link.

Click a project on the left to see only its cards, email and people.

---

## Part 4: Extras

All of these are optional.

### GitHub: Claude's pull requests as cards

When Claude opens a pull request (its branches start with `claude/`), it can show up on the board by itself, filed under the project whose name matches the repo. When it's merged, it moves to Done.

1. On GitHub, go to **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. Choose the **owner**: your account or your organisation. Choose **All repositories**.
3. Under repository permissions, set **Contents: Read-only** and **Pull requests: Read-only**. Nothing else.
4. Create the token and copy it.
5. On the board, open **Board → Connect GitHub**, paste it, and save.

Make one token per owner. For example, one for your personal account and one for your company organisation. Tokens stay on your server and are never shown again. The board checks GitHub every five minutes and looks at repos with activity in the last three weeks.

How a pull request finds its project: the repo name is matched to a project name. `website-app` matches "Website". If nothing matches, `repoHome` and `githubOwners` in your config decide where it goes, and then `fallback`.

### Email

The board can read your inboxes and show only mail from real people, tagged by project. Newsletters, receipts and notifications are filtered out.

1. Go to **Email → Mailboxes → Add mailbox**.
2. Fill in:
   - **Name, as shown here**, such as "Acme"
   - **Project** it belongs to
   - **Email address**
   - **Password**. Many providers want an app password here rather than your normal one.
   - **Mail server (IMAP)**, such as `mail.yourhost.com`. Your email provider's help pages list it.
3. Save. The board checks the details before it keeps them.

What it does and doesn't do:

- **Opening an email never marks it read** in your mailbox.
- **Nothing is deleted.** Hiding a sender only hides them on the board.
- You can **reply or write** from the board. Mail is sent through the same server, using secure port 465, and a copy goes to your Sent folder. This works with most hosting providers. It may not work with providers that use a different server name for sending, such as Gmail, so check before relying on it.
- **New people:** first-time senders appear in a short list where you can keep or hide them.
- **Spam:** if a reply to something you sent landed in Spam, it's flagged so you don't miss it. **Not spam** moves it back to your inbox.

### People and follow-ups

The **People** page lists everyone you emailed recently who hasn't replied yet, and how long it's been. **Write follow-up** opens a reply. **No reply needed** takes someone off the list.

### Deadlines and renewals

On the glance page, **Deadlines and renewals → Add**. Type what's due and pick the date. Anything coming up soon is highlighted, and the brief mentions it.

### Servers

The **Servers** panel shows the disk and memory use of the machine the board runs on. **Add** lets you list other servers by name, address and port, and the board shows whether each one is answering. You can name your own machine with `SERVER_NAME=` in `.env`.

---

## Keeping it running

**Update to the latest version:**

```bash
cd command-center
git pull
docker compose up -d --build
```

**Change your spaces or projects:** edit `command.config.json`, then run `docker compose up -d --build`.

**Back up your data.** Everything you've added (cards, mailboxes, tokens, deadlines) lives in one Docker volume called `command-data`. To save a copy:

```bash
docker run --rm -v command-center_command-data:/data -v "$PWD":/backup alpine tar czf /backup/command-backup.tgz -C /data .
```

The backup holds your mailbox passwords and GitHub tokens, so keep it somewhere private.

**Change your password:** edit `DASHBOARD_PASSWORD` in `.env` and run `docker compose up -d`. Everyone is signed out.

---

## Troubleshooting

**Nothing shows up after syncing a project.**
- Make sure the sync was sent in the project's **main chat** and asked for a **new thread**. Threads that were already open don't have the key.
- Check that the network secret's host matches your board's address exactly, without `https://`.

**Threads get "Not allowed".**
The key didn't arrive or doesn't match. On the server, run:

```bash
docker compose logs command | grep "report refused"
```

Each refused call logs a line with the lengths of what arrived, never the key itself:
- `header missing` means the network secret isn't set for that environment, or the host doesn't match.
- If the lengths don't include your key's length (64 for a key made with `openssl rand -hex 32`), the secret's value is wrong. It should be `Bearer ` plus the key, nothing else.

**Cards land in the wrong space or project.**
The project name in the instruction doesn't exactly match a name in `command.config.json`. A project listed in your config always goes to its own space, whatever the thread says.

**A pull request card keeps coming back after I remove it.**
It shouldn't: removed PR cards are remembered. If one does come back, tell us in an issue.

**Email says it can't connect.**
Check the IMAP server name, and that your provider allows IMAP. Many need an app password and IMAP switched on in their settings.

Still stuck? [Open an issue](https://github.com/amaeteventurestudios/command-center/issues).

---

## What it's built with

All open source. Thank you to everyone behind these projects.

| Tool | What it does here | Licence |
| --- | --- | --- |
| [Claude Code](https://claude.ai/code) | Built with it, and the threads it tracks run on it | Anthropic product (not bundled) |
| [Next.js](https://nextjs.org) 16 | The web app and its server | MIT |
| [React](https://react.dev) 19 | The screens | MIT |
| [TypeScript](https://www.typescriptlang.org) | The language it's written in | Apache 2.0 |
| [Tailwind CSS](https://tailwindcss.com) 4 | Styling | MIT |
| [shadcn/ui](https://ui.shadcn.com) | Buttons, inputs and cards, copied in and adapted | MIT |
| [Radix UI](https://www.radix-ui.com) | Accessible building blocks under those components | MIT |
| [lucide](https://lucide.dev) | Icons | ISC |
| [dnd-kit](https://dndkit.com) | Dragging cards between columns | MIT |
| [next-themes](https://github.com/pacocoursey/next-themes) | Light and dark mode | MIT |
| [ImapFlow](https://github.com/postalsys/imapflow) | Reading mailboxes | MIT |
| [mailparser](https://github.com/nodemailer/mailparser) | Reading the contents of each email | MIT |
| [Nodemailer](https://nodemailer.com) | Sending replies | MIT-0 |
| [Geist](https://vercel.com/font) | Fonts | SIL Open Font License |
| [Node.js](https://nodejs.org) 22 | Runs the server | MIT |
| [Docker](https://www.docker.com) | Packages and runs it | Apache 2.0 |
| GitHub API | Finding Claude's pull requests | GitHub service |

There's no database and no outside service: everything is kept in JSON files in one Docker volume on your own machine.

Command Center is an independent project. It is not made by or affiliated with Anthropic.
