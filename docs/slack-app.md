# Slack app setup

offon talks to your workspace for three things: **login codes**, **notifications**, and **slash commands**. All three run through one Slack app that you create and own — there is no shared offon Slack app, and no data leaves your deployment.

You need to be able to install apps in the workspace. If you can't, ask a Workspace Owner or Admin — installing is the only step that needs their permission.

**Time: about 5 minutes.**

---

## 1. Create the app from a manifest

Go to <https://api.slack.com/apps> → **Create New App** → **From an app manifest**, pick your workspace, choose **YAML**, and paste this in.

Replace `YOUR-DOMAIN` with the domain your app will be reachable at (for Vercel, that's `your-project.vercel.app` — you can come back and change it later).

```yaml
display_information:
  name: offon
  description: Attendance and leave, handled from Slack
  background_color: "#101014"
features:
  bot_user:
    display_name: offon
    always_online: true
  slash_commands:
    - command: /hi
      url: https://YOUR-DOMAIN/api/slack/commands
      description: Clock in
      should_escape: false
    - command: /bye
      url: https://YOUR-DOMAIN/api/slack/commands
      description: Clock out
      should_escape: false
    - command: /lunch
      url: https://YOUR-DOMAIN/api/slack/commands
      description: Start a meal (60 minutes, returns on its own)
      should_escape: false
    - command: /break
      url: https://YOUR-DOMAIN/api/slack/commands
      description: Step away from your desk
      should_escape: false
    - command: /back
      url: https://YOUR-DOMAIN/api/slack/commands
      description: Return from a break
      should_escape: false
oauth_config:
  scopes:
    bot:
      - chat:write
      - im:write
      - commands
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

### What each scope is for

offon asks for three scopes and nothing else. It never reads your messages — there are no `*:read` or `*:history` scopes here.

| Scope | Why offon needs it | Slack API used |
|-------|--------------------|----------------|
| `chat:write` | Send DMs and channel announcements, and schedule the "back from meal" notice an hour ahead | `chat.postMessage`, `chat.scheduleMessage`, `chat.deleteScheduledMessage` |
| `im:write` | Open a DM channel with a person so their login code can reach them | `conversations.open` |
| `commands` | Receive `/hi`, `/bye`, `/lunch`, `/break`, `/back` | — |

## 2. Install it and copy the two secrets

**Install to Workspace** on the app's *Basic Information* page, then collect:

| Where in Slack | Copy into |
|----------------|-----------|
| *OAuth & Permissions* → **Bot User OAuth Token** (`xoxb-…`) | `SLACK_BOT_TOKEN` |
| *Basic Information* → *App Credentials* → **Signing Secret** | `SLACK_SIGNING_SECRET` |

The signing secret is what lets offon prove an incoming slash command really came from Slack. Requests that don't verify are rejected.

## 3. Pick an announcement channel

Clock-in / clock-out events are announced in one channel so the team can see who's around. Create or choose it, then **invite the bot**:

```
/invite @offon
```

Copy that channel's ID (bottom of the channel's *About* pane, starts with `C`) into `SLACK_OFFON_CHANNEL`.

> The bot must be a member of that channel. offon doesn't request `chat:write.public`, so Slack rejects posts to channels the bot hasn't joined — this is the most common setup mistake.

## 4. Give the first admin their Slack ID

Login codes are DM'd to a member's Slack ID, so every member record stores one. The first admin's comes from `SEED_ADMIN_SLACK_ID` and is used by `pnpm db:seed`; everyone else is added later from the in-app **members** page.

To find a member ID: click the person → **⋮ (More)** → **Copy member ID**. It starts with `U`.

## 5. Check it

Once deployed, type `/hi` in any channel. You should be clocked in, and the announcement should land in your chosen channel.

---

## Troubleshooting

| Symptom | Cause |
|---------|-------|
| `dispatch_failed` or a timeout on a slash command | The Request URL isn't reachable. Slack needs a public HTTPS URL — a `localhost` dev server won't work without a tunnel. |
| Slash command works, but no channel announcement | The bot isn't in `SLACK_OFFON_CHANNEL`. Run `/invite @offon` there. |
| Login code never arrives | That member's Slack ID is wrong or empty. Check it on the members page. |
| `invalid_auth` in the logs | `SLACK_BOT_TOKEN` is wrong, or the app was reinstalled and the token rotated. Copy the current one. |
| Slash commands rejected as unverified | `SLACK_SIGNING_SECRET` doesn't match the app. |

## Developing locally

Slash commands need a public HTTPS URL, so point them at a tunnel while you work:

```bash
# e.g. with cloudflared
cloudflared tunnel --url http://localhost:3000
```

Put the tunnel's URL in the app's slash-command Request URLs. DMs and notifications need no tunnel — they're outbound calls to Slack and work from anywhere.
