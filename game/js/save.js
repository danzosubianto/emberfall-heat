// save.js — progression that survives the tab: cash, respect, the campaign,
// the shards, the race records and the player's car, in localStorage.
//
// The save is deliberately boring: one JSON object under one key, written on
// every meaningful event (mission complete, shard found, safehouse visit)
// and read once at boot. A corrupt or missing save simply starts a new
// career — the game never blocks on its own bookkeeping.

const SAVE_KEY = 'emberfall-heat-save-v1';

export function defaultSave() {
  return {
    cash: 250,
    respect: 0,
    missionsDone: [],
    shardsFound: [],
    raceBests: {},
    deliveriesDone: 0,
    storyStage: 0,
    garageCar: null,
    muted: false,
    seenHelp: false,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked: the session simply runs unsaved.
  }
}

export function wipeSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to wipe.
  }
}

// Respect gates the campaign's later chapters and the better street cars:
// every 100 respect is one "name" level the city recognises.
export function respectLevel(save) {
  return Math.floor(save.respect / 100);
}

export function respectTitle(save) {
  const level = respectLevel(save);
  if (level >= 6) return 'Emberfall Legend';
  if (level >= 4) return 'Crew Captain';
  if (level >= 2) return 'Known Wheelman';
  if (level >= 1) return 'Street Name';
  return 'Nobody';
}
