'use strict';

/* =========================================================
   Pomodoro – časovač pro soustředěnou práci
   Stav se ukládá do localStorage, takže přežije zavření aplikace.
   ========================================================= */

const KEYS = {
  settings: 'pomodoro.settings',
  state: 'pomodoro.state',
  stats: 'pomodoro.stats',
};

const DEFAULTS = {
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  dailyGoal: 8,
  autoBreaks: false,
  autoFocus: false,
  wakeLock: true,
  sound: true,
  volume: 0.7,
  vibrate: true,
  notify: false,
  theme: 'auto',
};

const MODE_LABEL = { focus: 'Soustředění', short: 'Krátká pauza', long: 'Dlouhá pauza' };
const THEME_BG = { dark: '#101014', light: '#f6f4f1' };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

let settings = { ...DEFAULTS, ...load(KEYS.settings, {}) };
let state = {
  mode: 'focus',
  running: false,
  endAt: null,      // timestamp konce, když časovač běží
  remaining: null,  // zbývající ms, když je pozastaven
  done: 0,          // dokončená pomodora v aktuální sadě
  task: '',
  ...load(KEYS.state, {}),
};
let stats = { days: {}, log: [], ...load(KEYS.stats, {}) };

const duration = (mode = state.mode) => settings[mode] * 60 * 1000;
if (state.remaining == null) state.remaining = duration();

/* ---------- Pomocné funkce ---------- */
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function remainingMs() {
  return state.running ? state.endAt - Date.now() : state.remaining;
}

function persistState() { save(KEYS.state, state); }

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Zvuk ---------- */
let audioCtx;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}

function chime() {
  if (!settings.sound) return;
  unlockAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + 0.02;
  const vol = Math.max(0.0001, settings.volume) * 0.5;
  // Jemná trojzvučná melodie, zahraná dvakrát.
  const notes = [659.25, 783.99, 1046.5];
  for (let r = 0; r < 2; r++) {
    notes.forEach((f, i) => {
      const t = t0 + r * 0.9 + i * 0.16;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  }
}

/* ---------- Oznámení ---------- */
async function notify(title, body) {
  if (!settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'pomodoro',
    renotify: true,
    vibrate: settings.vibrate ? [200, 100, 200, 100, 400] : undefined,
    silent: false,
  };
  try {
    const reg = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {}
}

/* ---------- Wake lock (displej nezhasne) ---------- */
let wakeLock = null;
async function updateWakeLock() {
  const want = settings.wakeLock && state.running && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}

/* ---------- Řízení časovače ---------- */
let endTimeout;
function scheduleEnd() {
  clearTimeout(endTimeout);
  if (state.running) endTimeout = setTimeout(tick, Math.max(0, state.endAt - Date.now()) + 50);
}

function start() {
  unlockAudio();
  if (state.running) return;
  if (state.remaining <= 0) state.remaining = duration();
  state.running = true;
  state.endAt = Date.now() + state.remaining;
  persistState();
  scheduleEnd();
  updateWakeLock();
  render();
}

function pause() {
  if (!state.running) return;
  state.remaining = Math.max(0, state.endAt - Date.now());
  state.running = false;
  state.endAt = null;
  persistState();
  scheduleEnd();
  updateWakeLock();
  render();
}

function toggle() { state.running ? pause() : start(); }

function reset() {
  state.running = false;
  state.endAt = null;
  state.remaining = duration();
  persistState();
  scheduleEnd();
  updateWakeLock();
  render();
}

function setMode(mode, { autostart = false } = {}) {
  state.mode = mode;
  state.running = false;
  state.endAt = null;
  state.remaining = duration(mode);
  persistState();
  if (autostart) start();
  else { scheduleEnd(); updateWakeLock(); render(); }
}

function nextMode() {
  if (state.mode === 'focus') return state.done >= settings.longEvery ? 'long' : 'short';
  return 'focus';
}

// Přeskočené pomodoro se nepočítá do statistik ani do sady.
function skip() {
  if (state.mode === 'long') state.done = 0;
  setMode(nextMode());
}

function complete() {
  const finished = state.mode;
  if (finished === 'focus') {
    state.done += 1;
    recordPomodoro();
  } else if (finished === 'long') {
    state.done = 0;
  }
  const next = nextMode();
  const auto = next === 'focus' ? settings.autoFocus : settings.autoBreaks;

  chime();
  if (settings.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

  if (finished === 'focus') {
    const msg = next === 'long' ? `Skvělá práce! Dej si dlouhou pauzu (${settings.long} min).` : `Hotovo! Dej si krátkou pauzu (${settings.short} min).`;
    notify('Pomodoro dokončeno 🍅', msg);
    toast(next === 'long' ? 'Sada hotová – čas na dlouhou pauzu' : 'Pomodoro dokončeno 🍅');
  } else {
    notify('Pauza skončila', `Zpátky do práce – ${settings.focus} minut soustředění.`);
    toast('Pauza skončila – jdeme na to');
  }
  setMode(next, { autostart: auto });
}

function recordPomodoro() {
  const key = dayKey();
  const day = stats.days[key] || { count: 0, minutes: 0 };
  day.count += 1;
  day.minutes += settings.focus;
  stats.days[key] = day;
  stats.log.push({ t: Date.now(), m: settings.focus, task: state.task.trim() });
  if (stats.log.length > 200) stats.log = stats.log.slice(-200);
  save(KEYS.stats, stats);
}

function tick() {
  if (state.running && remainingMs() <= 0) {
    complete();
    return;
  }
  renderTime();
}

/* ---------- Vykreslení ---------- */
const ring = $('#ring-progress');
const CIRC = 2 * Math.PI * 90;
ring.style.strokeDasharray = CIRC;

function renderTime() {
  const rem = remainingMs();
  const progress = 1 - Math.min(1, Math.max(0, rem / duration()));
  $('#time').textContent = fmt(rem);
  ring.style.strokeDashoffset = CIRC * (1 - progress);
  document.title = state.running || rem < duration()
    ? `${fmt(rem)} · ${MODE_LABEL[state.mode]}`
    : 'Pomodoro';
}

function render() {
  document.body.dataset.mode = state.mode;
  document.body.classList.toggle('running', state.running);
  document.body.classList.toggle('paused', !state.running && state.remaining < duration() && state.remaining > 0);

  $$('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === state.mode)));
  $('#mode-label').textContent = MODE_LABEL[state.mode];

  const round = Math.min(state.done + (state.mode === 'focus' ? 1 : 0), settings.longEvery) || 1;
  $('#dial-sub').textContent = state.mode === 'focus'
    ? `Kolo ${round} z ${settings.longEvery}`
    : state.mode === 'long' ? 'Sada dokončena' : `Hotovo ${state.done} z ${settings.longEvery}`;

  const dots = $('#cycle');
  dots.innerHTML = '';
  for (let i = 0; i < settings.longEvery; i++) {
    const d = document.createElement('span');
    if (i < state.done) d.className = 'done';
    else if (i === state.done && state.mode === 'focus') d.className = 'current';
    dots.appendChild(d);
  }

  $('#toggle-icon').setAttribute('href', state.running ? '#i-pause' : '#i-play');
  $('#btn-toggle').setAttribute('aria-label', state.running ? 'Pozastavit' : 'Spustit');

  const theme = settings.theme === 'auto'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : settings.theme;
  $('meta[name="theme-color"]').setAttribute('content', THEME_BG[theme]);

  renderToday();
  renderTime();
}

function renderToday() {
  const day = stats.days[dayKey()] || { count: 0, minutes: 0 };
  $('#today-count').textContent = day.count;
  $('#today-goal').textContent = settings.dailyGoal;
  $('#today-min').textContent = day.minutes;
  $('#today-bar').style.width = `${Math.min(100, (day.count / settings.dailyGoal) * 100)}%`;
}

/* ---------- Statistiky ---------- */
function renderStats() {
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({ d, ...(stats.days[dayKey(d)] || { count: 0, minutes: 0 }) });
  }
  const week = days.reduce((a, x) => a + x.count, 0);
  const totalMin = Object.values(stats.days).reduce((a, x) => a + x.minutes, 0);

  // Série dní v řadě (dnešek se počítá, i když ještě není hotový).
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const c = (stats.days[dayKey(d)] || {}).count || 0;
    if (c > 0) streak++;
    else if (i > 0) break;
    if (i > 3650) break;
  }

  $('#st-today').textContent = days[6].count;
  $('#st-week').textContent = week;
  $('#st-streak').textContent = streak;
  $('#st-total').textContent = totalMin >= 60 ? `${(totalMin / 60).toFixed(totalMin >= 600 ? 0 : 1).replace('.', ',')} h` : `${totalMin} min`;

  const max = Math.max(settings.dailyGoal, ...days.map((x) => x.count));
  const names = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  const chart = $('#chart');
  chart.innerHTML = '';
  days.forEach((x, i) => {
    const col = document.createElement('div');
    col.className = 'chart-col' + (i === 6 ? ' is-today' : '') + (x.count ? '' : ' is-empty');
    col.innerHTML = `<span class="chart-val">${x.count || ''}</span>
      <span class="chart-bar" style="height:${Math.max(4, (x.count / max) * 90)}px"></span>
      <span class="chart-day">${names[x.d.getDay()]}</span>`;
    chart.appendChild(col);
  });

  const log = $('#log');
  log.innerHTML = '';
  const todays = stats.log.filter((e) => dayKey(new Date(e.t)) === dayKey()).reverse();
  if (!todays.length) {
    log.innerHTML = '<li class="empty">Zatím žádné dokončené pomodoro</li>';
  } else {
    todays.forEach((e) => {
      const li = document.createElement('li');
      const time = new Date(e.t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
      li.innerHTML = '<span class="dot"></span><span class="log-task"></span><span class="log-meta"></span>';
      li.querySelector('.log-task').textContent = e.task || 'Bez názvu';
      li.querySelector('.log-meta').textContent = `${time} · ${e.m} min`;
      log.appendChild(li);
    });
  }
}

/* ---------- Nastavení ---------- */
function applyTheme() {
  if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  $$('#theme-seg button').forEach((b) => b.classList.toggle('active', b.dataset.theme === settings.theme));
}

function renderSettings() {
  $$('.stepper').forEach((s) => { s.querySelector('output').textContent = settings[s.dataset.key]; });
  $$('.switch').forEach((c) => { c.checked = !!settings[c.dataset.key]; });
  $('.range').value = settings.volume;
  applyTheme();
  const hint = $('#notify-hint');
  if (!('Notification' in window)) hint.textContent = 'tento prohlížeč je nepodporuje';
  else if (Notification.permission === 'denied') hint.textContent = 'zablokováno v nastavení prohlížeče';
  else hint.textContent = 'i když je aplikace na pozadí';
}

function updateSetting(key, value) {
  const oldDuration = duration();
  const wasFresh = !state.running && state.remaining === oldDuration;
  settings[key] = value;
  save(KEYS.settings, settings);
  // Když časovač ještě nezačal, rovnou použij novou délku.
  if (wasFresh && ['focus', 'short', 'long'].includes(key)) state.remaining = duration();
  if (!state.running && state.remaining > duration()) state.remaining = duration();
  persistState();
  renderSettings();
  render();
}

$$('.stepper').forEach((s) => {
  const key = s.dataset.key;
  const min = +s.dataset.min;
  const max = +s.dataset.max;
  let holdTimer;
  const step = (dir) => updateSetting(key, Math.min(max, Math.max(min, settings[key] + dir)));
  s.querySelectorAll('button').forEach((b) => {
    const dir = +b.dataset.step;
    b.addEventListener('click', () => step(dir));
    // Podržením se hodnota mění rychleji.
    b.addEventListener('pointerdown', () => {
      clearInterval(holdTimer);
      holdTimer = setTimeout(() => { holdTimer = setInterval(() => step(dir), 90); }, 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      b.addEventListener(ev, () => { clearTimeout(holdTimer); clearInterval(holdTimer); }));
  });
});

$$('.switch').forEach((c) => {
  c.addEventListener('change', async () => {
    const key = c.dataset.key;
    if (key === 'notify' && c.checked) {
      if (!('Notification' in window)) { c.checked = false; toast('Oznámení nejsou v tomto prohlížeči podporována'); return; }
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm !== 'granted') { c.checked = false; renderSettings(); toast('Oznámení nebyla povolena'); return; }
    }
    updateSetting(key, c.checked);
    if (key === 'wakeLock') updateWakeLock();
  });
});

$('.range').addEventListener('input', (e) => { settings.volume = +e.target.value; save(KEYS.settings, settings); });
$('.range').addEventListener('change', () => chime());

$$('#theme-seg button').forEach((b) => b.addEventListener('click', () => updateSetting('theme', b.dataset.theme)));

$('#btn-test').addEventListener('click', () => {
  unlockAudio();
  const prev = settings.sound;
  settings.sound = true;
  chime();
  settings.sound = prev;
  if (settings.vibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  notify('Takhle vypadá oznámení', 'Pomodoro tě upozorní na konec bloku.');
});

$('#btn-defaults').addEventListener('click', () => {
  if (!confirm('Obnovit výchozí nastavení?')) return;
  const wasFresh = !state.running && state.remaining === duration();
  settings = { ...DEFAULTS };
  save(KEYS.settings, settings);
  if (wasFresh || state.remaining > duration()) state.remaining = duration();
  persistState();
  renderSettings();
  render();
});

$('#btn-clear-stats').addEventListener('click', () => {
  if (!confirm('Opravdu smazat všechny statistiky?')) return;
  stats = { days: {}, log: [] };
  save(KEYS.stats, stats);
  renderStats();
  renderToday();
});

/* ---------- Dialogy ---------- */
function openSheet(id) {
  const d = $(id);
  if (id === '#sheet-settings') renderSettings();
  if (id === '#sheet-stats') renderStats();
  d.showModal();
}
$$('dialog.sheet').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
});
$('#btn-settings').addEventListener('click', () => openSheet('#sheet-settings'));
$('#btn-stats').addEventListener('click', () => openSheet('#sheet-stats'));
$('#btn-info').addEventListener('click', () => openSheet('#sheet-info'));
$('#today').addEventListener('click', () => openSheet('#sheet-stats'));
$('#today').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet('#sheet-stats'); } });

/* ---------- Hlavní ovládání ---------- */
$('#btn-toggle').addEventListener('click', toggle);
$('#btn-reset').addEventListener('click', reset);
$('#btn-skip').addEventListener('click', skip);

$$('.modes button').forEach((b) => b.addEventListener('click', () => {
  const mode = b.dataset.mode;
  if (mode === state.mode) return;
  if (state.running && state.mode === 'focus' && !confirm('Pomodoro běží. Opravdu ho přerušit?')) return;
  setMode(mode);
}));

const taskInput = $('#task');
taskInput.value = state.task || '';
taskInput.addEventListener('input', () => { state.task = taskInput.value; persistState(); });
taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') taskInput.blur(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea') || document.querySelector('dialog[open]')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === 's' || e.key === 'S') skip();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { tick(); scheduleEnd(); }
  updateWakeLock();
});

matchMedia('(prefers-color-scheme: light)').addEventListener('change', render);

/* ---------- Start ---------- */
applyTheme();
if (state.running && remainingMs() <= 0) {
  // Časovač doběhl, zatímco byla aplikace zavřená.
  complete();
} else {
  render();
  scheduleEnd();
  updateWakeLock();
}
setInterval(tick, 250);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
