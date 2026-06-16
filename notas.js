/* notas.js – Sistema de notas por campo (como comentarios de celda Excel)
   Se inyecta en los iframes de indicadores desde las páginas de área. */
(function () {
  'use strict';

  // Namespace único por página (últimos 3 segmentos de la ruta, sin extensión)
  const NS = location.pathname
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .slice(-3)
    .join('/')
    .replace(/\.html$/i, '');

  // Periodo del iframe (pasado como ?anio=...&mes=... por la página padre)
  const _p  = new URLSearchParams(location.search);
  const _anio = _p.get('anio') || String(new Date().getFullYear());
  const _mes  = String(_p.get('mes') || (new Date().getMonth() + 1)).padStart(2, '0');
  const PERIODO = `${_anio}_${_mes}`;

  const KEY = id => `_nota_${NS}_${PERIODO}_${id}`;
  const get = id => localStorage.getItem(KEY(id)) || '';
  const set = (id, text) => {
    text = (text || '').trim();
    if (text) localStorage.setItem(KEY(id), text);
    else localStorage.removeItem(KEY(id));
  };

  /* ── Estilos ── */
  const style = document.createElement('style');
  style.textContent = `
    ._nb {
      position: absolute; top: 2px; right: 2px; z-index: 20;
      width: 14px; height: 14px; border-radius: 50%;
      background: #fff3c4; border: 1.5px solid #f59e0b;
      cursor: pointer; padding: 0; line-height: 1;
      font-size: 8px; font-weight: 900; color: #92400e;
      opacity: 0; transition: opacity .12s;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    ._nb._on { background: #fbbf24; border-color: #d97706; opacity: 1 !important; }
    ._nh:hover ._nb { opacity: 0.75; }
    ._nh:hover ._nb._on { opacity: 1; }

    ._np {
      position: fixed; z-index: 99999;
      background: #fffbeb; border: 1.5px solid #f59e0b;
      border-radius: 9px; box-shadow: 0 6px 28px rgba(0,0,0,.22);
      padding: 11px 13px; width: 265px; display: none;
      font-family: 'Segoe UI', Tahoma, sans-serif;
    }
    ._np._open { display: block; }
    ._np h4 { margin: 0 0 7px; font-size: 11.5px; color: #78350f; font-weight: 700; }
    ._np textarea {
      width: 100%; box-sizing: border-box;
      border: 1px solid #fcd34d; border-radius: 5px;
      padding: 5px 7px; font-size: 11.5px; font-family: inherit;
      resize: vertical; min-height: 76px;
      background: #fff; color: #1c1c1e; outline: none;
    }
    ._np textarea:focus { border-color: #f59e0b; }
    ._np ._na { display: flex; gap: 5px; margin-top: 7px; }
    ._np ._ns {
      flex: 1; background: #f59e0b; color: #fff; border: none;
      border-radius: 5px; padding: 5px 0; font-size: 11.5px;
      font-weight: 700; cursor: pointer;
    }
    ._np ._ns:hover { background: #d97706; }
    ._np ._nd {
      background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5;
      border-radius: 5px; padding: 5px 9px; font-size: 11px; cursor: pointer;
    }
    ._np ._nd:hover { background: #fecaca; }
    ._np ._nc {
      background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0;
      border-radius: 5px; padding: 5px 9px; font-size: 11px; cursor: pointer;
    }
    ._np ._nc:hover { background: #e2e8f0; }
  `;
  document.head.appendChild(style);

  /* ── Popup ── */
  const pop = document.createElement('div');
  pop.className = '_np';
  pop.innerHTML = `
    <h4>📝 Nota</h4>
    <textarea id="_nta" placeholder="Escribe tu nota aquí..."></textarea>
    <div class="_na">
      <button class="_ns" id="_nsa">Guardar</button>
      <button class="_nd" id="_nde">Eliminar</button>
      <button class="_nc" id="_ncl">✕ Cerrar</button>
    </div>`;
  document.body.appendChild(pop);

  const ta = pop.querySelector('#_nta');
  let curId = null, curBtn = null;

  function refreshBtn(btn, id) {
    const n = get(id);
    btn.title = n || 'Agregar nota';
    if (n) btn.classList.add('_on');
    else   btn.classList.remove('_on');
  }

  function openPop(id, btn) {
    curId = id; curBtn = btn;
    ta.value = get(id);
    const r = btn.getBoundingClientRect();
    let top  = r.bottom + 6;
    let left = r.left - 240;
    if (top + 200 > window.innerHeight) top = r.top - 208;
    if (left < 4) left = r.right + 4;
    if (left + 270 > window.innerWidth) left = window.innerWidth - 274;
    pop.style.top  = Math.max(4, top)  + 'px';
    pop.style.left = Math.max(4, left) + 'px';
    pop.classList.add('_open');
    setTimeout(() => ta.focus(), 30);
  }

  function closePop() { pop.classList.remove('_open'); curId = curBtn = null; }

  pop.querySelector('#_nsa').onclick = () => {
    if (!curId) return;
    set(curId, ta.value);
    refreshBtn(curBtn, curId);
    closePop();
  };
  pop.querySelector('#_nde').onclick = () => {
    if (!curId) return;
    set(curId, '');
    ta.value = '';
    refreshBtn(curBtn, curId);
    closePop();
  };
  pop.querySelector('#_ncl').onclick = closePop;

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  document.addEventListener('click', e => {
    if (!pop.contains(e.target) && !e.target.classList.contains('_nb')) closePop();
  });

  /* ── Adjuntar botón de nota a un input ── */
  function attach(inp) {
    if (inp.dataset._ni) return;
    inp.dataset._ni = '1';

    const host = inp.closest('td') || inp.parentElement;
    if (!host) return;
    host.classList.add('_nh');
    if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = '_nb';
    btn.textContent = '●';
    host.appendChild(btn);
    refreshBtn(btn, inp.id);

    btn.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      openPop(inp.id, btn);
    });
  }

  /* ── Inicializar en todos los inputs/textareas editables con id ── */
  function init() {
    document.querySelectorAll(
      'input[id]:not([readonly]):not([tabindex="-1"]), textarea[id]'
    ).forEach(el => {
      if (!el.closest('._np')) attach(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
