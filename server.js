const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

// Debug endpoint: view room state
app.get('/room/:id', (req, res) => {
  const r = rooms[req.params.id];
  if (!r) return res.status(404).json({error: 'not found'});
  return res.json(r.state);
});

const PORT = process.env.PORT || 3000;

// In-memory rooms: { roomId: { players: [socketId,...], state: {...} } }
const rooms = {};

function initialBoard(size = 15) {
  const board = Array(size).fill(null).map(() => Array(size).fill(null));
  return {
    size,
    board,
    players: {}, // socketId -> {name, color}
    order: [], // socket ids in join order
    turn: 'black',
    lastMove: null,
    history: [],
    winner: null,
    status: 'waiting',
    scores: { black: 0, white: 0 },
    winHistory: []
  };
}

function checkWin(board, x, y, color) {
  const dirs = [ [1,0], [0,1], [1,1], [1,-1] ];
  const n = board.length;
  for (const [dx,dy] of dirs) {
    let cnt = 1;
    for (let s=1;s<5;s++) {
      const nx = x + dx*s, ny = y + dy*s;
      if (nx<0||ny<0||nx>=n||ny>=n) break;
      if (board[ny][nx]===color) cnt++; else break;
    }
    for (let s=1;s<5;s++) {
      const nx = x - dx*s, ny = y - dy*s;
      if (nx<0||ny<0||nx>=n||ny>=n) break;
      if (board[ny][nx]===color) cnt++; else break;
    }
    if (cnt>=5) return true;
  }
  return false;
}

io.on('connection', socket => {
  socket.on('createRoom', (opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    const requestedSize = opts && Number(opts.size);
    let size = 15;
    if (!Number.isNaN(requestedSize) && Number.isFinite(requestedSize)) {
      size = Math.max(9, Math.min(25, Math.floor(requestedSize)));
    }
    const roomId = nanoid(6);
    rooms[roomId] = { players: [], state: initialBoard(size) };
    if (typeof cb === 'function') cb({roomId});
  });

  socket.on('joinRoom', (data, cb) => {
    let roomId, name;
    if (typeof data === 'string') roomId = data;
    else if (data && data.roomId) { roomId = data.roomId; name = data.name; }
    else { return cb && cb({error: 'invalid args'}); }
    const room = rooms[roomId];
    if (!room) return cb && cb({error: 'Room not found'});
    if (!room.order) room.order = [];
    if (room.order.length >= 2) return cb && cb({error: 'Room full'});
    socket.join(roomId);
    const color = room.order.length === 0 ? 'black' : 'white';
    room.order.push(socket.id);
    room.state.players[socket.id] = {name: name || color, color};
    if (room.order.length === 2) {
      room.state.status = 'in-progress';
      room.state.turn = 'black';
    }
    // log join
    console.log('[join] room=%s order=%d players=%s status=%s', roomId, room.order.length, Object.values(room.state.players).map(p=>p.name).join(','), room.state.status);
    // always emit full state so clients stay synchronized
    io.to(roomId).emit('stateUpdate', room.state);
    cb({ok:true, color, state: room.state});
  });

  socket.on('makeMove', ({roomId, x, y}, cb) => {
    const room = rooms[roomId];
    if (!room) return cb && cb({error:'room not found'});
    const st = room.state;
    if (st.winner) return cb && cb({error:'game over'});
    if (st.status !== 'in-progress') return cb && cb({error:'game not started'});
    const player = st.players[socket.id];
    if (!player) return cb && cb({error:'not in room'});
    if (player.color !== st.turn) return cb && cb({error:'not your turn'});
    const n = st.size;
    if (x<0||y<0||x>=n||y>=n) return cb && cb({error:'invalid move'});
    if (st.board[y][x] !== null) return cb && cb({error:'cell occupied'});
    st.board[y][x] = player.color;
    const mv = {x,y,color:player.color};
    st.history.push(mv);
    st.lastMove = mv;
    console.log('[move] room=%s by=%s name=%s color=%s x=%d y=%d status=%s', roomId, socket.id, player.name, player.color, x, y, st.status);
    // check win
    if (checkWin(st.board, x, y, player.color)) {
      // record win
      const winnerRecord = {
        color: player.color,
        name: player.name,
        when: Date.now(),
        size: st.size
      };
      st.winHistory = st.winHistory || [];
      st.winHistory.push(winnerRecord);
      st.scores = st.scores || { black: 0, white: 0 };
      st.scores[player.color] = (st.scores[player.color] || 0) + 1;
      // start a new round immediately: clear board and history but keep players/order
      const n = st.size;
      st.board = Array(n).fill(null).map(() => Array(n).fill(null));
      st.history = [];
      st.lastMove = null;
      st.winner = null;
      st.status = 'in-progress';
      st.turn = 'black';
      console.log('[round] new round started in room=%s after win by=%s', roomId, player.name);
    } else {
      st.turn = st.turn === 'black' ? 'white' : 'black';
    }
    io.to(roomId).emit('stateUpdate', st);
    cb && cb({ok:true, state: st});
  });

  socket.on('undoLast', ({roomId}, cb) => {
    const room = rooms[roomId];
    if (!room) return cb && cb({error:'room not found'});
    const st = room.state;
    if (!st.history || st.history.length === 0) return cb && cb({error:'no moves to undo'});
    const player = st.players[socket.id];
    if (!player) return cb && cb({error:'not in room'});
    const last = st.history[st.history.length - 1];
    if (last.color !== player.color) return cb && cb({error:'cannot undo: not your last move'});
    // remove last move
    st.board[last.y][last.x] = null;
    st.history.pop();
    st.lastMove = st.history.length ? st.history[st.history.length - 1] : null;
    st.turn = player.color;
    if (st.winner) { st.winner = null; st.status = 'in-progress'; }
    io.to(roomId).emit('stateUpdate', st);
    if (typeof cb === 'function') cb({ok:true, state: st});
  });

  socket.on('syncRequest', ({roomId}, cb) => {
    const room = rooms[roomId];
    if (!room) return cb && cb({error:'room not found'});
    cb && cb({state: room.state, players: room.state.players});
  });

  socket.on('disconnect', () => {
    // remove from any room
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.order.includes(socket.id)) {
        room.order = room.order.filter(id => id !== socket.id);
        delete room.state.players[socket.id];
        // if less than 2 players, set waiting
        if (room.order.length < 2) {
          room.state.status = 'waiting';
          room.state.winner = null;
        }
        console.log('[disconnect] room=%s removed=%s remaining=%d', roomId, socket.id, room.order.length);
        io.to(roomId).emit('stateUpdate', room.state);
        if (room.order.length===0) delete rooms[roomId];
      }
    }
  });
});

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});

// optionally open a public tunnel (localtunnel) when ENABLE_TUNNEL=1
if (process.env.ENABLE_TUNNEL) {
  (async () => {
    try {
      const localtunnel = require('localtunnel');
      const tunnel = await localtunnel({ port: PORT });
      console.log('Public URL:', tunnel.url);
      tunnel.on('close', () => console.log('Tunnel closed'));
    } catch (err) {
      console.error('Failed to start tunnel:', err && err.message ? err.message : err);
    }
  })();
}
