# Multiplayer Gomoku (Five in a Row) Web 

Quick local multiplayer Gomoku (Five in a Row) scaffold using Node.js + Socket.IO.

Run locally:

```bash
cd backgammon-web
npm install
npm start
# open http://localhost:3000 and create/join a room
```

Share with other machines (different Wi‑Fi)

- Temporary public URL (no signup):

```bash
# with localtunnel (started for you by the repository with `npm run start:tunnel`)
npx --yes localtunnel --port 3000
# it prints a public URL like https://abcd.loca.lt — share that with friends
```

- Stable public URL (signup required):

```bash
# sign up at https://ngrok.com and set your token once
ngrok authtoken YOUR_TOKEN
ngrok http 3000
# ngrok prints an https URL you can share
```

Environment variables / scripts

- `ENABLE_TUNNEL=1 node server.js` or `npm run start:tunnel` — starts the server and opens a `localtunnel` public URL automatically.
- `PORT` — change listening port, default is `3000`.

Example: start server with tunnel (one-liner):

```bash
cd backgammon-web
npm install
npm run start:tunnel
# wait for the printed `Public URL:` then open it in any browser
```

Usage example

1. Open the URL (localhost or public tunnel) in two browsers or two computers.
2. In one browser click `Create Room` (you can pick board size). The creator will auto-join.
3. In the other browser paste the Room ID and click `Join Room`.
4. Play Gomoku — the game auto-starts when two players join. After a win the server records the winner and immediately starts a new round; scores and recent win history appear in the UI.

Notes

- The app stores rooms in memory; restarting the server clears rooms and history. If you want persistence, add a small file- or DB-backed store.
- The repository includes a convenience `Undo` button that lets the player who last moved undo their move before the opponent plays.
- For development, run the server locally and open the browser console to see logs.
