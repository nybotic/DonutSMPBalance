# DonutSMPBalance

DonutSMPBalance is an Equicord/Vencord user plugin that shows a player's DonutSMP money balance beside their Discord chat username when their DonutSMP server nickname matches a Minecraft username.

Made and maintained by [Nybotic](https://github.com/nybotic).

## Features

- Displays DonutSMP balances inline next to chat usernames.
- Uses DonutSMP Discord nicknames to find matching Minecraft accounts.
- Works outside the DonutSMP server by requesting the author's DonutSMP guild member record when available.
- Caches balance lookups for 10 minutes to avoid repeated DonutStats requests.
- De-duplicates in-flight lookups so the same player is only fetched once at a time.

## Install

Clone this repository into your Equicord user plugins folder:

```sh
git clone https://github.com/nybotic/DonutSMPBalance src/userplugins/donutSMPBalance
```

Then rebuild or restart Equicord and enable `DonutSMPBalance` in plugin settings.

## How It Works

1. The plugin reads the message author's DonutSMP server nickname.
2. It extracts a valid Minecraft username from that nickname.
3. It asks DonutStats for the player's balance.
4. If DonutStats returns a money value, the plugin renders it beside the username.

The lookup endpoint is:

```text
https://donutstats.org/player.php?user=<player>
```

## Limitations

- The author must be a member of the DonutSMP Discord server.
- The author's DonutSMP nickname must contain a valid Minecraft username.
- Missing players, private data, or DonutStats errors simply hide the balance.
- Balances may be up to 10 minutes old because of caching.

## Development

This plugin has two main files:

- `index.tsx` contains the chat decoration UI, nickname parsing, guild member requests, and caching.
- `native.ts` performs the DonutStats network request from the native side.

Keep the plugin lightweight: chat decorations render often, so avoid extra store reads, repeated network calls, or long-running work in React render paths.

## Troubleshooting

- If no balance appears, confirm the user has a DonutSMP server nickname that includes their Minecraft name.
- If balances disappear for everyone, DonutStats may be unavailable or may have changed its page markup.
- Restart Equicord after editing native plugin code.
