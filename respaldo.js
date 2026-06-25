/* respaldo.js — Respaldo automático del sistema de indicadores
   Se incluye en páginas de área e index. En iframes solo intercepta
   localStorage sin mostrar UI. */
(function () {
  'use strict';

  const ES_CLAVE = k =>
    /^(ind_|real_|indcomp\d|indcont\d|indfin\d|indop\d|indgh\d|indhseq\d|indger\d|_nota_)/.test(k);

  // ── IndexedDB ──────────────────────────────────────────────
  const DB_NAME = 'IndicadoresRespaldo';
  let _db = null;

  function abrirDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('backup'))  d.createObjectStore('backup');
        if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles');
      };
      r.onsuccess = e => { _db = e.target.result; res(_db); };
      r.onerror   = () => rej(r.error);
    });
  }

  function idbSet(store, key, val) {
    return abrirDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(val, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));
  }

  function idbGet(store, key) {
    return abrirDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(store, 'readonly');
      const r  = tx.objectStore(store).get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }

  // ── Datos del sistema ──────────────────────────────────────
  function snapshot() {
    const d = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (ES_CLAVE(k)) d[k] = localStorage.getItem(k);
    }
    return d;
  }

  function payload() {
    return { version: 2, savedAt: new Date().toISOString(), origen: location.origin, data: snapshot() };
  }

  // ── File System Access API ─────────────────────────────────
  let _handle = null;

  async function cargarHandle() {
    try { _handle = await idbGet('handles', 'file'); } catch { _handle = null; }
  }

  async function tienePermisoArchivo() {
    if (!_handle) return false;
    try {
      const p = await _handle.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') return true;
      const p2 = await _handle.requestPermission({ mode: 'readwrite' });
      return p2 === 'granted';
    } catch { return false; }
  }

  async function escribirArchivo(p) {
    if (!(await tienePermisoArchivo())) return false;
    try {
      const w = await _handle.createWritable();
      await w.write(JSON.stringify(p, null, 2));
      await w.close();
      return true;
    } catch { return false; }
  }

  // ── Motor de respaldo ──────────────────────────────────────
  let _timer     = null;
  let _ultimoTs  = null;
  let _enArchivo = false;

  function programar() { clearTimeout(_timer); _timer = setTimeout(respaldar, 1500); }

  async function respaldar() {
    const p = payload();
    if (!Object.keys(p.data).length) return;
    await idbSet('backup', 'ultimo', p);
    _enArchivo = await escribirArchivo(p);
    _ultimoTs  = new Date();
    if (window.self === window.top) actualizarUI();
  }

  // Respaldo periódico cada 60 s (captura guardados desde iframes)
  setInterval(respaldar, 60_000);

  // ── Interceptar localStorage ───────────────────────────────
  const _set = Storage.prototype.setItem;
  const _del = Storage.prototype.removeItem;

  localStorage.setItem = function (k, v) {
    _set.call(this, k, v);
    if (ES_CLAVE(k)) programar();
  };
  localStorage.removeItem = function (k) {
    _del.call(this, k);
    if (ES_CLAVE(k)) programar();
  };

  window.addEventListener('storage', e => { if (e.key && ES_CLAVE(e.key)) programar(); });

  // ── Restaurar ─────────────────────────────────────────────
  async function restaurarDesdeIDB() {
    try {
      const p = await idbGet('backup', 'ultimo');
      if (!p?.data || !Object.keys(p.data).length) {
        return alert('No hay respaldo interno disponible en este navegador.');
      }
      aplicar(p);
    } catch { alert('Error al leer el respaldo interno.'); }
  }

  async function restaurarDesdeArchivo() {
    try {
      const [h] = await window.showOpenFilePicker({ types: [{ accept: { 'application/json': ['.json'] } }] });
      const txt = await (await h.getFile()).text();
      aplicar(JSON.parse(txt));
    } catch (e) { if (e.name !== 'AbortError') alert('Error al leer el archivo: ' + e.message); }
  }

  function aplicar(p) {
    const claves = Object.keys(p.data || {});
    if (!claves.length) return alert('El respaldo está vacío.');
    const fecha = p.savedAt ? new Date(p.savedAt).toLocaleString('es-CO') : 'desconocida';
    if (!confirm(`Restaurar ${claves.length} registros del respaldo guardado el:\n${fecha}\n\nEsto reemplazará los datos actuales. ¿Continuar?`)) return;
    claves.forEach(k => _set.call(localStorage, k, p.data[k]));
    alert(`✅ ${claves.length} registros restaurados correctamente.\nLa página se recargará.`);
    location.reload();
  }

  // ── Configurar archivo persistente ────────────────────────
  async function configurarArchivo() {
    if (!('showSaveFilePicker' in window)) {
      return alert('Tu navegador no soporta esta función.\nUsa Chrome o Edge actualizado.\n\nSe seguirá usando el respaldo interno.');
    }
    try {
      _handle = await window.showSaveFilePicker({
        suggestedName: 'respaldo-indicadores.json',
        types: [{ accept: { 'application/json': ['.json'] } }]
      });
      await idbSet('handles', 'file', _handle);
      await respaldar();
      cerrarPanel();
      alert('✅ Archivo de respaldo configurado.\nSe actualizará automáticamente cada vez que guardes datos.');
    } catch (e) { if (e.name !== 'AbortError') alert('Error: ' + e.message); }
  }

  // Descarga directa (sin File System API)
  function descargarJSON() {
    const p    = payload();
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `respaldo-indicadores-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ── UI (solo en ventana principal, no en iframes) ──────────
  function crearUI() {
    const css = `
      #_rb_badge {
        position:fixed; bottom:14px; left:14px; z-index:99999;
        width:38px; height:38px; border-radius:50%;
        background:#0f172a; border:2px solid #475569;
        display:flex; align-items:center; justify-content:center;
        font-size:17px; cursor:pointer;
        box-shadow:0 2px 12px rgba(0,0,0,.5); transition:transform .15s;
        user-select:none;
      }
      #_rb_badge:hover { transform:scale(1.12); }
      #_rb_badge._ok  { border-color:#22c55e; }
      #_rb_badge._warn{ border-color:#f59e0b; }
      #_rb_panel {
        position:fixed; bottom:60px; left:14px; z-index:99998;
        background:#0f172a; border:1px solid #334155; border-radius:14px;
        padding:16px; width:270px;
        box-shadow:0 8px 32px rgba(0,0,0,.6);
        font-family:'Segoe UI',sans-serif; font-size:13px; color:#e2e8f0;
        display:none;
      }
      #_rb_panel h4 {
        margin:0 0 4px; font-size:11px; font-weight:700;
        color:#64748b; text-transform:uppercase; letter-spacing:.06em;
      }
      #_rb_panel p { margin:0 0 12px; font-size:12px; color:#94a3b8; line-height:1.5; }
      ._rbb {
        display:block; width:100%; margin-bottom:7px;
        padding:8px 12px; border:none; border-radius:8px;
        font-size:12px; font-weight:600; cursor:pointer; text-align:left;
        transition:filter .1s;
      }
      ._rbb:hover { filter:brightness(1.18); }
      ._rbb.azul  { background:#3b82f6; color:#fff; }
      ._rbb.gris  { background:#1e293b; color:#cbd5e1; border:1px solid #334155; }
      ._rbb.verde { background:#14532d; color:#86efac; border:1px solid #166534; }
      #_rb_st {
        margin-top:10px; padding-top:10px; border-top:1px solid #1e293b;
        font-size:11px; color:#475569; line-height:1.6;
      }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);

    const badge = document.createElement('div');
    badge.id = '_rb_badge';
    badge.innerHTML = '💾';
    badge.title = 'Respaldo automático';
    badge.onclick = togglePanel;
    document.body.appendChild(badge);

    const panel = document.createElement('div');
    panel.id = '_rb_panel';
    panel.innerHTML = `
      <h4>💾 Respaldo automático</h4>
      <p id="_rb_info">Configura un archivo de respaldo en tu PC para proteger todos tus datos.</p>
      <button class="_rbb azul"  onclick="window._RB.configurar()">📁 Configurar archivo en PC</button>
      <button class="_rbb gris"  onclick="window._RB.descargar()">⬇ Descargar respaldo ahora</button>
      <button class="_rbb verde" onclick="window._RB.restaurarArchivo()">📂 Restaurar desde archivo</button>
      <button class="_rbb gris"  onclick="window._RB.restaurarIDB()">🔄 Restaurar respaldo interno</button>
      <div id="_rb_st">Sin respaldo reciente</div>
    `;
    document.body.appendChild(panel);

    document.addEventListener('click', e => {
      const b = document.getElementById('_rb_badge');
      const p = document.getElementById('_rb_panel');
      if (b && p && !b.contains(e.target) && !p.contains(e.target)) cerrarPanel();
    });
  }

  let _panelVisible = false;
  function togglePanel() {
    _panelVisible = !_panelVisible;
    const p = document.getElementById('_rb_panel');
    if (p) p.style.display = _panelVisible ? 'block' : 'none';
  }
  function cerrarPanel() {
    _panelVisible = false;
    const p = document.getElementById('_rb_panel');
    if (p) p.style.display = 'none';
  }

  function actualizarUI() {
    const badge = document.getElementById('_rb_badge');
    const st    = document.getElementById('_rb_st');
    const info  = document.getElementById('_rb_info');
    if (!badge) return;

    const claves = Object.keys(snapshot()).length;
    const hora   = _ultimoTs ? _ultimoTs.toLocaleTimeString('es-CO') : '—';

    if (_enArchivo) {
      badge.className = '_ok';
      badge.innerHTML = '💾';
      if (st)   st.innerHTML   = `✅ Archivo actualizado · <b>${hora}</b><br>${claves} registros respaldados`;
      if (info) info.textContent = `Archivo en PC actualizado automáticamente.`;
    } else {
      badge.className = '_warn';
      badge.innerHTML = '⚠️';
      if (st)   st.innerHTML   = `🔄 Respaldo interno · <b>${hora}</b><br>${claves} registros · Sin archivo en PC`;
      if (info) info.textContent = `Configura un archivo para guardar en tu PC automáticamente.`;
    }
  }

  // ── API pública ────────────────────────────────────────────
  window._RB = {
    configurar       : configurarArchivo,
    descargar        : descargarJSON,
    restaurarArchivo : restaurarDesdeArchivo,
    restaurarIDB     : restaurarDesdeIDB,
  };

  // ── Inicio ─────────────────────────────────────────────────
  (async function init() {
    await cargarHandle();
    if (window.self === window.top) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', crearUI);
      } else {
        crearUI();
      }
    }
    // Respaldo inicial al cargar (espera a que la página cargue sus datos)
    setTimeout(respaldar, 3000);
  })().catch(() => {});

})();
