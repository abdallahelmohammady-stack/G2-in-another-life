(function(){
'use strict';

/* ============================================================
   1) التخزين
   ============================================================ */
/* كاش محلي للنسخة المعروضة فقط — مفتاح مختلف عن نسخة الأدمن عمداً
   عشان لو الاتنين على نفس الدومين، المتصفح ما يخلطش شغل الأدمن بالمعروض */
const KEY_CACHE = 'myfolio_viewcache_v1';
const KEY_THEME = 'myfolio_theme_v1';
const KEY_SORT  = 'myfolio_sort_v1';
const KEY_ICONS = 'myfolio_iconcache_v1';

function load(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw === null) return fallback;
    const val = JSON.parse(raw);
    return (val === null || val === undefined) ? fallback : val;
  }catch(e){ return fallback; }
}
function save(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){
    toast('مساحة التخزين امتلأت — جرّب تقلل صور الأغلفة', true);
    return false;
  }
}

/* بيانات المعرض: بتتقرا من ملف JSON خارجي (data/sites.json)
   الأدمن بيصدّر الملف ده من زر "تصدير" وبتحطّه في هذا المجلد.
   مفيش أي تعديل من هنا — النسخة دي للعرض فقط. */
let sites = [];   // هتتملي بعد تحميل ملف البيانات

async function fetchSites(){
  try{
    const res = await fetch('data/sites.json', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data && data.sites);
    if(!Array.isArray(arr)) throw new Error('bad json');
    return arr;
  }catch(e){
    console.warn('تعذّر تحميل data/sites.json:', e);
    return null;   // null = التحميل فشل (مش إن المعرض فاضي)
  }
}

let iconCache = load(KEY_ICONS, {});
if(!iconCache || typeof iconCache !== 'object') iconCache = {};

let sortMode = load(KEY_SORT, 'manual');

function normalize(s){
  return {
    id: String(s.id || uid()),
    name: String(s.name || 'بدون اسم'),
    url: String(s.url || ''),
    desc: String(s.desc || ''),
    tags: Array.isArray(s.tags) ? s.tags.map(String).filter(Boolean).slice(0,8) : [],
    status: (s.status === 'wip') ? 'wip' : 'live',
    cover: String(s.cover || ''),
    createdAt: Number(s.createdAt) || Date.now(),
    updatedAt: Number(s.updatedAt) || Date.now()
  };
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

/* ============================================================
   2) أدوات صغيرة
   ============================================================ */
const $  = (sel, root) => (root||document).querySelector(sel);
const $$ = (sel, root) => Array.from((root||document).querySelectorAll(sel));

function esc(v){
  return String(v==null?'':v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function normUrl(u){
  u = String(u||'').trim();
  if(!u) return '';
  if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}
function hostOf(u){
  try{ return new URL(normUrl(u)).hostname.replace(/^www\./,''); }
  catch(e){ return ''; }
}
function hashOf(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) >>> 0;
  return h;
}

let toastTimer = null;
function toast(msg, isErr){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2800);
}

/* ============================================================
   3) اللوجو التلقائي (نفس فكرة الموقع الأول، بعدة مصادر)
   ============================================================ */
const ICON_MIN_GOOD = 32;

/* icon.horse أولاً لأنه بيسمح بقراءة الصورة (CORS) فنقدر نكشف الأيقونة
   الافتراضية، وكمان بيرجع أعلى جودة. الباقي احتياطي لو فشل أو رفض الطلب. */
function iconSources(domain){
  return [
    'https://icon.horse/icon/'+domain,
    'https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://'+domain+'&size=128',
    'https://icons.duckduckgo.com/ip3/'+domain+'.ico'
  ];
}
const isCorsIcon = u => /^https:\/\/icon\.horse\//.test(String(u||''));
function letterAvatar(name){
  const clean = String(name||'').trim();
  let ch = clean.charAt(0).toUpperCase();
  if(!ch || /[<>&"]/.test(ch)) ch = '?';
  const h = hashOf(clean), hue = h % 360;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="hsl('+hue+',62%,58%)"/>'
    + '<stop offset="1" stop-color="hsl('+((hue+42)%360)+',66%,42%)"/>'
    + '</linearGradient></defs>'
    + '<rect width="128" height="128" rx="26" fill="url(#g)"/>'
    + '<text x="64" y="72" text-anchor="middle" dominant-baseline="middle" '
    + 'font-family="IBM Plex Sans Arabic, Segoe UI, Arial" font-size="64" font-weight="700" fill="#fff">'+ch+'</text>'
    + '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function autoLogoImg(domain, name){
  if(!domain) return '<img alt="" src="'+esc(letterAvatar(name))+'">';
  const cached = iconCache[domain];
  const first  = cached || iconSources(domain)[0];
  return '<img alt="" loading="lazy" data-logo="1" data-domain="'+esc(domain)+'" data-name="'+esc(name)+'"'
       + (isCorsIcon(first) ? ' crossorigin="anonymous"' : '')
       + ' data-step="'+(cached ? -1 : 0)+'" src="'+esc(first)+'">';
}
/* بعض الخدمات بترجع "أيقونة افتراضية" (كرة أرضية رمادية) بدل ما ترجع خطأ.
   بنكشفها من ألوان الأركان ونتجاهلها عشان نستخدم الحرف الأول الأجمل. */
function looksLikePlaceholder(img){
  try{
    const w = img.naturalWidth, h = img.naturalHeight;
    if(!w || !h) return false;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', {willReadFrequently:true});
    if(!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const pts = [[1,1],[w-2,1],[1,h-2],[w-2,h-2]];
    let grey = 0, opaque = 0;
    for(const [x,y] of pts){
      const d = ctx.getImageData(Math.max(0,x), Math.max(0,y), 1, 1).data;
      if(d[3] < 200) continue;
      opaque++;
      const near = v => Math.abs(v-226) < 14;
      const flat = Math.abs(d[0]-d[1]) < 6 && Math.abs(d[1]-d[2]) < 6;
      if(flat && near(d[0])) grey++;
    }
    return opaque === 4 && grey === 4;      // إطار رمادي موحّد = أيقونة افتراضية
  }catch(e){ return false; }                 // canvas متلوث = منتعاملش معاها كـ placeholder
}

function bindLogos(root){
  $$('img[data-logo="1"]', root).forEach(img=>{
    if(img.dataset.bound === '1') return;
    img.dataset.bound = '1';
    const domain = img.dataset.domain || '';
    const name   = img.dataset.name || '';
    const list   = iconSources(domain);
    let bestUrl = null, bestW = 0;

    const stop = ()=>{
      if(bestUrl && bestW >= 8){
        img.dataset.step = '-2';
        img.src = bestUrl;
        if(iconCache[domain] !== bestUrl){ iconCache[domain] = bestUrl; save(KEY_ICONS, iconCache); }
      }else{
        img.dataset.step = '-3';
        img.src = letterAvatar(name);
      }
    };
    const next = from =>{
      const n = from + 1;
      if(n < list.length){
        img.dataset.step = String(n);
        /* الـ crossOrigin لازم يتظبط قبل تعيين src، ومينفعش يتبعت لمصدر
           مش داعم CORS وإلا الصورة هتتحجب بالكامل */
        if(isCorsIcon(list[n])) img.crossOrigin = 'anonymous';
        else img.removeAttribute('crossorigin');
        img.src = list[n];
      }
      else stop();
    };

    img.addEventListener('error', ()=>{
      const step = parseInt(img.dataset.step,10);
      if(step <= -2) return;
      next(isNaN(step) ? -1 : step);
    });
    img.addEventListener('load', ()=>{
      const step = parseInt(img.dataset.step,10);
      if(step <= -2) return;
      const w = img.naturalWidth;
      if(step === -1){                       // من الكاش
        if(w >= 8){ img.dataset.step = '-2'; return; }
        next(-1); return;
      }
      /* icon.horse خدمة شاملة: لو رجّعت أيقونة افتراضية يبقى الموقع أصلاً
         مالوش favicon، فباقي المصادر هترجع افتراضي كمان => الحرف الأول مباشرة */
      if(isCorsIcon(img.currentSrc || img.src) && looksLikePlaceholder(img)){
        img.dataset.step = '-3';
        img.src = letterAvatar(name);
        return;
      }
      if(w > bestW){ bestW = w; bestUrl = img.currentSrc || img.src; }
      if(w >= ICON_MIN_GOOD){
        img.dataset.step = '-2';
        if(iconCache[domain] !== bestUrl){ iconCache[domain] = bestUrl; save(KEY_ICONS, iconCache); }
        return;
      }
      next(step);
    });
  });
}

/* ============================================================
   4) العرض
   ============================================================ */
function visibleSites(){
  const term = $('#searchInput').value.trim().toLowerCase();
  let list = sites.slice();

  if(term){
    list = list.filter(s =>
      s.name.toLowerCase().includes(term) ||
      s.url.toLowerCase().includes(term)  ||
      s.desc.toLowerCase().includes(term) ||
      s.tags.join(' ').toLowerCase().includes(term)
    );
  }
  if(sortMode === 'newest')      list.sort((a,b)=> b.createdAt - a.createdAt);
  else if(sortMode === 'oldest') list.sort((a,b)=> a.createdAt - b.createdAt);
  else if(sortMode === 'name')   list.sort((a,b)=> a.name.localeCompare(b.name,'ar'));
  return list;
}

function render(){
  const grid = $('#grid');
  const list = visibleSites();

  grid.innerHTML = '';

  if(!list.length){
    grid.innerHTML = sites.length
      ? '<div class="empty"><h3>مفيش نتائج</h3><p>جرّب كلمة بحث تانية.</p></div>'
      : '<div class="empty"><h3>المعرض فاضي</h3></div>';
    updateStats();
    return;
  }

  const frag = document.createDocumentFragment();

  list.forEach((s, i)=>{
    const host = hostOf(s.url);
    const hue  = hashOf(s.name) % 360;
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.id = s.id;

    const coverInner = s.cover
      ? '<img class="shot" alt="" src="'+esc(s.cover)+'">'
      : '<div class="tile">'+autoLogoImg(host, s.name)+'</div>';

    const coverBg = s.cover ? '' :
      ' style="background:linear-gradient(135deg,hsl('+hue+',52%,62%),hsl('+((hue+38)%360)+',56%,44%))"';

    const tagsHtml = s.tags.length
      ? '<div class="tags">' + s.tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join('') + '</div>'
      : '';

    const statusHtml = s.status === 'live'
      ? '<span class="badge live"><i></i>منشور</span>'
      : '<span class="badge wip"><i></i>تحت التطوير</span>';

    card.innerHTML =
      '<div class="cover"'+coverBg+'>'
        + statusHtml
        + '<span class="rank">'+(i+1)+'</span>'
        + coverInner +
      '</div>'
      + '<div class="card-body">'
        + '<h3 class="card-title">'+esc(s.name)+'</h3>'
        + (host ? '<div class="card-host">'+esc(host)+'</div>' : '')
        + (s.desc ? '<p class="card-desc">'+esc(s.desc)+'</p>' : '')
        + tagsHtml
      + '</div>'
      + '<div class="card-foot">'
        + '<a class="btn visit" href="'+esc(normUrl(s.url))+'" target="_blank" rel="noopener noreferrer">'
          + 'زيارة الموقع'
          + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'
        + '</a>'
      + '</div>';

    frag.appendChild(card);
  });

  grid.appendChild(frag);
  bindLogos(grid);
  updateStats();
}

function updateStats(){
  $('#stTotal').textContent = sites.length;
  $('#stLive').textContent  = sites.filter(s=>s.status==='live').length;
  $('#stWip').textContent   = sites.filter(s=>s.status==='wip').length;
}

/* ============================================================
   5) الأحداث
   ============================================================ */
document.addEventListener('keydown', e=>{});

/* بحث وترتيب */
$('#searchInput').addEventListener('input', render);
$('#sortSel').addEventListener('change', function(){
  sortMode = this.value;
  save(KEY_SORT, sortMode);
  render();
});

/* الوضع الليلي */
const SUN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
function applyTheme(mode){
  document.documentElement.setAttribute('data-theme', mode);
  $('#themeBtn').innerHTML = (mode === 'dark') ? SUN : MOON;
  save(KEY_THEME, mode);
}
$('#themeBtn').addEventListener('click', ()=>{
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

/* ============================================================
   8) التشغيل: نحمّل البيانات من ملف JSON الأول وبعدين نعرض
   ============================================================ */
applyTheme(load(KEY_THEME, 'light'));
$('#sortSel').value = sortMode;

(async function start(){
  const raw = await fetchSites();
  if(raw === null){
    /* ملف JSON مش متاح (غالباً فاتح الصفحة بالدبل-كليك من غير سيرفر محلي)
       نحاول نعرض آخر نسخة متخزنة محلياً، ولو مفيش يبقى المعرض فاضي */
    const cached = load(KEY_CACHE, []);
    sites = cached.filter(s => s && typeof s === 'object').map(normalize);
    if(!sites.length) toast('تعذّر تحميل ملف البيانات data/sites.json', true);
  }else{
    sites = raw.filter(s => s && typeof s === 'object').map(normalize);
    save(KEY_CACHE, sites);   // نخزّن نسخة احتياطية محلياً
  }
  render();
})();

})();
