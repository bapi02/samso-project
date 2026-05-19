// Screen mode entry — runs on the 1000x2500 LED display at "/"
// The 3D cabinet now fills the entire stage. QR + dialog appear as a
// fading overlay on a timer (so the cabinet is the hero most of the time).

import QRCode from 'qrcode';
import { createStage, STAGE_W, STAGE_H } from '../shared/stage.js';
import { createChamber } from './chamber.js';
import { isFirebaseConfigured } from '../shared/firebase.js';
import { subscribeAllSlots, clearSlotAction } from '../shared/slots.js';
import { pushResult } from '../shared/results.js';
import { rollFragment } from '../shared/goods.js';

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

// ---- Firebase wiring: slot action → extract animation → result push ----
if (isFirebaseConfigured()) {
  const processing = new Set(); // slot numbers currently mid-animation

  subscribeAllSlots((slots) => {
    for (const [slotStr, slotData] of Object.entries(slots || {})) {
      const slot = Number(slotStr);
      if (!slotData || !slotData.connected) continue;
      if (slotData.action !== 'extract') continue;
      if (processing.has(slot)) continue;

      processing.add(slot);
      // Clear the action immediately so we don't re-trigger on subsequent
      // RTDB events from the same slot before the animation finishes.
      clearSlotAction(slot).catch(() => {});

      const fragment = rollFragment();
      chamber.runExtract({
        fragment,
        onComplete: async () => {
          try {
            await pushResult(slot, fragment);
          } catch (err) {
            console.error('[screen] pushResult failed', err);
          }
          processing.delete(slot);
        },
      });
    }
  });

  console.log('[screen] Firebase wiring active');
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

// --- Dialog bubbles (left side, vertically stacked near upper-mid)
const bubbleStack = document.createElement('div');
bubbleStack.style.cssText = `
  position:absolute; left:60px; top:880px;
  display:flex; flex-direction:column; gap:32px;
  width:380px;
`;
overlay.appendChild(bubbleStack);

const bubble1 = makeBubble('QR을 스캔하면<br/>체험이 바로 시작됩니다.');
const bubble2 = makeBubble(
  '<span style="color:#9be8ff;">NEXTIS</span> 테스트에서 발생한<br/>파편을 뽑아 굿즈를<br/>교환해보세요!'
);
bubbleStack.appendChild(bubble1);
bubbleStack.appendChild(bubble2);

// --- QR card (right side, upper-mid)
const QR_CARD_SIZE = 380;
const QR_CARD_PAD = 22;
const qrCard = document.createElement('div');
qrCard.style.cssText = `
  position:absolute; right:60px; top:880px;
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
  position:absolute; right:60px; top:${880 + QR_CARD_SIZE + 24}px;
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

// --- Fade cycle: 6s visible, 8s hidden
const VISIBLE_MS = 6000;
const HIDDEN_MS = 8000;
let visible = false;
function tickOverlay() {
  visible = !visible;
  overlay.style.opacity = visible ? '1' : '0';
  setTimeout(tickOverlay, visible ? VISIBLE_MS : HIDDEN_MS);
}
// Show overlay first thing so the user immediately sees the QR.
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
