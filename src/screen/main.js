// Screen mode entry — runs on the 1000x2500 LED display at "/"
// The 3D cabinet now fills the entire stage. QR + dialog appear as a
// fading overlay on a timer (so the cabinet is the hero most of the time).

import QRCode from 'qrcode';
import { createStage, STAGE_W, STAGE_H } from '../shared/stage.js';
import { createChamber } from './chamber.js';
import { isFirebaseConfigured, resetRoom } from '../shared/firebase.js';
import { subscribeAllSlots, clearSlotAction } from '../shared/slots.js';
import { pushResult } from '../shared/results.js';
import { rollFragment } from '../shared/goods.js';

// ---- Reset hook ----------------------------------------------------------
// Visit `/?reset=1` once to wipe `rooms/default` (kicks all controllers).
// Also exposes window.resetRoom() for ad-hoc devtools cleanup.
if (isFirebaseConfigured()) {
  window.resetRoom = () => resetRoom().then(() => console.log('[screen] room wiped'));
  if (new URLSearchParams(location.search).get('reset') === '1') {
    resetRoom()
      .then(() => {
        showResetBanner();
        history.replaceState(null, '', location.pathname);
      })
      .catch((err) => console.error('[screen] reset failed', err));
  }
}

function showResetBanner() {
  const b = document.createElement('div');
  b.style.cssText = `
    position:fixed; top:24px; left:50%; transform:translateX(-50%);
    z-index:9999;
    padding:18px 36px;
    background:rgba(20,20,80,0.92);
    border:1.5px solid #4dd0ff;
    border-radius:14px;
    color:#cdebff;
    font-family:'JetBrains Mono', system-ui, sans-serif;
    font-size:18px; letter-spacing:6px;
    box-shadow: 0 0 60px rgba(77,208,255,0.6);
    transition: opacity 0.6s ease;
  `;
  b.textContent = 'ROOM RESET';
  document.body.appendChild(b);
  setTimeout(() => { b.style.opacity = '0'; }, 2200);
  setTimeout(() => b.remove(), 3000);
}

const host = document.getElementById('screen-root');
const stage = createStage(host);

// ---- Chamber fills the entire stage ------------------------------------
const chamberWrap = document.createElement('div');
chamberWrap.style.cssText = `
  position:absolute; left:0; top:0;
  width:${STAGE_W}px; height:${STAGE_H}px;
`;
stage.appendChild(chamberWrap);

const chamber = createChamber({ width: STAGE_W, height: STAGE_H, container: chamberWrap });

// ---- Firebase wiring (parallel multi-claw model) -----------------------
// Each slot has its own claw. Claws appear/disappear as players connect
// or leave. Every connected slot drives ITS OWN claw in parallel.

let allSlots = {};
const slotInputs = {};      // slot -> { left, right, up, down }
const extractingSlots = new Set();
let connectedCount = 0;
let onConnectedCountChange = null; // wired up after overlay is built

if (isFirebaseConfigured()) {
  subscribeAllSlots((slots) => {
    allSlots = slots || {};

    // 1) Add/remove claws based on connection state.
    const connected = new Set();
    for (let s = 1; s <= 4; s++) {
      const d = allSlots[s];
      if (d && d.connected) {
        connected.add(s);
        chamber.addClaw(s);
      }
    }
    for (const s of chamber.activeSlots()) {
      if (!connected.has(s)) chamber.removeClaw(s);
    }
    if (connected.size !== connectedCount) {
      connectedCount = connected.size;
      if (onConnectedCountChange) onConnectedCountChange(connectedCount);
    }

    // 2) Update each slot's input snapshot.
    for (let s = 1; s <= 4; s++) {
      const d = allSlots[s];
      if (d && d.connected && d.input) {
        slotInputs[s] = {
          left: !!d.input.left,
          right: !!d.input.right,
          up: !!d.input.up,
          down: !!d.input.down,
        };
      } else {
        slotInputs[s] = { left: false, right: false, up: false, down: false };
      }
    }

    // 3) Handle extract actions.
    for (let s = 1; s <= 4; s++) {
      const d = allSlots[s];
      if (!d || !d.connected) continue;
      if (d.action !== 'extract') continue;
      if (extractingSlots.has(s)) continue;

      extractingSlots.add(s);
      clearSlotAction(s).catch(() => {});

      const fragment = rollFragment();
      chamber.runExtract(s, {
        fragment,
        onComplete: async () => {
          try {
            await pushResult(s, fragment);
          } catch (err) {
            console.error('[screen] pushResult failed', err);
          }
          extractingSlots.delete(s);
        },
      });
    }
  });

  // ~60Hz drive loop — apply each connected slot's input to its claw.
  let last = performance.now();
  function driveLoop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let s = 1; s <= 4; s++) {
      if (slotInputs[s] && !chamber.isExtracting(s)) {
        chamber.applyInput(s, slotInputs[s], dt);
      }
    }
    requestAnimationFrame(driveLoop);
  }
  requestAnimationFrame(driveLoop);

  console.log('[screen] Firebase wiring active (parallel multi-claw)');
} else {
  console.warn('[screen] Firebase not configured — chamber will be idle');
}

// ---- Intermittent QR + dialog overlay ----------------------------------
// Layout matches the NEXIS reference render:
//   • two stacked dialog bubbles on the left
//   • white QR card on the right
// Both fade in together, hold, then fade out.

const playURL = `${window.location.origin}/play`;

const overlay = document.createElement('div');
overlay.style.cssText = `
  position:absolute; left:0; top:0;
  width:${STAGE_W}px; height:${STAGE_H}px;
  pointer-events:none;
  opacity:0;
  transition: opacity 800ms ease;
`;
stage.appendChild(overlay);

// --- Dialog bubbles (left side, lowered into the rock-pile band)
const bubbleStack = document.createElement('div');
bubbleStack.style.cssText = `
  position:absolute; left:60px; top:1500px;
  display:flex; flex-direction:column; gap:28px;
  width:380px;
`;
overlay.appendChild(bubbleStack);

const bubble1 = makeBubble('QR을 스캔하면<br/>체험이 바로 시작됩니다.');
const bubble2 = makeBubble(
  '<span style="color:#9be8ff;">NEXTIS</span> 테스트에서 발생한<br/>파편을 뽑아 굿즈를<br/>교환해보세요!'
);
bubbleStack.appendChild(bubble1);
bubbleStack.appendChild(bubble2);

// --- QR card (right side, aligned with the lowered dialog bubbles)
const QR_CARD_SIZE = 380;
const QR_CARD_PAD = 22;
const QR_TOP = 1500;
const qrCard = document.createElement('div');
qrCard.style.cssText = `
  position:absolute; right:60px; top:${QR_TOP}px;
  box-sizing:border-box;
  width:${QR_CARD_SIZE}px; height:${QR_CARD_SIZE}px; padding:${QR_CARD_PAD}px;
  background:#ffffff; border-radius:18px;
  box-shadow:
    0 0 0 3px rgba(77,208,255,0.55),
    0 0 60px rgba(77,208,255,0.45),
    0 0 120px rgba(106,136,255,0.30);
`;
const qrCanvas = document.createElement('canvas');
qrCard.appendChild(qrCanvas);
overlay.appendChild(qrCard);

const qrCaption = document.createElement('div');
qrCaption.style.cssText = `
  position:absolute; right:60px; top:${QR_TOP + QR_CARD_SIZE + 24}px;
  width:${QR_CARD_SIZE}px; text-align:center;
  font-size:22px; letter-spacing:6px; color:#9be8ff;
  text-shadow:0 0 12px rgba(77,208,255,0.6);
`;
qrCaption.textContent = 'SCAN TO PLAY';
overlay.appendChild(qrCaption);

const QR_INNER = QR_CARD_SIZE - QR_CARD_PAD * 2; // CSS pixels of QR image
QRCode.toCanvas(qrCanvas, playURL, {
  width: QR_INNER * 2, // hi-DPI buffer; CSS shrinks back to QR_INNER
  margin: 1,
  errorCorrectionLevel: 'M',
  color: { dark: '#050a14', light: '#ffffff' },
})
  .then(() => {
    qrCanvas.style.width = `${QR_INNER}px`;
    qrCanvas.style.height = `${QR_INNER}px`;
    qrCanvas.style.display = 'block';
  })
  .catch((err) => console.error('[screen] QR generation failed', err));

// --- Fade cycle: visible briefly, hidden the rest, on a 10s period.
// We keep cycling even when slots are occupied so latecomers can scan the QR
// and join while a game is already running.
const VISIBLE_MS = 3000;
const HIDDEN_MS = 7000;
let visible = false;
function tickOverlay() {
  visible = !visible;
  overlay.style.opacity = visible ? '1' : '0';
  setTimeout(tickOverlay, visible ? VISIBLE_MS : HIDDEN_MS);
}
setTimeout(tickOverlay, 1500);

console.log('[screen] mounted', { playURL });

// ---- Helpers -----------------------------------------------------------
function makeBubble(html) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:relative;
    padding:24px 28px;
    background:rgba(10,20,40,0.78);
    border:1.5px solid rgba(77,208,255,0.55);
    border-radius:14px;
    color:#dceaff;
    font-size:28px;
    line-height:1.45;
    letter-spacing:1px;
    box-shadow:
      0 0 0 1px rgba(77,208,255,0.15),
      0 0 30px rgba(77,208,255,0.18);
    backdrop-filter: blur(6px);
  `;
  el.innerHTML = html;
  return el;
}
