/*
 * Settings for the live board itself, set on the admin Settings page and
 * stored in Firestore - so the screen running /visual follows a change the
 * moment it's made, from any admin, tab or device. (The admin panel's own
 * light/dark theme is a per-browser preference and stays in localStorage.)
 */

import { onSnapshot, setDoc } from 'firebase/firestore';
import { boardSettingsDoc } from './firebase/collections';

export const DEFAULT_BOARD_SETTINGS = {
  /* no candidate box at all while nobody is listed, instead of the
     "No final interview applicants" message */
  hideEmptyCandidates: false,
  /* drop a candidate from the board once their interview date has passed */
  hidePastCandidates: false,
  /* "HH:MM" Manila time on the interview day to drop them at */
  hidePastTime: '23:59',
};

function normalizeBoardSettings(data) {
  const time = data?.hidePastTime;
  return {
    hideEmptyCandidates: data?.hideEmptyCandidates === true,
    hidePastCandidates: data?.hidePastCandidates === true,
    hidePastTime: typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : DEFAULT_BOARD_SETTINGS.hidePastTime,
  };
}

/** Calls `listener` with the settings now and after each change. Returns an unsubscribe function. */
export function subscribeBoardSettings(listener) {
  return onSnapshot(boardSettingsDoc, (snapshot) => listener(normalizeBoardSettings(snapshot.data())));
}

/* Returns the write's promise so the caller can report a refused save; the
   snapshot listener already reverts the switch when that happens. */
export function saveBoardSettings(settings) {
  return setDoc(boardSettingsDoc, normalizeBoardSettings(settings));
}
