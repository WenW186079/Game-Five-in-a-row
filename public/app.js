const socket = io();

let myColor = null;
let roomId = null;
let state = null;

// make canvas crisp on high-DPI and responsive square
const resizeCanvas = () => {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = Math.min(window.innerWidth * 0.96, window.innerHeight * 0.86);
  boardCanvas.style.width = cssWidth + 'px';
  boardCanvas.style.height = cssWidth + 'px';
  boardCanvas.width = Math.floor(cssWidth * ratio);
  boardCanvas.height = Math.floor(cssWidth * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  render();
};
window.addEventListener('resize', resizeCanvas);

const nameInput = document.getElementById('name');
const createBtn = document.getElementById('create');
const boardSizeInput = document.getElementById('boardSize');
const joinBtn = document.getElementById('join');
const roomInput = document.getElementById('roomId');
const rollBtn = document.getElementById('roll');
const undoBtn = document.getElementById('undo');
const info = document.getElementById('info');
const linkDiv = document.getElementById('link');
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const diceDiv = document.getElementById('dice');
const scoresDiv = document.getElementById('scores');
const historyDiv = document.getElementById('history');

createBtn.onclick = () => {
  const size = parseInt(boardSizeInput.value, 10) || 15;
  socket.emit('createRoom', {size}, (res) => {
    roomId = res.roomId;
    linkDiv.textContent = `Room: ${roomId}`;
    roomInput.value = roomId;
    // auto-join as the creator so you see the board immediately
    socket.emit('joinRoom', {roomId, name: nameInput.value.trim()}, (r) => {
      if (r && r.error) return alert(r.error);
      myColor = r.color;
      state = r.state;
      linkDiv.textContent = `Joined ${roomId} as ${myColor}`;
      render();
    });
  });
};

undoBtn.onclick = () => {
  if (!roomId) return alert('not in a room');
  socket.emit('undoLast', {roomId}, (res) => {
    if (res && res.error) return alert(res.error);
    // state will be updated from stateUpdate event
  });
};

joinBtn.onclick = () => {
  const rid = roomInput.value.trim();
  if (!rid) return alert('enter room id');
  socket.emit('joinRoom', {roomId: rid, name: nameInput.value.trim()}, (res) => {
    if (res.error) return alert(res.error);
    roomId = rid;
    myColor = res.color;
    state = res.state;
    linkDiv.textContent = `Joined ${roomId} as ${myColor}`;
    render();
  });
};

socket.on('stateUpdate', (s) => { state = s; render(); });

socket.on('roomUpdate', ({players, state: s}) => { state = s; render(); });

function render() {
  if (!state) return;
  const size = state.size;
  const ratio = window.devicePixelRatio || 1;
  // when ctx is transformed by `ratio`, drawing coordinates should be in CSS pixels
  const w = boardCanvas.width / ratio;
  const h = boardCanvas.height / ratio;
  ctx.clearRect(0,0,w,h);
  // grid
  ctx.strokeStyle = '#333';
  ctx.lineWidth = Math.max(0.5, Math.min(w,h) / 800);
  const paddingFactor = 0.02; // fraction of cell used as padding (smaller gaps)
  const paddingX = (w/size) * paddingFactor;
  const paddingY = (h/size) * paddingFactor;
  const cellW = (w - paddingX*2) / size;
  const cellH = (h - paddingY*2) / size;
  for (let i=0;i<size;i++) {
    const x = paddingX + (i+0.5) * cellW;
    ctx.beginPath(); ctx.moveTo(x, paddingY + cellH/2); ctx.lineTo(x, h - paddingY - cellH/2); ctx.stroke();
    const y = paddingY + (i+0.5) * cellH;
    ctx.beginPath(); ctx.moveTo(paddingX + cellW/2, y); ctx.lineTo(w - paddingX - cellW/2, y); ctx.stroke();
  }
  // stones
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const v = state.board[y][x];
    if (!v) continue;
    const cx = paddingX + (x+0.5)*cellW;
    const cy = paddingY + (y+0.5)*cellH;
    const radius = Math.min(cellW, cellH) * 0.32; // slightly smaller stones
    ctx.beginPath(); ctx.arc(cx,cy, radius, 0, Math.PI*2);
    ctx.fillStyle = v === 'black' ? '#000' : '#fff';
    ctx.fill(); ctx.strokeStyle='#000'; ctx.lineWidth = Math.max(0.5, radius/8); ctx.stroke();
  }
  info.textContent = `Turn: ${state.turn}` + (state.winner ? ` — Winner: ${state.winner}` : '');
  // enable undo only if lastMove exists and it was made by me and opponent hasn't moved yet
  if (undoBtn) {
    const canUndo = state.lastMove && myColor && state.lastMove.color === myColor && state.turn !== myColor;
    undoBtn.disabled = !canUndo;
  }
  // scores
  if (scoresDiv) {
    const s = state.scores || {black:0,white:0};
    scoresDiv.textContent = `Score: Black ${s.black}   White ${s.white}`;
  }
  // win history (latest first)
  if (historyDiv) {
    const wh = (state.winHistory || []).slice().reverse();
    historyDiv.innerHTML = wh.slice(0,10).map(r => {
      const t = new Date(r.when).toLocaleString();
      return `<div>(${t}) ${r.name} — ${r.color}</div>`;
    }).join('');
  }
}

boardCanvas.addEventListener('click', (ev) => {
  if (!state || !roomId) return;
  if (state.status !== 'in-progress') return alert('Game not in progress');
  const rect = boardCanvas.getBoundingClientRect();
  const px = ev.clientX - rect.left;
  const py = ev.clientY - rect.top;
  const paddingFactor = 0.06;
  const paddingCssX = (rect.width / state.size) * paddingFactor;
  const paddingCssY = (rect.height / state.size) * paddingFactor;
  const cellWCss = (rect.width - paddingCssX*2) / state.size;
  const cellHCss = (rect.height - paddingCssY*2) / state.size;
  const sx = Math.floor((px - paddingCssX) / cellWCss);
  const sy = Math.floor((py - paddingCssY) / cellHCss);
  if (sx < 0 || sy < 0 || sx >= state.size || sy >= state.size) return;
  socket.emit('makeMove', {roomId, x: sx, y: sy}, (res) => { if (res && res.error) alert(res.error); });
});

// request sync when loaded
window.addEventListener('load', () => {
  resizeCanvas();
  if (roomInput.value) {
    socket.emit('syncRequest', {roomId: roomInput.value}, (res) => { if (res && res.state) { state = res.state; render(); } });
  }
});
