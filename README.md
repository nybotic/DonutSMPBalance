# DonutSMPBalance for Equicord

Shows a DonutSMP money balance beside Discord chat usernames.

Made and maintained by [Nybotic](https://github.com/nybotic).

## Install

Clone this repository into your Equicord userplugins folder:

```sh
git clone https://github.com/nybotic/DonutSMPBalance src/userplugins/donutSMPBalance
```

Then rebuild or restart Equicord.

## Usage

- Enable `DonutSMPBalance` in Equicord's plugin settings.
- The plugin checks whether the message author is a member of the DonutSMP Discord server.
- If they have a DonutSMP server nickname, it looks up that name on `https://donutstats.org/player.php?user=`.
- When DonutStats returns a money value, the balance is shown beside their chat username.
