// Firebase initialization. Config is supplied via VITE_FIREBASE_* env vars
// (.env.local for dev, GitHub Actions secrets for prod). The web `apiKey`
// is a public identifier — it's not secret, but we still treat the values
// as env config so the same code works against multiple projects.

import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const env = import.meta.env;

const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'samso-b202f.firebaseapp.com',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'samso-b202f',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'samso-b202f.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '941051169140',
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

let _app = null;
let _db = null;

export function isFirebaseConfigured() {
  return !!(cfg.apiKey && cfg.databaseURL && cfg.appId);
}

export function getApp() {
  if (_app) return _app;
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase not configured. Copy .env.example to .env.local and fill in VITE_FIREBASE_*. ' +
        'See README setup section.'
    );
  }
  _app = initializeApp(cfg);
  _db = getDatabase(_app);
  return _app;
}

export function getDb() {
  if (!_db) getApp();
  return _db;
}

export const ROOM_ID = 'default';

// Stable per-device user id (persisted in localStorage). Used as a soft
// identifier for the slot owner — not authentication.
export function ensureUserId() {
  const KEY = 'samso.userId';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}
