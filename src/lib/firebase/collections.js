/*
 * Firestore locations for the app's non-candidate, non-announcement state -
 * the board layout, the announcement banner's typography, and saved layout
 * templates. Kept in one place so every doc/collection path is defined once.
 */

import { collection, doc } from 'firebase/firestore';
import { db } from './firestore';

/** The published board layout that /visual reads. */
export const boardLayoutDoc = doc(db, 'settings', 'boardLayout');

/** The admin editor's working copy, published over the doc above on demand. */
export const boardLayoutDraftDoc = doc(db, 'settings', 'boardLayoutDraft');

/** The announcement banner's typography (font, size, color, and so on). */
export const announcementStyleDoc = doc(db, 'settings', 'announcementStyle');

/** Board-wide display settings (theme, which candidates show) - see boardSettings.js. */
export const boardSettingsDoc = doc(db, 'settings', 'board');

/** Named layout snapshots an admin can re-apply to their draft. */
export const boardTemplatesCollection = collection(db, 'boardTemplates');

/** The last few published layouts, for History - see boardLayout.js recordPublish. */
export const boardHistoryCollection = collection(db, 'boardLayoutHistory');
