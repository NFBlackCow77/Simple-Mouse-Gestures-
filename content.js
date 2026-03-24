let startX, startY;
let isDrawing = false;
let canvas, ctx;
let path = []; 
let isGestureCooldown = false; 

// --- [설정: 민감도] ---
const MIN_DIST_GLOBAL = 5;
const MIN_LEN_FOR_SCROLL = 30;
const MIN_HEIGHT_FOR_V = 30;
const RECOGNITION_THRESHOLD = 80;
const RETURN_TOLERANCE = 150; // 복귀 허용 거리 (기존 100 -> 150)

// --- [낙서 및 오작동 방지 설정] ---
const SCROLL_CHAOS_RATIO = 3.0;
const V_SHAPE_WIDTH_RATIO = 3.5; // 각도 유연성 상향 (기존 2.5 -> 3.5, 기울어진 V자 허용)
const MAX_V_EFFICIENCY_RATIO = 2.6;
const STRAIGHT_TOLERANCE = 0.6;
const SIMPLE_MOVE_LINEARITY_LIMIT = 1.25;

// --- 캔버스 설정 ---
function createOverlayCanvas() {
  const oldCanvas = document.getElementById('mouse-gesture-canvas');
  if (oldCanvas) oldCanvas.remove();

  canvas = document.createElement('canvas');
  canvas.id = 'mouse-gesture-canvas';
  canvas.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; display: none; pointer-events: none;
  `;
  (document.documentElement || document.body).appendChild(canvas);
  ctx = canvas.getContext('2d');
  styleCanvas();
}

function styleCanvas() {
  if (!ctx) return;
  ctx.strokeStyle = '#800080'; ctx.lineWidth = 5;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
}

if (document.body) createOverlayCanvas();
window.addEventListener('DOMContentLoaded', createOverlayCanvas);

// --- 그리기 준비 ---
function prepareDrawing(e) {
  if (!canvas) createOverlayCanvas();

  // 유튜브 전체화면 대응
  const fsElement = document.fullscreenElement;
  if (fsElement) {
      if (canvas.parentNode !== fsElement) {
          fsElement.appendChild(canvas);
      }
  } else {
      if (!canvas.isConnected) {
          (document.documentElement || document.body).appendChild(canvas);
      }
  }

  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  styleCanvas();
  canvas.style.display = 'block'; 
  canvas.style.pointerEvents = 'auto'; 
  ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY);

  try {
    if (e.pointerId !== undefined) canvas.setPointerCapture(e.pointerId);
  } catch (err) {}
}

function stopDrawing(e) {
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas) {
    try {
        if (e && e.pointerId !== undefined) canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
    canvas.style.display = 'none';
    canvas.style.pointerEvents = 'none'; 
  }
}

// --- ★ 하이브리드 입력 엔진 (Target: document.body) ---
function executeHybridScroll(direction) {
    const keyName = (direction === 'top') ? 'Home' : 'End';
    const keyCodeVal = (direction === 'top') ? 36 : 35; 

    const eventOptions = { 
        key: keyName, 
        code: keyName, 
        keyCode: keyCodeVal,
        which: keyCodeVal,
        bubbles: true, 
        cancelable: true,
        composed: true, 
        view: window 
    };

    // 1. [트리거] document.body에 키보드 이벤트 발사 (유튜브 대응)
    try { 
        const target = document.body || document.documentElement;
        target.dispatchEvent(new KeyboardEvent('keydown', eventOptions)); 
    } catch(e){}

    // 2. [실행] 좌표 강제 이동 (네이버 블로그 Iframe 내부 스크롤 대응)
    if (direction === 'top') {
        window.scrollTo(0, 0);
    } else if (direction === 'bottom') {
        const maxScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
        window.scrollTo(0, maxScroll);
    }

    // 3. [확인사살] 스크롤 이벤트
    try { window.dispatchEvent(new Event('scroll', { bubbles: true })); } catch(e){}

    // 4. [마무리] 키보드 뗌
    try { 
        const target = document.body || document.documentElement;
        target.dispatchEvent(new KeyboardEvent('keyup', eventOptions)); 
    } catch(e){}
}

// --- 동작 수행 ---
function performAction(action) {
    console.log("Action Triggered:", action);
    
    if (action === 'back') chrome.runtime.sendMessage({ action: "goBack" });
    else if (action === 'forward') chrome.runtime.sendMessage({ action: "goForward" });
    else if (action === 'refresh') chrome.runtime.sendMessage({ action: "refresh" });
    else if (action === 'close') chrome.runtime.sendMessage({ action: "closeTab" });
    else if (action === 'reopen') chrome.runtime.sendMessage({ action: "reopenTab" });
    
    // 맨위/맨아래 (스마트 판단)
    else if (action === 'top' || action === 'bottom') {
        if (window === window.top || document.body.scrollHeight > window.innerHeight) {
            executeHybridScroll(action);
        } else {
            window.parent.postMessage({ type: 'GESTURE_SCROLL', dir: action }, '*');
        }
    }
}

// --- 메시지 수신 (부모 창) ---
window.addEventListener('message', (event) => {
    if (!event.data) return;
    
    if (event.data.type === 'GESTURE_SCROLL') {
        executeHybridScroll(event.data.dir);
    }
});

// --- 이벤트 리스너 ---
window.addEventListener('pointerdown', (e) => {
  if (e.button === 2) { 
    isDrawing = true; 
    startX = e.clientX; 
    startY = e.clientY;
    path = [{x: startX, y: startY}]; 
    prepareDrawing(e); 
  }
}, true);

window.addEventListener('pointermove', (e) => {
  if (!isDrawing) return;
  if (ctx) { ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); }
  
  const lastP = path[path.length - 1];
  const dist = Math.hypot(e.clientX - lastP.x, e.clientY - lastP.y);
  if (dist > 5) path.push({x: e.clientX, y: e.clientY});
}, true);

window.addEventListener('pointerup', (e) => {
  if (e.button === 2 && isDrawing) {
    isDrawing = false; 
    
    const endX = e.clientX;
    const endY = e.clientY;
    const diffX = endX - startX;
    const diffY = endY - startY;
    
    stopDrawing(e);

    if (path.length < 3 || Math.hypot(diffX, diffY) < MIN_DIST_GLOBAL) return;

    e.preventDefault(); e.stopPropagation();
    
    isGestureCooldown = true; 
    setTimeout(() => { isGestureCooldown = false; }, 500);

    // --- 데이터 분석 ---
    let maxY = startY; let minY = startY;
    let totalPathLength = 0; 
    let totalTraveledX = 0;  
    let totalTraveledY = 0;

    let yReversals = 0;   // Y축 방향 전환 횟수 (루프 방지)
    let lastYDir = 0;     // 이전 Y축 이동 방향

    for(let i = 0; i < path.length; i++) {
        const p = path[i];
        if (p.y > maxY) maxY = p.y;
        if (p.y < minY) minY = p.y;
        
        if (i > 0) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            totalPathLength += Math.hypot(dx, dy); 
            totalTraveledX += Math.abs(dx);
            totalTraveledY += Math.abs(dy);

            // 3픽셀 이상의 유의미한 움직임에 대해서만 방향 전환 감지
            if (Math.abs(dy) > 3) {
                const currentDir = dy > 0 ? 1 : -1;
                if (lastYDir !== 0 && currentDir !== lastYDir) {
                    yReversals++;
                }
                lastYDir = currentDir;
            }
        }
    }

    const upHeight = startY - minY;  
    const downHeight = maxY - startY; 
    const gestureHeight = maxY - minY; 

    const wentDown = downHeight > MIN_HEIGHT_FOR_V; 
    const wentUp = upHeight > MIN_HEIGHT_FOR_V;   
    
    const distY = Math.abs(endY - startY);
    const returnedY = distY < RETURN_TOLERANCE && distY < (gestureHeight * 0.6);

    const isMostlyUp = upHeight > downHeight;   
    const isMostlyDown = downHeight > upHeight; 

    const directDistance = Math.hypot(diffX, diffY);
    const linearityRatio = directDistance > 20 ? (totalPathLength / directDistance) : 999;
    
    const isChaosScroll = linearityRatio > SCROLL_CHAOS_RATIO;
    const isTooWideShape = gestureHeight > 0 ? (totalTraveledX / gestureHeight > V_SHAPE_WIDTH_RATIO) : true;
    const verticalEfficiency = gestureHeight > 20 ? (totalTraveledY / gestureHeight) : 999;
    const isRepetitiveChaos = verticalEfficiency > MAX_V_EFFICIENCY_RATIO;
    
    const isCleanV = yReversals <= 2; // 깔끔한 V자(왕복) 판단 조건

    let action = null;

    // 1. [닫힌 탭 열기 (UR)] — L자 형태 검증: 먼저 위로, 그 다음 오른쪽
    if (wentUp && diffX > RECOGNITION_THRESHOLD) {
        // 최고점(minY) 인덱스 찾기
        let peakIdx = 0;
        for (let i = 1; i < path.length; i++) {
            if (path[i].y < path[peakIdx].y) peakIdx = i;
        }
        // 최고점이 경로의 앞쪽 80% 이내에 있어야 함 (끝까지 대각선이면 탈락)
        const peakRatio = peakIdx / (path.length - 1);
        if (peakRatio <= 0.8 && peakIdx >= 2) {
            // 1구간(시작→최고점): 세로 이동이 가로보다 커야 함
            const seg1dx = Math.abs(path[peakIdx].x - path[0].x);
            const seg1dy = Math.abs(path[peakIdx].y - path[0].y);
            // 2구간(최고점→끝): 가로 이동이 세로보다 커야 함
            const seg2dx = Math.abs(path[path.length-1].x - path[peakIdx].x);
            const seg2dy = Math.abs(path[path.length-1].y - path[peakIdx].y);
            if (seg1dy > seg1dx && seg2dx > seg2dy && !isChaosScroll) {
                action = 'reopen';
            }
        }
    }
    // 2. [새로고침 (DU)] 
    else if (wentDown && returnedY && isMostlyDown) { 
        if (!isTooWideShape && !isRepetitiveChaos && isCleanV) action = 'refresh';
    }
    // 3. [탭 닫기 (UD)] 
    else if (wentUp && returnedY && isMostlyUp) { 
        if (!isTooWideShape && !isRepetitiveChaos && isCleanV) action = 'close';
    }
    // 4. [단순 이동 (상하좌우)]
    else {
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);
        
        if (directDistance < MIN_LEN_FOR_SCROLL) { /* 너무 짧음 */ }
        else if (isChaosScroll) { console.log("Chaos ignored"); }
        else {
            if (linearityRatio > SIMPLE_MOVE_LINEARITY_LIMIT) {
                console.log("Ignored: Path too curved (L-shape detected)");
            } 
            else {
                if (absX > absY) { 
                    if (absY < absX * STRAIGHT_TOLERANCE) {
                        if (diffX > 0) action = 'forward'; 
                        else action = 'back';             
                    }
                } else { 
                    if (absX < absY * STRAIGHT_TOLERANCE) {
                        if (diffY > 0) action = 'bottom';  
                        else action = 'top';               
                    }
                }
            }
        }
    }

    if (action) performAction(action);
  }
}, true);

window.addEventListener('contextmenu', (e) => {
  if (path.length > 5 || (canvas && canvas.style.display === 'block') || isGestureCooldown) { 
    e.preventDefault(); e.stopPropagation();
    isDrawing = false;
    stopDrawing(); 
    return false;
  }
}, true);