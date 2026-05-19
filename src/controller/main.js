// Mobile controller — runs on the player's phone at "/play".
// Step 3: full UI states wired against mock data. Step 4 swaps mock for
// Firebase RTDB; step 5 wires the extract action + result popup.

import { FRAGMENTS, getFragment } from '../shared/goods.js';
import { isFirebaseConfigured, ensureUserId } from '../shared/firebase.js';
import {
  claimFirstFreeSlot,
  startHeartbeat,
  setupSlotDisconnect,
  releaseSlot,
  writeSlotAction,
  subscribeSlot,
  SLOT_COUNT,
} from '../shared/slots.js';
import { fetchResult } from '../shared/results.js';

const root = document.getElementById('controller-root');
root.style.cssText = `
  position:fixed; inset:0;
  background:
    radial-gradient(ellipse at 50% 22%, #142647 0%, #06101f 55%, #02060e 100%),
    #02060e;
  color:#dceaff;
  font-family: 'JetBrains Mono', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  overflow:hidden;
  user-select:none;
  -webkit-tap-highlight-color: transparent;
`;

// ---- State machine -----------------------------------------------------
// 'connecting'   — booting up, looking for a slot
// 'full'         — all 4 slots taken, waiting screen
// 'idle'         — slot assigned, big buttons enabled
// 'extracting'   — button pressed, claw is working (buttons disabled)
// 'result'       — fragment received, popup visible
// 'disconnected' — connection lost
const state = {
  status: 'connecting',
  slot: 0,                   // 1..4
  totalSlots: 4,
  occupiedSlots: 0,
  result: null,              // FRAGMENTS entry when status='result'
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

// ---- Layout shell ------------------------------------------------------
const shell = document.createElement('div');
shell.style.cssText = `
  position:absolute; inset:0;
  display:flex; flex-direction:column;
  padding: max(env(safe-area-inset-top), 12px) 16px max(env(safe-area-inset-bottom), 24px);
`;
root.appendChild(shell);

// Header
const header = document.createElement('div');
header.style.cssText = `
  flex: 0 0 auto;
  display:flex; align-items:center; justify-content:space-between;
  padding: 8px 4px 16px;
`;
shell.appendChild(header);

const slotBadge = document.createElement('div');
slotBadge.style.cssText = `
  display:inline-flex; align-items:center; gap:8px;
  padding:8px 14px;
  background:rgba(77,208,255,0.08);
  border:1px solid rgba(77,208,255,0.45);
  border-radius:999px;
  font-size:13px; letter-spacing:3px;
  color:#9be8ff;
`;
header.appendChild(slotBadge);

const wordmark = document.createElement('div');
wordmark.style.cssText = `
  font-size:15px; letter-spacing:5px; font-weight:600;
  background:linear-gradient(90deg,#4dd2ff,#d966ff,#ffa64d);
  -webkit-background-clip:text; background-clip:text; color:transparent;
`;
wordmark.textContent = 'NEXTIS LAB';
header.appendChild(wordmark);

// Main panel (status / instruction)
const main = document.createElement('div');
main.style.cssText = `
  flex: 1 1 auto;
  display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  gap:18px; text-align:center;
  padding: 8px;
`;
shell.appendChild(main);

const statusGlyph = document.createElement('div');
statusGlyph.style.cssText = `
  width:120px; height:120px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:48px;
  background:radial-gradient(circle, rgba(77,208,255,0.18), rgba(77,208,255,0));
  border:1.5px solid rgba(77,208,255,0.55);
  box-shadow:
    0 0 0 6px rgba(77,208,255,0.06),
    0 0 40px rgba(77,208,255,0.30);
  transition: all 0.3s ease;
`;
main.appendChild(statusGlyph);

const statusTitle = document.createElement('div');
statusTitle.style.cssText = `
  font-size:28px; font-weight:600; letter-spacing:3px;
  color:#ffffff;
`;
main.appendChild(statusTitle);

const statusSub = document.createElement('div');
statusSub.style.cssText = `
  font-size:13px; letter-spacing:2px; line-height:1.6;
  color:#9aa8d8; opacity:0.85;
  max-width: 280px;
`;
main.appendChild(statusSub);

// Footer (two extract buttons)
const footer = document.createElement('div');
footer.style.cssText = `
  flex: 0 0 auto;
  display:flex; gap:18px; justify-content:space-between; align-items:center;
  padding: 12px 4px;
`;
shell.appendChild(footer);

const btnL = makeExtractButton('LEFT');
const btnR = makeExtractButton('RIGHT');
footer.appendChild(btnL.el);
footer.appendChild(btnR.el);

// Result popup (overlay)
const popup = document.createElement('div');
popup.style.cssText = `
  position:absolute; inset:0;
  display:none;
  align-items:center; justify-content:center;
  padding: 24px;
  background:rgba(2,6,14,0.85);
  backdrop-filter: blur(8px);
  z-index: 10;
`;
root.appendChild(popup);

const popupCard = document.createElement('div');
popupCard.style.cssText = `
  width:100%; max-width:340px;
  padding:28px 24px 24px;
  background:rgba(10,20,40,0.95);
  border:1.5px solid rgba(77,208,255,0.55);
  border-radius:22px;
  text-align:center;
  box-shadow:
    0 0 0 1px rgba(77,208,255,0.18),
    0 12px 60px rgba(77,208,255,0.3),
    0 0 100px rgba(217,102,255,0.18);
`;
popup.appendChild(popupCard);

// ---- Renderer ----------------------------------------------------------
function render() {
  // Header
  if (state.status === 'connecting' || state.status === 'full') {
    slotBadge.textContent = state.status === 'full' ? '만석' : '연결 중';
    slotBadge.style.borderColor = 'rgba(255,200,77,0.6)';
    slotBadge.style.color = '#ffcf7a';
    slotBadge.style.background = 'rgba(255,200,77,0.08)';
  } else if (state.status === 'disconnected') {
    slotBadge.textContent = '연결 끊김';
    slotBadge.style.borderColor = 'rgba(255,100,100,0.7)';
    slotBadge.style.color = '#ff9999';
    slotBadge.style.background = 'rgba(255,80,80,0.10)';
  } else {
    slotBadge.textContent = `SLOT ${state.slot}/${state.totalSlots}`;
    slotBadge.style.borderColor = 'rgba(77,208,255,0.45)';
    slotBadge.style.color = '#9be8ff';
    slotBadge.style.background = 'rgba(77,208,255,0.08)';
  }

  // Main panel
  switch (state.status) {
    case 'connecting':
      statusGlyph.textContent = '◌';
      statusGlyph.style.animation = 'spin 1.6s linear infinite';
      statusTitle.textContent = '연결 중';
      statusSub.textContent = '슬롯을 배정받는 중입니다…';
      break;
    case 'full':
      statusGlyph.textContent = '⏳';
      statusGlyph.style.animation = 'none';
      statusTitle.textContent = '대기 중';
      statusSub.textContent = '4개 슬롯이 모두 사용 중입니다.\n자리가 나면 자동으로 입장됩니다.';
      break;
    case 'idle':
      statusGlyph.textContent = '◆';
      statusGlyph.style.animation = 'pulse 1.8s ease-in-out infinite';
      statusTitle.textContent = '준비 완료';
      statusSub.textContent = '아래 버튼 중 아무거나 눌러\n파편을 뽑아보세요.';
      break;
    case 'extracting':
      statusGlyph.textContent = '✦';
      statusGlyph.style.animation = 'spin 1s linear infinite';
      statusTitle.textContent = '뽑는 중…';
      statusSub.textContent = '갈고리가 파편을 가져오는 중입니다.';
      break;
    case 'result':
      statusGlyph.textContent = '✓';
      statusGlyph.style.animation = 'none';
      statusTitle.textContent = '획득 완료';
      statusSub.textContent = '결과를 확인해주세요.';
      break;
    case 'disconnected':
      statusGlyph.textContent = '⨯';
      statusGlyph.style.animation = 'none';
      statusTitle.textContent = '연결 끊김';
      statusSub.textContent = '페이지를 새로고침해주세요.';
      break;
  }

  // Buttons
  const canExtract = state.status === 'idle';
  btnL.setEnabled(canExtract);
  btnR.setEnabled(canExtract);

  // Popup
  if (state.status === 'result' && state.result) {
    showPopup(state.result);
  } else {
    popup.style.display = 'none';
  }
}

function showPopup(fragment) {
  popupCard.innerHTML = `
    <div style="font-size:11px; letter-spacing:6px; color:#9aa8d8; margin-bottom:10px;">
      FRAGMENT EXTRACTED
    </div>
    <div style="
      width:140px; height:140px; margin:0 auto 18px;
      border-radius:24px;
      background:linear-gradient(135deg, ${fragment.color} 0%, ${fragment.accent} 100%);
      box-shadow:
        0 0 0 4px rgba(255,255,255,0.08),
        0 12px 40px ${fragment.accent}88,
        inset 0 0 30px rgba(255,255,255,0.18);
      display:flex; align-items:center; justify-content:center;
      font-size:64px; font-weight:800; color:#fff;
      text-shadow: 0 2px 12px rgba(0,0,0,0.4);
    ">${fragment.id}</div>
    <div style="
      font-size:13px; letter-spacing:4px; color:${fragment.accent};
      margin-bottom:6px;
    ">${fragment.label.toUpperCase()} · ${fragment.rarity.toUpperCase()}</div>
    <div style="
      font-size:22px; font-weight:700; color:#ffffff;
      margin-bottom:18px; line-height:1.3;
    ">${fragment.goods}</div>
    <div style="
      padding:12px 16px;
      background:rgba(77,208,255,0.08);
      border:1px solid rgba(77,208,255,0.35);
      border-radius:12px;
      font-size:12px; letter-spacing:1.5px; line-height:1.6;
      color:#cdebff;
    ">스태프에게 이 화면을 보여주고<br/>굿즈를 수령해주세요</div>
    <button id="popup-close" style="
      margin-top:18px;
      padding:12px 32px;
      background:transparent;
      border:1px solid rgba(77,208,255,0.45);
      border-radius:999px;
      color:#9be8ff; font-size:13px; letter-spacing:3px;
      font-family:inherit;
      cursor:pointer;
    ">닫기</button>
  `;
  popup.style.display = 'flex';
  popupCard.querySelector('#popup-close').onclick = () => {
    // back to idle for the next extraction
    setState({ status: 'idle', result: null });
  };
}

// ---- Helpers -----------------------------------------------------------
function makeExtractButton(label) {
  const el = document.createElement('button');
  el.style.cssText = `
    flex: 1 1 0;
    height: 160px;
    border:none; outline:none;
    border-radius: 28px;
    background:
      radial-gradient(circle at 50% 30%, rgba(77,208,255,0.42), rgba(77,208,255,0.10) 60%, rgba(77,208,255,0.02) 100%),
      rgba(10,20,40,0.85);
    color:#ffffff;
    font-family: inherit;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 5px;
    cursor:pointer;
    -webkit-tap-highlight-color: transparent;
    box-shadow:
      0 0 0 1.5px rgba(77,208,255,0.55),
      0 0 0 4px rgba(77,208,255,0.10),
      0 14px 36px rgba(77,208,255,0.32),
      inset 0 1px 0 rgba(255,255,255,0.20);
    transition: transform 0.08s ease, opacity 0.2s ease, box-shadow 0.2s ease;
  `;
  el.innerHTML = `
    <div style="font-size:11px; opacity:0.7; letter-spacing:6px; margin-bottom:4px;">${label}</div>
    <div>뽑기</div>
  `;

  let pressed = false;
  function press() {
    if (el.disabled) return;
    pressed = true;
    el.style.transform = 'scale(0.96)';
    el.style.boxShadow = '0 0 0 1.5px rgba(77,208,255,0.85), 0 0 0 4px rgba(77,208,255,0.18), 0 6px 18px rgba(77,208,255,0.4), inset 0 2px 6px rgba(0,0,0,0.25)';
  }
  function release() {
    if (!pressed) return;
    pressed = false;
    el.style.transform = '';
    el.style.boxShadow = '0 0 0 1.5px rgba(77,208,255,0.55), 0 0 0 4px rgba(77,208,255,0.10), 0 14px 36px rgba(77,208,255,0.32), inset 0 1px 0 rgba(255,255,255,0.20)';
    if (!el.disabled) onExtract();
  }
  el.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); release(); }, { passive: false });
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

  return { el, setEnabled };
}

// ---- Extract flow -----------------------------------------------------
// Real mode: writes action='extract' to the slot. The screen consumes the
// action, plays the chamber animation, rolls the fragment, pushes a result,
// then updates the slot's `lastResultId`. Our subscribeSlot listener picks
// that up and transitions us to 'result'.
//
// Mock mode (no Firebase config) keeps the original timer-based flow so
// the page is still demoable.
function onExtract() {
  if (state.status !== 'idle') return;
  setState({ status: 'extracting' });

  if (firebaseMode && state.slot) {
    writeSlotAction(state.slot, 'extract').catch((err) => {
      console.error('[controller] writeSlotAction failed', err);
      setState({ status: 'idle' });
    });
    return;
  }

  // Mock fallback for when Firebase isn't configured yet.
  setTimeout(() => {
    import('../shared/goods.js').then(({ rollFragment }) => {
      const fragment = rollFragment();
      setState({ status: 'result', result: fragment });
    });
  }, 2400);
}

// ---- CSS keyframes (injected once) ------------------------------------
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse {
    0%, 100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(77,208,255,0.06), 0 0 40px rgba(77,208,255,0.30); }
    50%      { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(77,208,255,0.10), 0 0 60px rgba(77,208,255,0.45); }
  }
`;
document.head.appendChild(styleEl);

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
  // Mock fallback for dev when env vars aren't set yet
  setTimeout(() => {
    setState({ status: 'idle', slot: 2, totalSlots: SLOT_COUNT, occupiedSlots: 2 });
  }, 900);
  console.warn('[controller] Firebase not configured — running in MOCK mode');
}

async function boot() {
  const userId = ensureUserId();
  const claim = await claimFirstFreeSlot(userId);

  if (!claim) {
    setState({ status: 'full', slot: 0, totalSlots: SLOT_COUNT });
    // Poll every 4s to try again
    setTimeout(() => boot().catch(() => {}), 4000);
    return;
  }

  const { slot } = claim;
  setState({ status: 'idle', slot, totalSlots: SLOT_COUNT });

  stopHeartbeat = startHeartbeat(slot);
  await setupSlotDisconnect(slot);

  unsubscribeSlot = subscribeSlot(slot, async (slotData) => {
    if (!slotData) return;
    // Watch for a new result tagged to this slot
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

// Release on tab close as a courtesy — onDisconnect handles the network case.
window.addEventListener('pagehide', () => {
  if (state.slot) releaseSlot(state.slot).catch(() => {});
  if (stopHeartbeat) stopHeartbeat();
  if (unsubscribeSlot) unsubscribeSlot();
});

console.log('[controller] mounted', { firebaseMode, state });
