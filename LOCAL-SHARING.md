# Run Japan, together on your computer

You do not need a hosting account. Your computer runs the password-protected app; Cloudflare Quick Tunnel provides a temporary HTTPS address that Daniella can open from anywhere.

## One-time preparation

1. Install **Node.js 24** from <https://nodejs.org/en/download>.
2. Install **cloudflared**, Cloudflare’s tunnel program. On a Mac with Homebrew: `brew install cloudflared`. On Windows with winget: `winget install --id Cloudflare.cloudflared --exact`. Official installers for other setups are at <https://github.com/cloudflare/cloudflared/releases/latest>.
3. Extract `japan-together-local.zip`. Open a terminal in the extracted `japan-together` folder. The download already includes the built app and fonts: no `npm install` is needed.

## Each planning session

In the first terminal, run:

```sh
node scripts/start-local.mjs
```

Choose and confirm a password of at least 16 characters. Nothing appears while you type; that is intentional. The password stays in the running process and is not saved in a file.

Wait for **“Private app ready”**. You can now open the local address printed in your terminal. The login name is **charlie-and-daniella**.

Only after the app is ready, open a second terminal and run:

```sh
cloudflared tunnel --url http://127.0.0.1:3000
```

Cloudflare prints an **`https://…trycloudflare.com`** address. Send that HTTPS address to Daniella; she uses the same login name and the password you chose. Communicate the password separately from the link. A Quick Tunnel normally does not need a Cloudflare account or a domain.

Keep both terminals open and your computer awake and connected to the internet. Press **Ctrl+C in the tunnel terminal first**, then in the app terminal, when finished. Stop the tunnel if the app exits unexpectedly. The link only works while both are running.

The app binds to your own computer’s loopback interface and requires authentication for the page and every asset. There is no router port-forwarding step. Share the Cloudflare **HTTPS** address, not your computer’s local address.

## Keep your decisions between sessions

Before stopping, each person should use **Share our trip → Download plan**. Quick Tunnels normally create a new address on restart, and a new address has a separate browser storage area. At the next address, use **Share our trip → Open plan file** to restore the downloaded plan.

The app’s share links are snapshots, not live synchronisation. Send an updated snapshot when you want to exchange decisions during a session. Old snapshot links stop working when their tunnel closes; downloaded plan files can be opened at the new address. Importing replaces the current device’s plan after confirmation.

For an address that stays the same across sessions, a named tunnel/custom domain or persistent private hosting is a later option.

## If something does not start

- **“node” not found:** install Node.js, then open a new terminal.
- **“cloudflared” not found:** install it, then open a new terminal.
- **Port 3000 is occupied:** stop the other app using that port. Do not start the tunnel until this app reports “Private app ready”.
- **Tunnel errors:** the network/firewall may block tunnel connections, or an existing cloudflared configuration may conflict with Quick Tunnel mode. Consult the official cloudflared guidance; do not overwrite existing configuration blindly.
- **Both terminals are running but the URL fails:** allow initial tunnel connection to finish; check its connection messages. The download’s local server has been tested here, but a real tunnel must be tested on your own computer/network.

## Research status

The 40 experiences and three itineraries remain a clearly labelled research draft. Current venue calendars, availability and November 2026 details still need official-source verification. Local hosting does not change that status.
