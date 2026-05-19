// Extract result writes + reads.
// Schema:
//   results/{pushId}/
//     slot:      number     (1..4)
//     fragType:  'A'|'B'|'C'|'D'
//     rarity:    string
//     goodsId:   string
//     timestamp: serverTimestamp
//     claimed:   boolean    (always false at write time; staff flips on redeem)
//
// After pushing the result, the screen also writes `lastResultId` to the slot
// so the controller knows to fetch it.

import { ref, push, get, update, serverTimestamp } from 'firebase/database';
import { getDb, ROOM_ID } from './firebase.js';

// Screen-side: write a result + tag the slot.
export async function pushResult(slot, fragment) {
  const db = getDb();
  const newRef = push(ref(db, 'results'));
  await Promise.all([
    update(newRef, {
      slot,
      fragType: fragment.id,
      rarity: fragment.rarity,
      goodsId: fragment.id,
      timestamp: serverTimestamp(),
      claimed: false,
    }),
    update(ref(db, `rooms/${ROOM_ID}/slots/${slot}`), {
      lastResultId: newRef.key,
      action: null,
    }),
  ]);
  return newRef.key;
}

// Controller-side: fetch a result by id.
export async function fetchResult(resultId) {
  const db = getDb();
  const snap = await get(ref(db, `results/${resultId}`));
  return snap.exists() ? snap.val() : null;
}
