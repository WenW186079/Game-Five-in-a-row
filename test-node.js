const { io } = require('socket.io-client');
const fetch = global.fetch || require('node-fetch');

const SERVER = 'http://127.0.0.1:3000';

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function run() {
  const a = io(SERVER);
  const b = io(SERVER);

  a.on('connect', () => console.log('A connected'));
  b.on('connect', () => console.log('B connected'));

  let roomId = null;
  a.emit('createRoom', (res) => {
    roomId = res.roomId;
    console.log('RoomId', roomId);
    a.emit('joinRoom', {roomId, name:'A'}, (r) => {
      console.log('A joined', r.error||'ok', r.color);
      // let B join
      b.emit('joinRoom', {roomId, name:'B'}, (rb) => {
        console.log('B joined', rb.error||'ok', rb.color);
      });
    });
  });

  a.on('stateUpdate', async (st) => {
    console.log('A stateUpdate status=', st.status);
    if (st.status === 'in-progress') {
      console.log('Game started, A will play at 7,7');
      a.emit('makeMove', {roomId, x:7, y:7}, (res) => {
        console.log('A move response', res);
      });
    }
  });

  b.on('stateUpdate', (st) => {
    console.log('B stateUpdate status=', st.status);
  });

  // fallback: after some seconds, query /room
  await sleep(3000);
  // find any room by listing rooms is not available; use the one from server via first create
  // Instead, poll server debug endpoint by checking server memory (not available). So just exit.
  setTimeout(()=>{ console.log('Test finished'); process.exit(0); }, 3000);
}

run().catch(e=>{ console.error(e); process.exit(1); });
