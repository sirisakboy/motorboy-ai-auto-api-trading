import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/** Firebase Authentication (Google SSO) */
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const workspaceGoogleProvider = new GoogleAuthProvider();
workspaceGoogleProvider.setCustomParameters({ prompt: 'consent' });

/**
 * Google Workspace scopes — kept to the minimum the app actually calls.
 *
 * Previously this provider asked for `https://mail.google.com/` (full mailbox),
 * gmail.settings.sharing, gmail.insert, every add-on scope and 25 Google Chat
 * admin scopes. None of them were used, and requesting them means the app can
 * never pass Google OAuth verification and a leaked token owns the mailbox.
 *
 * What the code really calls (grep `googleapis.com`):
 *   · users.getProfile, messages.list, messages.get        → gmail.readonly
 *   · messages.send                                        → gmail.send
 *   · messages.trash                                       → gmail.modify
 *   · calendar/v3/calendars/primary/events GET + POST      → calendar.events
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

/**
 * Google Chat is not used anywhere in the app. Kept as an empty export so
 * existing imports/tests keep compiling; do not re-add scopes without code.
 */
export const CHAT_SCOPES: string[] = [];

GMAIL_SCOPES.forEach((scope) => {
  workspaceGoogleProvider.addScope(scope);
});

CALENDAR_SCOPES.forEach((scope) => {
  workspaceGoogleProvider.addScope(scope);
});

CHAT_SCOPES.forEach((scope) => {
  workspaceGoogleProvider.addScope(scope);
});
