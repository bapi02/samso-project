// Mobile controller (/play) — sci-fi HUD landscape layout.
// Real-time D-pad drives the claw on the screen; A button triggers extract.
// Reference: "Samsonite" gamepad screenshots.

import { FRAGMENTS, getFragment } from '../shared/goods.js';
import { isFirebaseConfigured, ensureUserId } from '../shared/firebase.js';
import {
  claimFirstFreeSlot,
  startHeartbeat,
  setupSlotDisconnect,
  releaseSlot,
  writeSlotAction,
  writeSlotInput,
  subscribeSlot,
  SLOT_COUNT,
} from '../shared/slots.js';
import { fetchResult } from '../shared/results.js';

const root = document.getElementById('controller-root');
root.style.cssText = `
  position:fixed; inset:0;
  background:
    radial-gradient(ellipse at 50% 50%, #0e2042 0%, #050d1c 60%, #02050d 100%),
    #02050d;
  color:#cdebff;
  font-family: 'JetBrains Mono', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  overflow:hidden;
  user-select:none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
`;

// ---- Orientation gate --------------------------------------------------
const rotateHint = document.createElement('div');
rotateHint.style.cssText = `
  position:absolute; inset:0;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:24px; padding:24px; text-align:center;
  background:rgba(2,5,13,0.95);
  z-index: 50;
`;
rotateHint.innerHTML = `
  <div style="font-size:64px; opacity:0.9;">⟲</div>
  <div style="font-size:18px; letter-spacing:4px; color:#9be8ff;">화면을 가로로<br/>돌려주세요</div>
  <div style="font-size:11px; letter-spacing:3px; opacity:0.5;">LANDSCAPE REQUIRED</div>
`;
root.appendChild(rotateHint);

function syncOrientation() {
  const portrait = window.innerWidth < window.innerHeight;
  rotateHint.style.display = portrait ? 'flex' : 'none';
}
syncOrientation();
window.addEventListener('resize', syncOrientation);
window.addEventListener('orientationchange', syncOrientation);

// ---- Main HUD shell ----------------------------------------------------
const hud = document.createElement('div');
hud.style.cssText = `
  position:absolute; inset:0;
  display:grid;
  grid-template-columns: 1fr 2fr 1fr;
  align-items:center;
  padding: 18px 24px;
`;
root.appendChild(hud);

// HUD corner brackets (sci-fi frame)
hud.appendChild(makeCornerBrackets());

// --- Left column: D-pad
const leftCol = document.createElement('div');
leftCol.style.cssText = `
  display:flex; align-items:center; justify-content:center;
`;
hud.appendChild(leftCol);

const dpad = document.createElement('div');
dpad.style.cssText = `
  position:relative;
  width: 200px; height: 200px;
`;
leftCol.appendChild(dpad);

const btnUp    = makePadButton('▲', { left: '50%', top: '0',     transform: 'translateX(-50%)' });
const btnLeft  = makePadButton('◀', { left: '0',   top: '50%',   transform: 'translateY(-50%)' });
const btnRight = makePadButton('▶', { right:'0',   top: '50%',   transform: 'translateY(-50%)' });
dpad.appendChild(btnUp.el);
dpad.appendChild(btnLeft.el);
dpad.appendChild(btnRight.el);

// Center decorative hex hub
const hubHex = document.createElement('div');
hubHex.style.cssText = `
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:54px; height:54px;
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  background:rgba(77,208,255,0.10);
  border: 1px solid rgba(77,208,255,0.35);
`;
dpad.appendChild(hubHex);

// --- Center column: branding / status / result frame
const centerCol = document.createElement('div');
centerCol.style.cssText = `
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; gap:8px;
  position: relative;
`;
hud.appendChild(centerCol);

const centerStatus = document.createElement('div');
centerStatus.style.cssText = `
  font-size:11px; letter-spacing:5px; opacity:0.5; color:#9be8ff;
`;
centerCol.appendChild(centerStatus);

const centerTitle = document.createElement('div');
centerTitle.style.cssText = `
  font-size:28px; font-weight:700; letter-spacing:8px;
  color:#cdebff;
  text-shadow: 0 0 18px rgba(77,208,255,0.55);
`;
centerCol.appendChild(centerTitle);

const centerSub = document.createElement('div');
centerSub.style.cssText = `
  font-size:11px; letter-spacing:2px; opacity:0.55;
`;
centerCol.appendChild(centerSub);

// --- Right column: A button
const rightCol = document.createElement('div');
rightCol.style.cssText = `
  display:flex; align-items:center; justify-content:center;
`;
hud.appendChild(rightCol);

const btnA = makeActionButton('A');
rightCol.appendChild(btnA.el);

// ---- Top bar: SLOT badge + signal indicator ----------------------------
const topBar = document.createElement('div');
topBar.style.cssText = `
  position:absolute; top:14px; left:0; right:0;
  display:flex; justify-content:center; align-items:center; gap:14px;
  pointer-events: none;
`;
root.appendChild(topBar);

const slotBadge = document.createElement('div');
slotBadge.style.cssText = `
  font-size:11px; letter-spacing:5px;
  padding:5px 14px;
  background:rgba(77,208,255,0.08);
  border:1px solid rgba(77,208,255,0.45);
  border-radius:999px;
  color:#9be8ff;
`;
topBar.appendChild(slotBadge);

// Bottom hint bar
const bottomBar = document.createElement('div');
bottomBar.style.cssText = `
  position:absolute; bottom:10px; left:0; right:0;
  text-align:center;
  font-size:9px; letter-spacing:4px; opacity:0.45;
`;
bottomBar.textContent = 'NEXTIS LAB · DIGITAL FRAGMENT EXTRACTOR';
root.appendChild(bottomBar);

// ---- Result overlay (Image 1 reference) -------------------------------
const resultOverlay = document.createElement('div');
resultOverlay.style.cssText = `
  position:absolute; inset:0;
  display:none;
  align-items:center; justify-content:center;
  background:radial-gradient(ellipse at 50% 50%, rgba(14,32,66,0.92), rgba(2,5,13,0.96));
  z-index: 20;
  padding: 18px 80px;
`;
root.appendChild(resultOverlay);

// ---- State machine -----------------------------------------------------
const state = {
  status: 'connecting', // connecting | queued | idle | extracting | result | full | disconnected
  slot: 0,
  isActive: false,      // is this controller the one driving the claw?
  result: null,
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function render() {
  // Slot badge
  if (state.status === 'connecting') {
    slotBadge.textContent = 'CONNECTING';
  } else if (state.status === 'full') {
    slotBadge.textContent = 'ALL SLOTS BUSY';
  } else if (state.status === 'disconnected') {
    slotBadge.textContent = 'DISCONNECTED';
  } else if (state.slot) {
    slotBadge.textContent = `SLOT ${state.slot}/${SLOT_COUNT}`;
  }

  // Center text
  switch (state.status) {
    case 'connecting':
      centerStatus.textContent = 'STATUS';
      centerTitle.textContent = '연결 중';
      centerSub.textContent = '슬롯 배정 중…';
      break;
    case 'full':
      centerStatus.textContent = 'WAITING';
      centerTitle.textContent = '대기 중';
      centerSub.textContent = '잠시 후 자동으로 입장됩니다';
      break;
    case 'queued':
      centerStatus.textContent = `SLOT ${state.slot}`;
      centerTitle.textContent = '내 차례 대기';
      centerSub.textContent = '앞 사용자가 끝나면 자동으로 시작됩니다';
      break;
    case 'idle':
      centerStatus.textContent = 'CONTROL · ACTIVE';
      centerTitle.innerHTML = `<span style="
        background:linear-gradient(90deg,#9be8ff,#d966ff,#ffa64d);
        -webkit-background-clip:text; background-clip:text; color:transparent;
      ">Samsonite</span>`;
      centerSub.textContent = '◀ ▶ 로 갈고리 조준 · A 버튼으로 뽑기';
      break;
    case 'extracting':
      centerStatus.textContent = 'EXTRACTING';
      centerTitle.textContent = '뽑는 중…';
      centerSub.textContent = '갈고리가 파편을 가져오는 중';
      break;
    case 'result':
      // Hidden — result overlay covers it
      break;
    case 'disconnected':
      centerStatus.textContent = 'ERROR';
      centerTitle.textContent = '연결 끊김';
      centerSub.textContent = '페이지를 새로고침해주세요';
      break;
  }

  // Button enable state — only when this controller is the active slot
  const canControl = state.status === 'idle';
  btnUp.setEnabled(canControl);
  btnLeft.setEnabled(canControl);
  btnRight.setEnabled(canControl);
  btnA.setEnabled(canControl);

  // Result overlay
  if (state.status === 'result' && state.result) {
    showResultOverlay(state.result);
  } else {
    resultOverlay.style.display = 'none';
  }
}

// ---- Result overlay rendering -----------------------------------------
function showResultOverlay(fragment) {
  resultOverlay.innerHTML = '';

  const frame = document.createElement('div');
  frame.style.cssText = `
    position:relative;
    width:100%; max-width:560px; height: calc(100% - 36px);
    padding: 32px 28px 24px;
    border:1.5px solid rgba(77,208,255,0.6);
    background:rgba(10,26,52,0.7);
    border-radius:18px;
    box-shadow:
      0 0 0 1px rgba(77,208,255,0.15),
      0 0 80px rgba(77,208,255,0.30);
    display:flex; flex-direction:column; align-items:center; justify-content:space-between;
  `;

  // Corner brackets
  ['tl','tr','bl','br'].forEach((corner) => {
    const c = document.createElement('div');
    const sz = 22;
    c.style.cssText = `
      position:absolute; width:${sz}px; height:${sz}px;
      border:2px solid #4dd0ff;
      ${corner.includes('t') ? 'top:-2px' : 'bottom:-2px'};
      ${corner.includes('l') ? 'left:-2px' : 'right:-2px'};
      ${corner.includes('t') ? 'border-bottom:none' : 'border-top:none'};
      ${corner.includes('l') ? 'border-right:none' : 'border-left:none'};
    `;
    frame.appendChild(c);
  });

  const title = document.createElement('div');
  title.style.cssText = `
    font-size:20px; letter-spacing:8px; font-weight:700;
    color:#9be8ff;
    text-shadow: 0 0 18px rgba(77,208,255,0.7);
  `;
  title.textContent = '파편 획득 성공';
  frame.appendChild(title);

  // Rock photo (user-supplied PNG per type)
  const rock = document.createElement('img');
  rock.src = fragment.image;
  rock.alt = `${fragment.id} 타입 파편`;
  rock.style.cssText = `
    flex: 1 1 auto;
    max-height: 55%; max-width: 80%;
    object-fit: contain;
    margin: 6px 0;
    filter: drop-shadow(0 8px 24px ${fragment.accent}55) drop-shadow(0 0 40px ${fragment.accent}33);
  `;
  frame.appendChild(rock);

  // Type label
  const typeLabel = document.createElement('div');
  typeLabel.style.cssText = `
    font-size:22px; letter-spacing:6px; font-weight:700;
    color:${fragment.accent};
    text-shadow: 0 0 16px ${fragment.accent}88;
  `;
  typeLabel.textContent = `${fragment.id}타입`;
  frame.appendChild(typeLabel);

  // Goods name
  const goodsName = document.createElement('div');
  goodsName.style.cssText = `
    font-size:13px; letter-spacing:2px; opacity:0.85;
    color:#cdebff; margin-top:6px;
  `;
  goodsName.textContent = fragment.goods;
  frame.appendChild(goodsName);

  // Footer status bar
  const footer = document.createElement('div');
  footer.style.cssText = `
    margin-top: 10px;
    font-size:10px; letter-spacing:4px; opacity:0.5; color:#9be8ff;
  `;
  footer.textContent = '스태프에게 화면을 보여주세요';
  frame.appendChild(footer);

  resultOverlay.appendChild(frame);
  resultOverlay.style.display = 'flex';

  // Auto-dismiss after 12s, or tap to dismiss earlier
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    setState({ status: 'idle', result: null });
  };
  resultOverlay.onclick = dismiss;
  setTimeout(dismiss, 12000);
}

// SVG rock illustration — stylized polygonal rock with type color
function makeRockIllustration(fragment) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `display:flex; align-items:center; justify-content:center;`;
  wrap.innerHTML = `
    <svg viewBox="0 0 240 150" width="220" height="138" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rock-grad-${fragment.id}" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="${shadeColor(fragment.color, 22)}"/>
          <stop offset="55%" stop-color="${fragment.color}"/>
          <stop offset="100%" stop-color="${shadeColor(fragment.color, -32)}"/>
        </linearGradient>
        <filter id="rock-glow-${fragment.id}" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" result="g"/>
          <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <!-- Soft glow under the rock -->
      <ellipse cx="120" cy="130" rx="80" ry="10" fill="${fragment.accent}" opacity="0.18"/>
      <!-- Main rock body -->
      <polygon
        points="35,80 60,40 95,28 140,30 180,42 205,68 210,98 188,120 145,128 95,124 55,112 32,98"
        fill="url(#rock-grad-${fragment.id})"
        stroke="${shadeColor(fragment.color, -48)}"
        stroke-width="2"
        stroke-linejoin="round"
        filter="url(#rock-glow-${fragment.id})"
      />
      <!-- Top facet highlight -->
      <polygon
        points="60,40 95,28 140,30 130,55 95,58 70,55"
        fill="${shadeColor(fragment.color, 32)}"
        opacity="0.55"
      />
      <!-- Side facet shadow -->
      <polygon
        points="140,30 180,42 205,68 188,90 158,76 145,52"
        fill="${shadeColor(fragment.color, -22)}"
        opacity="0.7"
      />
      <!-- Crack lines -->
      <path d="M 80,95 L 110,88 L 138,98 L 155,90" stroke="${shadeColor(fragment.color, -60)}" stroke-width="1.2" fill="none" opacity="0.55"/>
      <path d="M 90,55 L 105,75 L 130,80" stroke="${shadeColor(fragment.color, -60)}" stroke-width="1" fill="none" opacity="0.4"/>
    </svg>
  `;
  return wrap;
}

function shadeColor(hex, percent) {
  // Lighten (+) or darken (-) a #rrggbb color by `percent` (0..100 typical).
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ---- Pad / action button factories ------------------------------------
function makePadButton(glyph, posStyles) {
  const el = document.createElement('button');
  const styles = Object.entries(posStyles)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  el.style.cssText = `
    position:absolute; ${styles};
    width:64px; height:64px;
    background:rgba(10,26,52,0.7);
    border:1.5px solid rgba(77,208,255,0.55);
    color:#9be8ff;
    font-size:22px;
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
    box-shadow:
      0 0 0 4px rgba(77,208,255,0.08),
      0 0 18px rgba(77,208,255,0.30);
    cursor:pointer;
    font-family:inherit;
    -webkit-tap-highlight-color:transparent;
    transition: transform 0.08s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  `;
  el.textContent = glyph;

  let held = false;
  function press() {
    if (el.disabled) return;
    held = true;
    el.style.transform = (posStyles.transform || '') + ' scale(0.92)';
    el.style.boxShadow = '0 0 0 4px rgba(77,208,255,0.20), 0 0 28px rgba(77,208,255,0.7)';
    el.style.background = 'rgba(77,208,255,0.25)';
    el.dispatchEvent(new CustomEvent('press'));
  }
  function release() {
    if (!held) return;
    held = false;
    el.style.transform = posStyles.transform || '';
    el.style.boxShadow = '0 0 0 4px rgba(77,208,255,0.08), 0 0 18px rgba(77,208,255,0.30)';
    el.style.background = 'rgba(10,26,52,0.7)';
    el.dispatchEvent(new CustomEvent('release'));
  }
  el.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
  el.addEventListener('touchend',   (e) => { e.preventDefault(); release(); }, { passive: false });
  el.addEventListener('touchcancel', release);
  el.addEventListener('mousedown', press);
  el.addEventListener('mouseup', release);
  el.addEventListener('mouseleave', release);

  function setEnabled(enabled) {
    el.disabled = !enabled;
    el.style.opacity = enabled ? '1' : '0.35';
    el.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
  setEnabled(false);

  return { el, setEnabled, isHeld: () => held };
}

function makeActionButton(label) {
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:relative; width:148px; height:148px; display:flex; align-items:center; justify-content:center;`;

  // Outer hex bezel
  const bezel = document.createElement('div');
  bezel.style.cssText = `
    position:absolute; inset:0;
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    background:rgba(77,208,255,0.08);
    border:1px solid rgba(77,208,255,0.45);
  `;
  wrap.appendChild(bezel);

  // Tick marks (A on top etc — purely decorative letters around the bezel)
  const ticks = document.createElement('div');
  ticks.style.cssText = `
    position:absolute; inset:14px;
    font-size:9px; letter-spacing:2px; color:#9be8ff; opacity:0.55;
  `;
  ticks.innerHTML = `
    <div style="position:absolute; top:0; left:50%; transform:translateX(-50%);">${label}</div>
  `;
  wrap.appendChild(ticks);

  const el = document.createElement('button');
  el.style.cssText = `
    width:96px; height:96px; border-radius:50%;
    background: radial-gradient(circle at 50% 35%, rgba(77,208,255,0.55), rgba(77,208,255,0.15) 60%, rgba(77,208,255,0.02) 100%), rgba(10,26,52,0.7);
    border:1.5px solid rgba(77,208,255,0.7);
    color:#cdebff;
    font-family:inherit;
    font-size:32px;
    font-weight:700;
    box-shadow:
      0 0 0 1px rgba(77,208,255,0.30),
      0 0 32px rgba(77,208,255,0.45),
      inset 0 1px 0 rgba(255,255,255,0.18);
    cursor:pointer;
    -webkit-tap-highlight-color:transparent;
    transition: transform 0.08s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  `;
  el.textContent = label;
  wrap.appendChild(el);

  let pressed = false;
  function press() {
    if (el.disabled) return;
    pressed = true;
    el.style.transform = 'scale(0.93)';
    el.style.boxShadow = '0 0 0 2px rgba(77,208,255,0.6), 0 0 36px rgba(77,208,255,0.8), inset 0 2px 8px rgba(0,0,0,0.3)';
  }
  function release() {
    if (!pressed) return;
    pressed = false;
    el.style.transform = '';
    el.style.boxShadow = '0 0 0 1px rgba(77,208,255,0.30), 0 0 32px rgba(77,208,255,0.45), inset 0 1px 0 rgba(255,255,255,0.18)';
    if (!el.disabled) el.dispatchEvent(new CustomEvent('action'));
  }
  el.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
  el.addEventListener('touchend',   (e) => { e.preventDefault(); release(); }, { passive: false });
  el.addEventListener('touchcancel', () => { pressed = false; el.style.transform = ''; });
  el.addEventListener('mousedown', press);
  el.addEventListener('mouseup', release);
  el.addEventListener('mouseleave', () => { if (pressed) { pressed = false; el.style.transform = ''; } });

  function setEnabled(enabled) {
    el.disabled = !enabled;
    el.style.opacity = enabled ? '1' : '0.35';
    el.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
  setEnabled(false);

  return { el: wrap, btn: el, setEnabled, isPressed: () => pressed };
}

function makeCornerBrackets() {
  const w = document.createElement('div');
  w.style.cssText = `position:absolute; inset:14px; pointer-events:none;`;
  ['tl','tr','bl','br'].forEach((corner) => {
    const c = document.createElement('div');
    c.style.cssText = `
      position:absolute; width:18px; height:18px;
      border:1.5px solid rgba(77,208,255,0.5);
      ${corner.includes('t') ? 'top:0' : 'bottom:0'};
      ${corner.includes('l') ? 'left:0' : 'right:0'};
      ${corner.includes('t') ? 'border-bottom:none' : 'border-top:none'};
      ${corner.includes('l') ? 'border-right:none' : 'border-left:none'};
    `;
    w.appendChild(c);
  });
  return w;
}

// ---- Input wiring ------------------------------------------------------
const localInput = { up: false, down: false, left: false, right: false };
let pendingInputWrite = null;
const INPUT_FLUSH_MS = 50; // throttle bursts; on change still fires fast

function pushInput() {
  if (!firebaseMode || !state.slot) return;
  if (pendingInputWrite) clearTimeout(pendingInputWrite);
  pendingInputWrite = setTimeout(() => {
    pendingInputWrite = null;
    writeSlotInput(state.slot, localInput).catch(() => {});
  }, INPUT_FLUSH_MS);
}

btnUp.el.addEventListener('press',   () => { localInput.up = true; pushInput(); });
btnUp.el.addEventListener('release', () => { localInput.up = false; pushInput(); });
btnLeft.el.addEventListener('press',   () => { localInput.left = true; pushInput(); });
btnLeft.el.addEventListener('release', () => { localInput.left = false; pushInput(); });
btnRight.el.addEventListener('press',   () => { localInput.right = true; pushInput(); });
btnRight.el.addEventListener('release', () => { localInput.right = false; pushInput(); });
btnA.btn.addEventListener('action', () => onActionButton());

function onActionButton() {
  if (state.status !== 'idle') return;
  setState({ status: 'extracting' });
  if (firebaseMode && state.slot) {
    writeSlotAction(state.slot, 'extract').catch((err) => {
      console.error('[controller] writeSlotAction failed', err);
      setState({ status: 'idle' });
    });
  } else {
    // Mock fallback for dev
    setTimeout(() => {
      import('../shared/goods.js').then(({ rollFragment }) => {
        setState({ status: 'result', result: rollFragment() });
      });
    }, 2400);
  }
}

// ---- Boot --------------------------------------------------------------
const firebaseMode = isFirebaseConfigured();
let stopHeartbeat = null;
let unsubscribeSlot = null;
let lastResultSeen = null;

render();

if (firebaseMode) {
  boot().catch((err) => {
    console.error('[controller] boot failed', err);
    setState({ status: 'disconnected' });
  });
} else {
  setTimeout(() => {
    setState({ status: 'idle', slot: 2 });
  }, 900);
  console.warn('[controller] Firebase not configured — running in MOCK mode');
}

async function boot() {
  const userId = ensureUserId();
  const claim = await claimFirstFreeSlot(userId);

  if (!claim) {
    setState({ status: 'full' });
    setTimeout(() => boot().catch(() => {}), 4000);
    return;
  }

  const { slot } = claim;

  stopHeartbeat = startHeartbeat(slot);
  await setupSlotDisconnect(slot);

  // Parallel multi-claw model: every connected slot is active in its own
  // lane. We go straight to 'idle' on claim — no queue.
  setState({ slot, isActive: true, status: 'idle' });

  unsubscribeSlot = subscribeSlot(slot, async (slotData) => {
    if (!slotData) return;
    if (slotData.lastResultId && slotData.lastResultId !== lastResultSeen) {
      lastResultSeen = slotData.lastResultId;
      const result = await fetchResult(slotData.lastResultId);
      if (result) {
        const fragment = getFragment(result.fragType);
        if (fragment) setState({ status: 'result', result: fragment });
      }
    }
  });
}

window.addEventListener('pagehide', () => {
  if (state.slot) releaseSlot(state.slot).catch(() => {});
  if (stopHeartbeat) stopHeartbeat();
  if (unsubscribeSlot) unsubscribeSlot();
});

console.log('[controller] mounted', { firebaseMode, state });
