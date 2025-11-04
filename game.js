// 요소 참조
const viewport = document.getElementById('viewport');
const gameArea = document.getElementById('gameArea');
const playerEl = document.getElementById('player');
const overlay  = document.getElementById('overlay');
const scoreEl  = document.getElementById('score');
const bestEl   = document.getElementById('hiscore');
const flashEl  = document.getElementById('flash');

// 크기 헬퍼 (9:16 고정 캔버스 내부 기준)
const W = () => gameArea.clientWidth;
const H = () => gameArea.clientHeight;

// 상태
let running = true;
let score = 0;
let best = Number(localStorage.getItem('FACE_BEST_V3') || 0);
bestEl.textContent = String(best);

// 플레이어 이동
let px = 0, py = 0;
let vx = 0;
const SPEED = 600;       // 초기 이동속도
const FRICTION = 0.88;

// 입력
const keys = { left:false, right:false, a:false, d:false };
let pointerX = null;     // 터치/마우스 목표 x

// 메테오
const meteors = new Set();
const meteorImgs = ["images/meteor01.png", "images/meteor02.png"];

// 타이밍
let lastTime = performance.now();
let dt = 0;
let spawnClock = 0;
let spawnGap = 520;      // 초기 스폰 간격 (점점 줄어듦)

// --------- 충돌 파라미터(튜닝용) ----------
const METEOR_RADIUS_SCALE = 0.38; // 메테오 원형 반경 비율(0.32~0.42 권장)
const PLAYER_SHRINK_X = 0.22;     // 플레이어 사각 히트박스 가로 축소
const PLAYER_SHRINK_Y = 0.15;     // 플레이어 사각 히트박스 세로 축소
// -----------------------------------------

// 유틸
const clamp = (min,v,max) => Math.max(min, Math.min(max, v));
const rand  = (a,b) => a + Math.random()*(b-a);

// ===== 입력 바인딩 (모바일/PC 둘다)
gameArea.addEventListener('touchstart', e=>{
  const t = e.touches[0];
  pointerX = t.clientX - gameArea.getBoundingClientRect().left;
},{passive:true});
gameArea.addEventListener('touchmove', e=>{
  const t = e.touches[0];
  pointerX = t.clientX - gameArea.getBoundingClientRect().left;
},{passive:true});
gameArea.addEventListener('touchend', ()=>{ pointerX = null; });

gameArea.addEventListener('mousemove', e=>{
  pointerX = e.clientX - gameArea.getBoundingClientRect().left;
});

gameArea.addEventListener('click', ()=>{
  if(!running) restart();
});

document.addEventListener('keydown', e=>{
  if(e.key === 'ArrowLeft')  keys.left = true;
  if(e.key === 'ArrowRight') keys.right = true;
  if(e.key === 'a' || e.key === 'A') keys.a = true;
  if(e.key === 'd' || e.key === 'D') keys.d = true;
  if(!running && (e.key === 'r' || e.key === 'R')) restart();
});
document.addEventListener('keyup', e=>{
  if(e.key === 'ArrowLeft')  keys.left = false;
  if(e.key === 'ArrowRight') keys.right = false;
  if(e.key === 'a' || e.key === 'A') keys.a = false;
  if(e.key === 'd' || e.key === 'D') keys.d = false;   // ✅ 괄호 오류 수정
});

// ===== 플레이어 렌더
function renderPlayer(){
  // 터치/마우스 → 부드럽게 추종
  if(pointerX != null){
    const target = clamp(0, pointerX - playerEl.clientWidth/2, W()-playerEl.clientWidth);
    px = px + (target - px) * 0.35;
  }

  // 키보드 → 가속/마찰
  const L = keys.left || keys.a, R = keys.right || keys.d;
  if(L && !R) vx = -SPEED;
  else if(R && !L) vx = SPEED;
  else vx *= FRICTION;

  px += vx * dt;
  px = clamp(0, px, W()-playerEl.clientWidth);

  // 기울임 효과 클래스
  let tiltClass = '';
  if (L && !R) tiltClass = 'tilting-left';
  else if (R && !L) tiltClass = 'tilting-right';
  if (tiltClass === '' && pointerX != null) {
    const target = clamp(0, pointerX - playerEl.clientWidth/2, W()-playerEl.clientWidth);
    const diff = target - (px - vx * dt);
    if (diff < -3) tiltClass = 'tilting-left';
    else if (diff > 3) tiltClass = 'tilting-right';
  }
  playerEl.className = tiltClass;

  // 바닥 기준 y 배치
  const bottomMargin = H() * 0.04;
  const ph = playerEl.clientHeight || H() * 0.3;
  py = H() - ph - bottomMargin;

  playerEl.style.left = px + 'px';
  playerEl.style.top  = py + 'px';
}

// ===== 메테오 생성/업데이트
function baseFallSpeed(){ return 360 + Math.min(score * 10, 900); }

function spawnMeteor(){
  if(!running) return;

  const img = document.createElement('img');
  img.className = 'meteor';
  img.src = meteorImgs[Math.floor(Math.random()*meteorImgs.length)];

  const minW = W()*0.08;                          // 폭 8% ~
  const maxW = Math.min(W()*0.18, H()*0.12);      // 상한
  const size = clamp(40, rand(minW, maxW), 160);
  img.style.width = size + 'px';

  const x = Math.round(rand(0, W()-size));
  const m = {
    el: img,
    x, y: -size - 20,
    w: size, h: size,
    vy: rand(baseFallSpeed(), baseFallSpeed()+240),
    rot: rand(0,360),
    vr: rand(-90, 90)
  };
  img.style.left = m.x + 'px';
  img.style.top  = m.y + 'px';
  img.style.transform = `rotate(${m.rot}deg)`;

  meteors.add(m);
  gameArea.appendChild(img);
}

// 원(메테오) vs 축소 사각형(플레이어) 충돌
function circleRectHit(cx, cy, r, rx, ry, rw, rh){
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return (dx*dx + dy*dy) <= r*r;
}

function updateMeteors(){
  // 플레이어 축소 사각 히트박스
  const pw = playerEl.clientWidth;
  const ph = playerEl.clientHeight;
  const rx = px + pw * PLAYER_SHRINK_X;
  const ry = py + ph * PLAYER_SHRINK_Y;
  const rw = pw * (1 - 2*PLAYER_SHRINK_X);
  const rh = ph * (1 - 2*PLAYER_SHRINK_Y);

  for(const m of Array.from(meteors)){
    m.y += m.vy * dt;
    m.rot += m.vr * dt;
    m.el.style.top = m.y + 'px';
    m.el.style.transform = `rotate(${m.rot}deg)`;

    // 메테오 원형 히트박스 (회전 무관)
    const cx = m.x + m.w/2;
    const cy = m.y + m.h/2;
    const r  = Math.max(m.w, m.h) * METEOR_RADIUS_SCALE;

    if (circleRectHit(cx, cy, r, rx, ry, rw, rh)) {
      return gameOver();
    }

    // 화면 아래로 지나가면 점수 +1
    if(m.y > H() + m.h){
      meteors.delete(m);
      m.el.remove();
      score++;
      scoreEl.textContent = String(score);
      scoreEl.classList.add('score-pop');
      setTimeout(()=>scoreEl.classList.remove('score-pop'), 150);
    }
  }
}

// 스폰 타이머(난이도 상승 + 간헐적 2중 스폰)
let twoSpawnBias = 0;
function spawnTick(ms){
  spawnClock += ms;
  const targetGap = Math.max(200, 520 - score*8);
  spawnGap += (targetGap - spawnGap) * 0.25;

  while(spawnClock >= spawnGap){
    spawnClock -= spawnGap;
    spawnMeteor();
    const pDouble = Math.min(0.35, 0.12 + score*0.004 + twoSpawnBias);
    if(Math.random() < pDouble) spawnMeteor();
    twoSpawnBias = Math.max(0, twoSpawnBias*0.9);
  }
}

// 게임오버
function gameOver(){
  if(!running) return;
  running = false;

  flashEl.classList.add('flash');
  gameArea.classList.add('shake');
  setTimeout(()=> flashEl.classList.remove('flash'), 320);
  setTimeout(()=> gameArea.classList.remove('shake'), 460);

  overlay.style.display = 'flex';

  if(score > best){
    best = score;
    localStorage.setItem('FACE_BEST_V3', String(best));
  }
  bestEl.textContent = String(best);
}

// 재시작
function restart(){
  for(const m of meteors){ m.el.remove(); }
  meteors.clear();

  score = 0; scoreEl.textContent = '0';
  running = true; overlay.style.display = 'none';

  vx = 0; pointerX = null;
  spawnClock = 0; spawnGap = 520;
  lastTime = performance.now();

  loop(lastTime);
}

// 루프
function loop(now){
  if(!running) return;
  now ??= performance.now();
  dt = Math.min(0.033, (now - lastTime)/1000);
  lastTime = now;

  renderPlayer();
  updateMeteors();
  spawnTick(dt*1000);

  requestAnimationFrame(loop);
}

// 초기 배치
function placePlayer(){
  const ph = playerEl.clientHeight || H()*0.3;
  const bottomMargin = H()*0.04;
  px = (W() - playerEl.clientWidth)/2;
  py = H() - ph - bottomMargin;
  playerEl.style.left = px + 'px';
  playerEl.style.top  = py + 'px';
}

// 시작
function init(){
  if(playerEl.complete) placePlayer();
  else playerEl.onload = placePlayer;
  lastTime = performance.now();
  loop(lastTime);
}
window.addEventListener('resize', ()=>{
  const ph = playerEl.clientHeight || H()*0.3;
  const bottomMargin = H()*0.04;
  py = H() - ph - bottomMargin;
  px = clamp(0, px, W()-playerEl.clientWidth);
  playerEl.style.left = px + 'px';
  playerEl.style.top  = py + 'px';
});
init();
