import { createIcons, icons } from 'https://cdn.jsdelivr.net/npm/lucide@latest/+esm';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const refreshIcons = () => createIcons({ icons });

/* ---------------- Native (Android app) bridge ---------------- */
const Native = window.WallcraftNative || null;
const isNative = !!Native;
const nativeCbs = {};
window.__nativeCb = (id, ok, msg) => { const cb = nativeCbs[id]; if (cb) { delete nativeCbs[id]; ok ? cb.resolve(msg) : cb.reject(new Error(msg || 'failed')); } };
function nativeCall(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = 'cb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    nativeCbs[id] = { resolve, reject };
    try { Native[method](id, ...args); } catch (e) { delete nativeCbs[id]; reject(e); }
  });
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
if (isNative) document.documentElement.classList.add('native');

/* ---------------- Config ---------------- */
const STYLES = [
  { id: 'none', label: 'Any', add: '' },
  { id: 'photo', label: 'Photographic', add: 'ultra realistic photography, natural light, sharp detail, 35mm' },
  { id: 'amoled', label: 'AMOLED dark', add: 'pure black background, deep blacks, glowing accents, high contrast, AMOLED friendly' },
  { id: 'minimal', label: 'Minimal', add: 'minimalist, clean composition, lots of negative space, flat soft colors' },
  { id: 'abstract', label: 'Abstract', add: 'abstract fluid shapes, flowing forms, vibrant harmonious colors' },
  { id: 'anime', label: 'Anime', add: 'anime art style, cel shaded, studio ghibli inspired scenery' },
  { id: 'neon', label: 'Cyberpunk', add: 'cyberpunk, neon lights, rainy night, cinematic, synthwave palette' },
  { id: 'water', label: 'Watercolor', add: 'soft watercolor painting, paper texture, gentle washes' },
  { id: '3d', label: '3D render', add: '3D render, octane, soft studio lighting, glossy materials' },
  { id: 'space', label: 'Space', add: 'deep space, nebula, stars, cosmic, astrophotography' },
  { id: 'pixel', label: 'Pixel art', add: 'detailed pixel art, 16-bit, retro game aesthetic' },
];

const RESOLUTIONS = [
  { id: '1080x2400', w: 1080, h: 2400, label: 'FHD+ 20:9 · 1080×2400 (most phones)' },
  { id: '1080x2340', w: 1080, h: 2340, label: 'FHD+ 19.5:9 · 1080×2340' },
  { id: '1440x3200', w: 1440, h: 3200, label: 'QHD+ 20:9 · 1440×3200 (flagships)' },
  { id: '1440x3120', w: 1440, h: 3120, label: 'QHD+ 19.5:9 · 1440×3120 (Pixel)' },
  { id: '1080x1920', w: 1080, h: 1920, label: 'FHD 16:9 · 1080×1920' },
  { id: '720x1600', w: 720, h: 1600, label: 'HD+ 20:9 · 720×1600' },
];

const SURPRISE = [
  'A lone lighthouse on a cliff under a sky full of swirling aurora',
  'Tiny glowing mushrooms in a mossy forest at night, fireflies',
  'Japanese street in the rain with warm lantern reflections',
  'Floating islands with waterfalls above a sea of clouds at sunset',
  'A koi fish swimming through a starry galaxy',
  'Soft pastel sand dunes with long shadows and a crescent moon',
  'Macro shot of dew drops on a purple flower petal',
  'Snowy pine forest with a small cabin glowing in the distance',
  'Liquid chrome waves in deep blue and violet',
  'An astronaut sitting on the moon watching Earth rise',
  'Retro sunset over a calm ocean with palm silhouettes',
  'Cherry blossom tree on a hill, petals drifting in the wind',
];

/* ---------------- State ---------------- */
const state = {
  style: 'none',
  quality: 'fast',
  res: null,
  previewMode: 'home',
  target: 'both',
  current: null,        // { src: HTMLImageElement, prompt, style, res }
  session: [],
  signedIn: false,
  gallery: [],
  galleryLoaded: false,
  viewerItem: null,
  sheetSource: null,    // 'current' | 'viewer'
  busy: false,
};

/* ---------------- Init UI ---------------- */
function detectDeviceRes() {
  if (isNative) {
    try {
      const d = JSON.parse(Native.deviceInfo());
      if (d.w && d.h) return { id: 'device', w: d.w, h: d.h, label: `This phone · ${d.w}×${d.h}` };
    } catch {}
  }
  const dpr = window.devicePixelRatio || 1;
  let w = Math.round(Math.min(screen.width, screen.height) * dpr);
  let h = Math.round(Math.max(screen.width, screen.height) * dpr);
  const isPhone = /Android|iPhone|Mobile/i.test(navigator.userAgent) && h / w > 1.6;
  if (!isPhone || w < 480) return null;
  return { id: 'device', w, h, label: `This device · ${w}×${h}` };
}

function initControls() {
  // styles
  $('#styles').innerHTML = STYLES.map(s =>
    `<button class="chip px-3.5 py-2 rounded-full border border-ink-700 bg-ink-900 text-sm text-zinc-300 hover:border-ink-600 transition" data-style="${s.id}" aria-pressed="${s.id === state.style}">${s.label}</button>`
  ).join('');
  $('#styles').addEventListener('click', e => {
    const b = e.target.closest('[data-style]'); if (!b) return;
    state.style = b.dataset.style;
    $$('#styles [data-style]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });

  // resolutions
  const dev = detectDeviceRes();
  const list = dev ? [dev, ...RESOLUTIONS] : RESOLUTIONS;
  $('#resolution').innerHTML = list.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
  state.resList = list;
  state.res = list[0];
  $('#resolution').addEventListener('change', e => {
    state.res = state.resList.find(r => r.id === e.target.value);
    applyPhoneAspect();
  });
  applyPhoneAspect();

  // quality
  $('#quality').addEventListener('click', e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    state.quality = b.dataset.q;
    $$('#quality [data-q]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });

  // prompt
  const p = $('#prompt');
  p.addEventListener('input', () => $('#charCount').textContent = `${p.value.length} / 600`);
  p.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); });
  $('#clearPrompt').onclick = () => { p.value = ''; p.dispatchEvent(new Event('input')); p.focus(); };
  $('#surpriseBtn').onclick = () => {
    let next; do { next = SURPRISE[Math.floor(Math.random() * SURPRISE.length)]; } while (next === p.value && SURPRISE.length > 1);
    p.value = next; p.dispatchEvent(new Event('input'));
  };

  // preview mode
  $('#previewMode').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    state.previewMode = b.dataset.mode;
    $$('#previewMode [data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderOverlay();
  });

  // adjustments
  ['dim', 'sat', 'blur'].forEach(id => $('#' + id).addEventListener('input', applyAdjustPreview));
  $('#resetAdjust').onclick = () => { $('#dim').value = 0; $('#sat').value = 100; $('#blur').value = 0; applyAdjustPreview(); };

  // tabs
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  switchTab('create');

  // actions
  $('#generateBtn').onclick = generate;
  $('#regenBtn').onclick = generate;
  $('#setWallBtn').onclick = () => openSheet('current');
  $('#downloadBtn').onclick = async () => downloadBlob(await exportCurrent(), fileName('wallpaper'));
  $('#shareBtn').onclick = shareCurrent;
  $('#saveBtn').onclick = saveCurrent;

  // sheet
  $('#backdrop').onclick = closeSheet;
  $('#closeSheet').onclick = closeSheet;
  $('#targets').addEventListener('click', e => {
    const b = e.target.closest('[data-target]'); if (!b) return;
    state.target = b.dataset.target;
    $$('#targets [data-target]').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderSteps();
  });
  $('#applyBtn').onclick = applyWallpaper;
  $('#applyDownload').onclick = async () => {
    const blob = await getSheetBlob();
    closeSheet();
    if (blob) await downloadBlob(blob, fileName(state.target));
    if (!isNative) toast('Saved. Open it in Gallery → Set as wallpaper');
  };

  // viewer
  $('#closeViewer').onclick = closeViewer;
  $('#viewerDownload').onclick = () => state.viewerItem && downloadBlob(state.viewerItem.blob, `wallcraft-${state.viewerItem.id}.jpg`);
  $('#viewerSet').onclick = () => openSheet('viewer');
  $('#deleteViewer').onclick = deleteViewerItem;
  $('#refreshGallery').onclick = () => loadGallery(true);

  renderSteps();
}

function applyPhoneAspect() {
  $('#phone').style.aspectRatio = `${state.res.w} / ${state.res.h}`;
  if (state.current) $('#resultMeta').textContent = metaText();
}

function switchTab(tab) {
  $('#view-create').classList.toggle('hidden', tab !== 'create');
  $('#view-gallery').classList.toggle('hidden', tab !== 'gallery');
  $$('.tabbtn').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab));
  $$('.tabbtn-m').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('text-white', on);
    b.classList.toggle('text-zinc-500', !on);
  });
  if (tab === 'gallery') loadGallery();
  window.scrollTo({ top: 0 });
}

/* ---------------- Auth ---------------- */
function renderAuth() {
  const area = $('#authArea');
  if (state.signedIn) {
    const name = state.username || 'Account';
    area.innerHTML = `
      <div class="relative">
        <button id="userBtn" class="flex items-center gap-2 pl-1 pr-2.5 h-9 rounded-full bg-ink-900 border border-ink-800 hover:border-ink-600">
          <span class="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-semibold">${escapeHtml(name[0].toUpperCase())}</span>
          <span class="text-sm max-w-[90px] truncate hidden sm:block">${escapeHtml(name)}</span>
          <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-zinc-500"></i>
        </button>
        <div id="userMenu" class="hidden absolute right-0 mt-2 w-44 bg-ink-900 border border-ink-800 rounded-xl p-1 z-40">
          <button id="signOutBtn" class="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-ink-800 flex items-center gap-2"><i data-lucide="log-out" class="w-4 h-4"></i>Sign out</button>
        </div>
      </div>`;
    $('#userBtn').onclick = (e) => { e.stopPropagation(); $('#userMenu').classList.toggle('hidden'); };
    document.addEventListener('click', () => $('#userMenu')?.classList.add('hidden'));
    $('#signOutBtn').onclick = () => { puter.auth.signOut(); state.signedIn = false; state.gallery = []; state.galleryLoaded = false; renderAuth(); renderGallery(); };
  } else {
    area.innerHTML = `<button id="signInBtn" class="h-9 px-4 rounded-full bg-white text-ink-950 text-sm font-semibold hover:bg-zinc-200 flex items-center gap-1.5"><i data-lucide="log-in" class="w-4 h-4"></i>Sign in</button>`;
    $('#signInBtn').onclick = signIn;
  }
  refreshIcons();
}

async function signIn() {
  try {
    await puter.auth.signIn();
    await checkAuth();
    toast('Signed in');
    if (!$('#view-gallery').classList.contains('hidden')) loadGallery(true);
    return true;
  } catch (e) {
    toast('Sign in was cancelled');
    return false;
  }
}

async function checkAuth() {
  state.signedIn = puter.auth.isSignedIn();
  if (state.signedIn) {
    try { const u = await puter.auth.getUser(); state.username = u?.username; } catch {}
  }
  renderAuth();
}

async function requireAuth() {
  if (state.signedIn) return true;
  toast('Sign in to continue');
  return await signIn();
}

/* ---------------- Generation ---------------- */
function buildPrompt(text) {
  const style = STYLES.find(s => s.id === state.style);
  const parts = [
    text.trim(),
    style?.add,
    'vertical portrait composition designed as a smartphone wallpaper, tall 9:20 aspect ratio, main subject centered in the middle, clean uncluttered top area for a clock and bottom area for app icons',
    'no text, no watermark, no logos, no borders, no phone frame, no UI elements',
    state.quality === 'hd' ? 'masterpiece, highly detailed, crisp, 8k' : 'high quality',
  ].filter(Boolean);
  return parts.join(', ');
}

async function callTxt2Img(prompt) {
  const attempts = state.quality === 'hd'
    ? [{ model: 'gpt-image-1', quality: 'high', size: '1024x1536' }, { model: 'gpt-image-1', quality: 'medium' }, null]
    : [{ model: 'gpt-image-1', quality: 'low', size: '1024x1536' }, { model: 'gpt-image-1', quality: 'low' }, null];
  let lastErr;
  for (const opts of attempts) {
    try {
      const img = opts ? await puter.ai.txt2img(prompt, opts) : await puter.ai.txt2img(prompt);
      if (img && img.src) return img;
    } catch (e) { lastErr = e; console.warn('txt2img attempt failed', opts, e); }
  }
  throw lastErr || new Error('Image generation failed');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

async function generate() {
  if (state.busy) return;
  const text = $('#prompt').value.trim();
  if (!text) { toast('Describe your wallpaper first'); $('#prompt').focus(); return; }
  if (!(await requireAuth())) return;

  setBusy(true);
  const msgs = ['Painting your wallpaper…', 'Mixing the colors…', 'Adding the details…', 'Almost there…'];
  let i = 0;
  const timer = setInterval(() => { i = (i + 1) % msgs.length; $('#loadingText').textContent = msgs[i]; }, 5000);
  try {
    const raw = await callTxt2Img(buildPrompt(text));
    let img;
    try { img = await loadImage(raw.src); } catch { img = raw; }
    state.current = { img, prompt: text, style: state.style, created: Date.now() };
    state.session.unshift({ ...state.current, thumb: raw.src });
    state.session = state.session.slice(0, 12);
    showResult();
    renderRecent();
  } catch (e) {
    console.error(e);
    toast(e?.message?.includes('insufficient') ? 'Not enough AI credits on your account' : 'Generation failed. Please try again.');
    if (!state.current) showPlaceholder();
    else showResult();
  } finally {
    clearInterval(timer);
    $('#loadingText').textContent = msgs[0];
    setBusy(false);
  }
}

function setBusy(b) {
  state.busy = b;
  $('#generateBtn').disabled = b;
  $('#generateBtn span').textContent = b ? 'Generating…' : 'Generate wallpaper';
  $('#regenBtn').disabled = b;
  if (b) {
    $('#placeholder').classList.add('hidden');
    $('#wallImg').classList.add('hidden');
    $('#overlayHome').classList.add('hidden');
    $('#overlayLock').classList.add('hidden');
    $('#loading').classList.remove('hidden');
    if (window.innerWidth < 768) $('#phone').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    $('#loading').classList.add('hidden');
  }
}

function showPlaceholder() {
  $('#placeholder').classList.remove('hidden');
  $('#wallImg').classList.add('hidden');
  $('#actions').classList.add('hidden');
  $('#adjustPanel').classList.add('hidden');
  $('#resultMeta').classList.add('hidden');
}

function showResult() {
  const c = state.current; if (!c) return;
  const w = $('#wallImg');
  w.src = c.img.src;
  w.classList.remove('hidden');
  $('#placeholder').classList.add('hidden');
  $('#actions').classList.remove('hidden');
  $('#adjustPanel').classList.remove('hidden');
  $('#resultMeta').classList.remove('hidden');
  $('#resultMeta').textContent = metaText();
  $('#saveBtn').innerHTML = `<i data-lucide="bookmark" class="w-4 h-4"></i>Keep`;
  applyAdjustPreview();
  renderOverlay();
  refreshIcons();
}

function metaText() {
  return `Exports at ${state.res.w} × ${state.res.h} · fitted to your screen`;
}

function renderRecent() {
  $('#recentWrap').classList.toggle('hidden', state.session.length < 2);
  $('#recent').innerHTML = state.session.map((s, i) =>
    `<button data-i="${i}" class="shrink-0 w-16 aspect-[9/19] rounded-xl overflow-hidden border ${s.img === state.current?.img ? 'border-accent' : 'border-ink-800'}">
      <img src="${s.thumb}" class="w-full h-full object-cover" alt="">
    </button>`).join('');
  $$('#recent [data-i]').forEach(b => b.onclick = () => {
    const s = state.session[+b.dataset.i];
    state.current = { img: s.img, prompt: s.prompt, style: s.style, created: s.created };
    showResult(); renderRecent();
  });
}

/* ---------------- Preview overlays ---------------- */
function nowStrings() {
  const d = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return { time, date };
}

const statusBar = (time) => `
  <div class="absolute top-0 inset-x-0 flex items-center justify-between px-4 pt-2 text-[9px] font-medium text-white">
    <span>${time}</span>
    <span class="w-2.5 h-2.5 rounded-full bg-black absolute left-1/2 -translate-x-1/2 top-1.5"></span>
    <span class="flex items-center gap-1"><i data-lucide="signal" class="w-2.5 h-2.5"></i><i data-lucide="wifi" class="w-2.5 h-2.5"></i><i data-lucide="battery-full" class="w-3 h-3"></i></span>
  </div>`;

function renderOverlay() {
  const home = $('#overlayHome'), lock = $('#overlayLock');
  home.classList.add('hidden'); lock.classList.add('hidden');
  if (!state.current || state.busy) return;
  const { time, date } = nowStrings();
  if (state.previewMode === 'home') {
    const appIcons = ['phone', 'message-circle', 'camera', 'chrome', 'music', 'map', 'mail', 'calendar'];
    const iconEl = (n) => `<div class="w-8 h-8 rounded-full bg-white/85 flex items-center justify-center text-zinc-800"><i data-lucide="${n === 'chrome' ? 'globe' : n}" class="w-4 h-4"></i></div>`;
    home.innerHTML = `
      ${statusBar(time)}
      <div class="absolute top-9 left-4 text-white">
        <div class="text-[11px] font-medium">${date}</div>
        <div class="text-[9px] opacity-80 flex items-center gap-1 mt-0.5"><i data-lucide="cloud-sun" class="w-2.5 h-2.5"></i>22°</div>
      </div>
      <div class="absolute bottom-16 inset-x-0 px-5 grid grid-cols-4 gap-y-3 justify-items-center">
        ${appIcons.slice(4).map(iconEl).join('')}
      </div>
      <div class="absolute bottom-7 inset-x-0 px-5 grid grid-cols-4 justify-items-center">
        ${appIcons.slice(0, 4).map(iconEl).join('')}
      </div>
      <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-white/80"></div>`;
    home.classList.remove('hidden');
  } else if (state.previewMode === 'lock') {
    const [hh, mm] = time.split(':');
    lock.innerHTML = `
      ${statusBar('')}
      <div class="absolute top-[14%] inset-x-0 text-center text-white">
        <div class="text-[10px] font-medium opacity-90">${date}</div>
        <div class="text-[64px] leading-[0.9] font-semibold tracking-tight mt-1">${hh}<br>${mm}</div>
      </div>
      <div class="absolute bottom-10 inset-x-0 flex items-center justify-between px-6 text-white">
        <div class="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center"><i data-lucide="flashlight" class="w-3.5 h-3.5"></i></div>
        <i data-lucide="fingerprint" class="w-6 h-6 opacity-90"></i>
        <div class="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center"><i data-lucide="camera" class="w-3.5 h-3.5"></i></div>
      </div>
      <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full bg-white/80"></div>`;
    lock.classList.remove('hidden');
  }
  refreshIcons();
}

/* ---------------- Adjustments ---------------- */
function getAdjust() {
  return { dim: +$('#dim').value, sat: +$('#sat').value, blur: +$('#blur').value };
}
function applyAdjustPreview() {
  const a = getAdjust();
  $('#dimVal').textContent = a.dim + '%';
  $('#satVal').textContent = a.sat + '%';
  $('#blurVal').textContent = a.blur + 'px';
  const w = $('#wallImg');
  w.style.filter = `saturate(${a.sat}%) blur(${a.blur * 0.4}px) brightness(${1 - a.dim / 100})`;
  w.style.transform = a.blur ? 'scale(1.06)' : '';
}

/* ---------------- Export ---------------- */
async function renderToBlob(img, W, H, adjust) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale, dh = ih * scale;
  const phoneW = $('#phone').clientWidth || 260;
  const blurPx = adjust.blur * 0.4 * (W / phoneW);
  const pad = blurPx * 2;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const filters = [];
  if (adjust.sat !== 100) filters.push(`saturate(${adjust.sat}%)`);
  if (blurPx > 0) filters.push(`blur(${blurPx}px)`);
  ctx.filter = filters.join(' ') || 'none';
  ctx.drawImage(img, (W - dw) / 2 - pad, (H - dh) / 2 - pad, dw + pad * 2, dh + pad * 2);
  ctx.filter = 'none';
  if (adjust.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${adjust.dim / 100})`; ctx.fillRect(0, 0, W, H); }
  return new Promise((res, rej) => {
    try { canvas.toBlob(b => b ? res(b) : rej(new Error('Export failed')), 'image/jpeg', 0.94); }
    catch (e) { rej(e); }
  });
}

async function exportCurrent() {
  if (!state.current) return null;
  try {
    return await renderToBlob(state.current.img, state.res.w, state.res.h, getAdjust());
  } catch (e) {
    console.error(e);
    // fallback: raw image
    try { return await (await fetch(state.current.img.src)).blob(); }
    catch { toast('Could not prepare the image'); return null; }
  }
}

function fileName(tag) {
  return `wallcraft-${tag}-${state.res.w}x${state.res.h}-${Date.now().toString(36)}.jpg`;
}

async function downloadBlob(blob, name) {
  if (!blob) return;
  if (isNative) {
    try {
      await nativeCall('saveImage', await blobToBase64(blob), name);
      toast('Saved to Pictures / Wallcraft');
    } catch (e) {
      toast(e.message === 'permission' ? 'Allow storage access, then tap Save again' : 'Could not save the image');
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Wallpaper saved to your downloads');
}

async function shareCurrent() {
  const blob = await exportCurrent(); if (!blob) return;
  if (isNative) {
    try { await nativeCall('shareImage', await blobToBase64(blob), fileName('wallpaper'), state.current.prompt || ''); }
    catch { toast('Could not share'); }
    return;
  }
  const file = new File([blob], fileName('wallpaper'), { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'AI wallpaper', text: state.current.prompt }); } catch {}
  } else {
    downloadBlob(blob, file.name);
  }
}

/* ---------------- Set wallpaper sheet ---------------- */
const TARGET_LABEL = { home: 'Home screen', lock: 'Lock screen', both: 'Home and lock screens' };

function renderSteps() {
  const canShare = !!navigator.canShare;
  const t = TARGET_LABEL[state.target];
  if (isNative) {
    $('#steps').innerHTML = [
      `Tap <b>Apply</b> — the wallpaper is set on your <b>${t.toLowerCase()}</b> instantly.`,
      'Press the home button to see it. No extra steps needed.',
    ].map(s => `<li>${s}</li>`).join('');
    $('#applyLabel').textContent = state.target === 'both' ? 'Apply to both screens' : `Apply to ${t.toLowerCase()}`;
    $('#applyDownload').textContent = 'Or save to Gallery instead';
    return;
  }
  const steps = [
    canShare ? 'Tap <b>Apply</b> below — Android’s share menu opens with your wallpaper.' : 'Tap <b>Apply</b> below — the wallpaper is saved to your phone.',
    canShare ? 'Choose <b>Photos</b>, <b>Gallery</b> or <b>Wallpapers</b>, then tap <b>Use as</b> / <b>Set as wallpaper</b>.' : 'Open it in <b>Photos</b> or <b>Gallery</b>, tap <b>⋮</b> → <b>Use as</b> / <b>Set as wallpaper</b>.',
    `When Android asks, pick <b>${t}</b>.`,
  ];
  $('#steps').innerHTML = steps.map(s => `<li>${s}</li>`).join('');
  $('#applyLabel').textContent = state.target === 'both' ? 'Apply to both screens' : `Apply to ${t.toLowerCase()}`;
}

function openSheet(source) {
  state.sheetSource = source;
  renderSteps();
  $('#backdrop').classList.add('open');
  $('#sheet').classList.add('open');
}
function closeSheet() {
  $('#backdrop').classList.remove('open');
  $('#sheet').classList.remove('open');
}

async function getSheetBlob() {
  if (state.sheetSource === 'viewer') return state.viewerItem?.blob || null;
  return await exportCurrent();
}

async function applyWallpaper() {
  const btn = $('#applyBtn');
  btn.disabled = true;
  try {
    const blob = await getSheetBlob(); if (!blob) return;
    const name = fileName(state.target);
    const file = new File([blob], name, { type: 'image/jpeg' });
    const t = TARGET_LABEL[state.target];
    if (isNative) {
      $('#applyLabel').textContent = 'Applying…';
      try {
        await nativeCall('setWallpaper', await blobToBase64(blob), state.target);
        closeSheet();
        toast(`Wallpaper set on ${t.toLowerCase()}`);
      } catch (e) {
        toast('Could not set wallpaper: ' + (e.message || 'unknown error'));
      } finally {
        renderSteps();
      }
      return;
    }
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Set as wallpaper (${t})` });
        closeSheet();
        toast(`Choose “Set as wallpaper” → ${t}`);
      } catch (e) {
        if (e?.name !== 'AbortError') { downloadBlob(blob, name); closeSheet(); }
      }
    } else {
      downloadBlob(blob, name);
      closeSheet();
      setTimeout(() => toast(`Open it in Gallery → Set as wallpaper → ${t}`), 1800);
    }
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Saving & gallery (Puter cloud) ---------------- */
const KV_KEY = 'wallcraft:items';
const DIR = 'wallpapers';

async function readIndex() {
  try { const v = await puter.kv.get(KV_KEY); return v ? (typeof v === 'string' ? JSON.parse(v) : v) : []; }
  catch { return []; }
}
async function writeIndex(items) {
  await puter.kv.set(KV_KEY, JSON.stringify(items));
}

async function saveCurrent() {
  if (!state.current) return;
  if (!(await requireAuth())) return;
  const btn = $('#saveBtn');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 spin"></i>Saving`;
  refreshIcons();
  try {
    const blob = await exportCurrent(); if (!blob) throw new Error('no blob');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await puter.fs.write(`${DIR}/${id}.jpg`, blob, { createMissingParents: true });
    const items = await readIndex();
    const meta = { id, prompt: state.current.prompt, style: state.current.style, w: state.res.w, h: state.res.h, created: Date.now() };
    items.unshift(meta);
    await writeIndex(items);
    if (state.galleryLoaded) { state.gallery.unshift({ ...meta, blob, url: URL.createObjectURL(blob) }); renderGallery(); }
    btn.innerHTML = `<i data-lucide="bookmark-check" class="w-4 h-4 text-accent-soft"></i>Kept`;
    toast('Saved to My wallpapers');
  } catch (e) {
    console.error(e);
    btn.innerHTML = `<i data-lucide="bookmark" class="w-4 h-4"></i>Keep`;
    toast('Could not save. Please try again.');
  } finally {
    btn.disabled = false;
    refreshIcons();
  }
}

async function loadGallery(force = false) {
  if (!state.signedIn) { renderGallery(); return; }
  if (state.galleryLoaded && !force) { renderGallery(); return; }
  $('#gallery').innerHTML = Array.from({ length: 6 }).map(() => `<div class="aspect-[9/19.5] rounded-2xl shimmer"></div>`).join('');
  state.gallery.forEach(g => g.url && URL.revokeObjectURL(g.url));
  const items = await readIndex();
  state.gallery = items.map(m => ({ ...m, blob: null, url: null }));
  state.galleryLoaded = true;
  renderGallery();
  await Promise.all(state.gallery.map(async (g) => {
    try {
      const blob = await puter.fs.read(`${DIR}/${g.id}.jpg`);
      g.blob = blob; g.url = URL.createObjectURL(blob);
      const el = document.querySelector(`[data-gid="${g.id}"] img`);
      if (el) { el.src = g.url; el.parentElement.classList.remove('shimmer'); }
    } catch (e) { g.missing = true; }
  }));
}

function renderGallery() {
  const el = $('#gallery');
  if (!state.signedIn) {
    $('#galleryCount').textContent = 'Saved to your account';
    el.innerHTML = emptyState('log-in', 'Sign in to see your wallpapers', 'Your kept wallpapers are stored securely in your account and available on any device.', `<button id="galSignIn" class="mt-4 h-10 px-5 rounded-xl bg-white text-ink-950 text-sm font-semibold">Sign in</button>`);
    $('#galSignIn').onclick = signIn;
    refreshIcons(); return;
  }
  const list = state.gallery.filter(g => !g.missing);
  $('#galleryCount').textContent = `${list.length} wallpaper${list.length === 1 ? '' : 's'} saved`;
  if (!list.length) {
    el.innerHTML = emptyState('images', 'No wallpapers yet', 'Generate one and tap Keep to save it here.', `<button id="galCreate" class="mt-4 h-10 px-5 rounded-xl bg-accent text-sm font-semibold">Create a wallpaper</button>`);
    $('#galCreate').onclick = () => switchTab('create');
    refreshIcons(); return;
  }
  el.innerHTML = list.map(g => `
    <button data-gid="${g.id}" class="group relative aspect-[9/19.5] rounded-2xl overflow-hidden bg-ink-900 border border-ink-800 ${g.url ? '' : 'shimmer'}">
      <img src="${g.url || ''}" class="w-full h-full object-cover ${g.url ? '' : ''}" alt="" onerror="this.style.opacity=0">
      <div class="absolute inset-x-0 bottom-0 p-2.5 bg-black/55 text-left">
        <div class="text-[11px] text-white line-clamp-2 leading-snug">${escapeHtml(g.prompt)}</div>
        <div class="text-[10px] text-zinc-400 mt-0.5">${g.w}×${g.h}</div>
      </div>
    </button>`).join('');
  $$('#gallery [data-gid]').forEach(b => b.onclick = () => openViewer(b.dataset.gid));
}

function emptyState(icon, title, sub, extra = '') {
  return `<div class="col-span-full flex flex-col items-center text-center py-20 px-6">
    <div class="w-14 h-14 rounded-2xl bg-ink-900 border border-ink-800 flex items-center justify-center text-zinc-400"><i data-lucide="${icon}" class="w-6 h-6"></i></div>
    <div class="mt-4 font-medium">${title}</div>
    <div class="text-sm text-zinc-500 mt-1 max-w-xs">${sub}</div>${extra}</div>`;
}

function openViewer(id) {
  const g = state.gallery.find(x => x.id === id);
  if (!g || !g.url) { toast('Still loading…'); return; }
  state.viewerItem = g;
  $('#viewerImg').src = g.url;
  $('#viewerTitle').textContent = g.prompt;
  $('#viewer').classList.add('open');
}
function closeViewer() { $('#viewer').classList.remove('open'); }

async function deleteViewerItem() {
  const g = state.viewerItem; if (!g) return;
  if (!confirm('Delete this wallpaper?')) return;
  try {
    try { await puter.fs.delete(`${DIR}/${g.id}.jpg`); } catch {}
    const items = (await readIndex()).filter(x => x.id !== g.id);
    await writeIndex(items);
    state.gallery = state.gallery.filter(x => x.id !== g.id);
    if (g.url) URL.revokeObjectURL(g.url);
    closeViewer(); renderGallery();
    toast('Wallpaper deleted');
  } catch { toast('Could not delete'); }
}

/* ---------------- Utils ---------------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('open');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('open'), 3200);
}
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeViewer(); } });

// Android back button: close open panels first, then go back to Create tab.
window.wallcraftBack = () => {
  if ($('#sheet').classList.contains('open')) { closeSheet(); return true; }
  if ($('#viewer').classList.contains('open')) { closeViewer(); return true; }
  if ($('#view-create').classList.contains('hidden')) { switchTab('create'); return true; }
  return false;
};

/* ---------------- Boot ---------------- */
initControls();
refreshIcons();
checkAuth();
