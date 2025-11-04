// 요소
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
bestEl.textContent = best;

// 플레이어 위치/속도 (수평 이동만)
let px = 0, py = 0;
let vx = 0;
const SPEED = 600;        // 초기 이동속도 ↑ (세로형 박진감)
const FRICTION = 0.88;

// 입력 상태
const keys = { left:false, right:false, a:false, d:false };
let pointerX = null;      // 터치/마우스 목표 x

// 메테오
const meteors = new Set();
const meteorImgs = ["images/meteor01.png", "images/meteor02.png"];

// 타이밍
let lastTime = performance.now();
let dt = 0;
let spawnClock = 0;
let spawnGap = 520;       // 초기 스폰 속도 빠르게
const clamp = (min,v,max) => Math.max(min, Math.min(max, v));
const rand  = (a,b) => a + Math.random()*(b-a);

// ===== 입력 바인딩 (모바일 중심 + PC 지원)
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
  // 데스크톱 환경 지원
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
  if(e.key === 'd' || e.key === 'D') keys.d = false;
});

// ===== 플레이어 렌더 (세로 이미지 그대로)
function renderPlayer(){
  // 터치/마우스 → LERP
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

  // --- [추가] 기울임 로직 ---
  let tiltClass = '';
  // 1. 키보드 입력 확인
  if (L && !R) {
    tiltClass = 'tilting-left';
  } else if (R && !L) {
    tiltClass = 'tilting-right';
  }
  // 2. 터치/마우스 입력 확인 (키보드 입력이 없을 때)
  if (tiltClass === '' && pointerX != null) {
    const target = clamp(0, pointerX - playerEl.clientWidth/2, W()-playerEl.clientWidth);
    const diff = target - (px - vx * dt); // 현재 위치와의 차이
    if (diff < -3) tiltClass = 'tilting-left';
    else if (diff > 3) tiltClass = 'tilting-right';
  }
  playerEl.className = tiltClass;
  // --- [추가 완료] ---

  // 바닥 기준 y (이미지 세로 그대로, 하단 여백 4vh)
  const bottomMargin = H() * 0.04;
  const ph = playerEl.clientHeight || H() * 0.3;
  py = H() - ph - bottomMargin;

  playerEl.style.left = px + 'px';
  playerEl.style.top  = py + 'px';
}

// ===== 메테오
function baseFallSpeed(){
  // 세로형이라 낙하 속도 상향 + 점수 비례 증가
  return 360 + Math.min(score * 10, 900);
}

function spawnMeteor(){
  if(!running) return;

  const img = document.createElement('img');
  img.className = 'meteor';
  img.src = meteorImgs[Math.floor(Math.random()*meteorImgs.length)];

  // 폭 기준 랜덤 사이즈(세로형 비율에서 너무 커지지 않도록 보정)
  const minW = W()*0.08;  // 8% of width
  const maxW = Math.min(W()*0.18, H()*0.12); // 화면 세로에도 제한
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

function updateMeteors(){
  const p = { x: px, y: py, w: playerEl.clientWidth, h: playerEl.clientHeight };
  for(const m of Array.from(meteors)){
    m.y += m.vy * dt;
    m.rot += m.vr * dt;
    m.el.style.top = m.y + 'px';
    m.el.style.transform = `rotate(${m.rot}deg)`;

    // 충돌 (AABB)
    if(!(m.x + m.w < p.x || m.x > p.x + p.w || m.y + m.h < p.y || m.y > p.y + p.h)){
      return gameOver();
    }

    // 화면 아래로 지나가면 점수
    if(m.y > H() + m.h){
      meteors.delete(m);
      m.el.remove();
      score++;
      scoreEl.textContent = String(score);

      // --- [추가] 점수 팝업 애니메이션 트리거 ---
      scoreEl.classList.add('score-pop');
      // 애니메이션 시간(150ms) 후에 클래스 제거
      setTimeout(() => scoreEl.classList.remove('score-pop'), 150);
      // --- [추가 완료] ---
    }
  }
}

// 스폰 타이머(공격적 난이도 상승 + 간헐적 동시 스폰)
let twoSpawnBias = 0;
function spawnTick(ms){
  spawnClock += ms;
  const targetGap = Math.max(200, 520 - score*8);  // 빠르게 좁혀짐
  spawnGap += (targetGap - spawnGap) * 0.25;

  while(spawnClock >= spawnGap){
    spawnClock -= spawnGap;
    spawnMeteor();
    // 점수 오를수록 2개 동시 스폰 확률 증가
    const pDouble = Math.min(0.35, 0.12 + score*0.004 + twoSpawnBias);
    if(Math.random() < pDouble){ spawnMeteor(); }
    twoSpawnBias = Math.max(0, twoSpawnBias*0.9); // 약간의 관성
  }
}

// ===== 게임오버 (배경은 유지, 텍스트만 깜빡임 계속)
function gameOver(){
  if(!running) return;
  running = false;

  // 이펙트
  flashEl.classList.add('flash');
  gameArea.classList.add('shake');
  setTimeout(()=> flashEl.classList.remove('flash'), 320);
  setTimeout(()=> gameArea.classList.remove('shake'), 460);

  // 오버레이 표시
  overlay.style.display = 'flex';

  // 베스트 저장
  if(score > best){
    best = score;
    localStorage.setItem('FACE_BEST_V3', String(best));
  }
  bestEl.textContent = String(best);
}

// ===== 재시작
function restart(){
  // 메테오 정리
  for(const m of meteors){ m.el.remove(); }
  meteors.clear();

  // 상태 초기화
  score = 0;
  scoreEl.textContent = '0';
  running = true;
  overlay.style.display = 'none';

  // 입력 상태 리셋
  vx = 0; pointerX = null;
  spawnClock = 0; spawnGap = 520;
  lastTime = performance.now();

  // 루프 재개
  loop(lastTime);
}

// ===== 루프
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

// ===== 초기화 (플레이어 위치는 이미지 로드 후 보정)
function placePlayer(){
  const ph = playerEl.clientHeight || H()*0.3;
  const bottomMargin = H()*0.04;
  px = (W() - playerEl.clientWidth)/2;
  py = H() - ph - bottomMargin;
  playerEl.style.left = px + 'px';
  playerEl.style.top  = py + 'px';
}

function init(){
  // 플레이어 이미지 로드 후 사이징 보정
  if(playerEl.complete){
    placePlayer();
  }else{
    playerEl.onload = placePlayer;
  }
  lastTime = performance.now();
  loop(lastTime);
}

// 리사이즈 대응(세로 고정, 좌우 레터박스)
window.addEventListener('resize', ()=>{
  // 플레이어 y 재계산 + x 경계 체크
  const ph = playerEl.clientHeight || H()*0.3;
  const bottomMargin = H()*0.04;
  py = H() - ph - bottomMargin;
  px = clamp(0, px, W()-playerEl.clientWidth);
  playerEl.style.left = px + 'px';
  playerEl.style.top  = py + 'px';
});

// 시작!
init();