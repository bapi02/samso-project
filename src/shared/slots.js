// Slot lifecycle: claim, heartbeat, release, subscribe.
// Schema (under `rooms/{ROOM_ID}/`):
//   slots/{1..4}/
//     connected: boolean
//     userId: string
//     lastHeartbeat: number (epoch ms)
//     joinedAt: number
//     action: 'extract' | null    ← set by controller, cleared by screen
//     lastResultId: string | null ← set by screen after a result is pushed
//   activeCount: number (derived; updated whenever slots change)

import {
  ref,
  onValue,
  onDisconnect,
  runTransaction,
  update,
  set,
  serverTimestamp,
} from 'firebase/database';
import { getDb, ROOM_ID } from './firebase.js';

export const SLOT_COUNT = 4;
const HEARTBEAT_INTERVAL_MS = 1000;
const STALE_THRESHOLD_MS = 3500;

function slotPath(slot) {
  return `rooms/${ROOM_ID}/slots/${slot}`;
}

// Try to claim the first free slot. Returns { slot } on success, null if all full.
// Uses RTDB transactions so two devices racing for the same slot can't both win.
export async function claimFirstFreeSlot(userId) {
  const db = getDb();
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const slotRef = ref(db, slotPath(i));
    const result = await runTransaction(slotRef, (current) => {
      const now = Date.now();
      const isFree =
        current === null ||
        !current.connected ||
        (typeof current.lastHeartbeat === 'number' &&
          now - current.lastHeartbeat > STALE_THRESHOLD_MS);
      if (!isFree) return; // abort — slot busy
      return {
        connected: true,
        userId,
        joinedAt: now,
        lastHeartbeat: now,
        action: null,
        lastResultId: null,
      };
    });
    if (result.committed) {
      return { slot: i };
    }
  }
  return null;
}

// Keep `lastHeartbeat` fresh while the controller is alive. Returns a stop fn.
export function startHeartbeat(slot) {
  const db = getDb();
  const hbRef = ref(db, `${slotPath(slot)}/lastHeartbeat`);
  const tick = () => set(hbRef, Date.now()).catch(() => {});
  tick();
  const id = setInterval(tick, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(id);
}

// Register an onDisconnect handler so the slot is freed when the controller
// goes away (tab close, network drop, etc.).
export function setupSlotDisconnect(slot) {
  const db = getDb();
  const slotRef = ref(db, slotPath(slot));
  return onDisconnect(slotRef).update({
    connected: false,
    action: null,
  });
}

// Manual release (e.g. user closes the popup-with-intent-to-leave flow).
export function releaseSlot(slot) {
  const db = getDb();
  return update(ref(db, slotPath(slot)), { connected: false, action: null });
}

// Controller-side: write the extract intent for the screen to consume.
export function writeSlotAction(slot, action) {
  const db = getDb();
  return update(ref(db, slotPath(slot)), {
    action,
    actionAt: Date.now(),
  });
}

// Controller-side: write the held-button input state (real-time claw control).
// `input` should be { up, down, left, right } as booleans.
export function writeSlotInput(slot, input) {
  const db = getDb();
  return set(ref(db, `${slotPath(slot)}/input`), {
    up: !!input.up,
    down: !!input.down,
    left: !!input.left,
    right: !!input.right,
  });
}

// Screen-side: subscribe to a single slot's input field only — cheaper than
// re-reading the whole slot on every keypress.
export function subscribeSlotInput(slot, cb) {
  const db = getDb();
  return onValue(ref(db, `${slotPath(slot)}/input`), (snap) => {
    cb(snap.val() || { up: false, down: false, left: false, right: false });
  });
}

// ---- Active slot (whose turn it is) -----------------------------------
// Only one slot can drive the claw at a time. The screen owns this state.
export function subscribeActiveSlot(cb) {
  const db = getDb();
  return onValue(ref(db, `rooms/${ROOM_ID}/activeSlot`), (snap) => {
    cb(snap.val() ?? null);
  });
}

export function setActiveSlot(slot) {
  const db = getDb();
  return set(ref(db, `rooms/${ROOM_ID}/activeSlot`), slot);
}

// Screen-side: clear the action after handling.
export function clearSlotAction(slot) {
  const db = getDb();
  return update(ref(db, slotPath(slot)), { action: null });
}

// Subscribe to every slot at once. Callback gets { 1: slotData, 2: ..., ... }.
export function subscribeAllSlots(cb) {
  const db = getDb();
  const slotsRef = ref(db, `rooms/${ROOM_ID}/slots`);
  return onValue(slotsRef, (snap) => {
    cb(snap.val() || {});
  });
}

// Subscribe to a single slot (used by the controller to watch its lastResultId).
export function subscribeSlot(slot, cb) {
  const db = getDb();
  return onValue(ref(db, slotPath(slot)), (snap) => {
    cb(snap.val() || null);
  });
}

// Stale-slot reaper. Any client can call this — `subscribeAllSlots` listeners
// effectively do the job by reading current state and pruning expired claims.
// We expose a one-shot helper for diagnostics.
export function isSlotStale(slotData) {
  if (!slotData) return true;
  if (!slotData.connected) return true;
  if (typeof slotData.lastHeartbeat !== 'number') return true;
  return Date.now() - slotData.lastHeartbeat > STALE_THRESHOLD_MS;
}
