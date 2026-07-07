/* ===================================================================
 * GeoROAD TOGO — UILayoutManager
 *
 * Gestion centralisée des positions et z-index des panneaux UI.
 * Empêche tout chevauchement entre :
 *   - Sidebar (couches) — left
 *   - SIG Toolbar — left
 *   - SIG Info Panel — bottom-left
 *   - SIG Drawer — right
 *   - Info Panel (consultation) — right
 *   - Map Toolbar (FAB) — right
 *   - Bottom bar — bottom
 *   - Draw bar — bottom
 *   - Modals — top overlay
 *
 * Règles :
 *   - Z-index centralisé (constantes)
 *   - Déplacement automatique quand un panneau voisin s'ouvre
 *   - Mode compact sur petit écran
 *   - Aucune palette ne se superpose
 * =================================================================== */
var UILayoutManager = (function() {
  'use strict';

  /* ===== Z-INDEX HIERARCHY (constantes) ===== */
  var Z = {
    MAP: 0,
    HIGHLIGHT: 100,
    SNAP_INDICATOR: 95,
    MEASURE_LAYER: 200,
    DRAW_LAYER: 300,
    VERTEX_LAYER: 350,
    BASE_UI: 400,
    SIDEBAR: 410,
    SIG_TOOLBAR: 520,
    SIG_DRAWER: 700,
    SIG_DRAW_BAR: 480,
    MAP_TOOLBAR: 460,
    BOTTOM_BAR: 400,
    NORTH_ARROW: 250,
    SCALE_BAR: 250,
    TOAST: 1500,
    MODAL: 2000,
    DRAWER_OVERLAY: 900,
    CONTEXT_MENU: 99999,
    TOOLTIP: 950
  };

  /* ===== ÉTAT DES PANNEAUX ===== */
  var panels = {
    sidebar: { el: null, position: 'left', open: true },
    sigToolbar: { el: null, position: 'left', open: false },
    sigDrawer: { el: null, position: 'right', open: false },
    mapToolbar: { el: null, position: 'right', open: false },
    drawBar: { el: null, position: 'bottom', open: false }
  };

  var _listeners = [];
  var _compactMode = false;
  var COMPACT_BREAKPOINT = 768;

  /* ===== INITIALISATION ===== */
  function init() {
    panels.sidebar.el = document.getElementById('sidebar');
    panels.sigToolbar.el = document.getElementById('sig-toolbar');
    panels.sigDrawer.el = document.getElementById('sig-drawer');
    panels.mapToolbar.el = document.getElementById('map-toolbar');
    panels.drawBar.el = document.getElementById('sig-draw-bar');

    /* Écouter les changements de taille */
    window.addEventListener('resize', onResize);
    checkCompactMode();

    /* Observer les mutations de classes pour réagir aux ouvertures/fermetures */
    observePanel('sigDrawer', 'open');
    /* V4.0: sigInfoPanel observer removed */
    observePanel('sidebar', 'collapsed');
    observePanel('sigToolbar', 'visible');
  }

  function observePanel(panelKey, className) {
    var panel = panels[panelKey];
    if (!panel.el) return;

    var observer = new MutationObserver(function() {
      if (className === 'collapsed') {
        panel.collapsed = panel.el.classList.contains(className);
      } else {
        panel.open = panel.el.classList.contains(className);
      }
      recalcLayout();
      emit('layout:changed', { panel: panelKey, open: panel.open });
    });

    observer.observe(panel.el, { attributes: true, attributeFilter: ['class'] });
  }

  /* ===== RECALCUL DES POSITIONS ===== */
  function recalcLayout() {
    applySidebarLayout();
    applyToolbarLayout();
    /* V4.0: applyInfoPanelLayout removed */
    applyDrawerLayout();
    applyCompactAdjustments();
  }

  function applySidebarLayout() {
    var sb = panels.sidebar.el;
    if (!sb) return;
    /* Sidebar : toujours z-index SIDEBAR, position left fixe */
    sb.style.zIndex = Z.SIDEBAR;
  }

  function applyToolbarLayout() {
    var tb = panels.sigToolbar.el;
    var sb = panels.sidebar.el;
    if (!tb) return;
    tb.style.zIndex = Z.SIG_TOOLBAR;

    /* Si la sidebar est ouverte et non collapsée, décaler la toolbar */
    if (sb && !sb.classList.contains('collapsed') && panels.sigToolbar.open) {
      var sbWidth = sb.offsetWidth;
      tb.style.left = (sbWidth + 10) + 'px';
    } else {
      tb.style.left = '10px';
    }
  }

  /* V4.0: applyInfoPanelLayout removed — sigInfoPanel no longer exists */

  function applyDrawerLayout() {
    var dr = panels.sigDrawer.el;
    if (!dr) return;
    dr.style.zIndex = Z.SIG_DRAWER;
  }

  function applyCompactAdjustments() {
    var sb = panels.sidebar.el;
    var tb = panels.sigToolbar.el;
    var dr = panels.sigDrawer.el;
    var mb = panels.mapToolbar.el;
    var db = panels.drawBar.el;

    /* Les règles CSS gèrent déjà la majorité du responsive.
       Ici on ne fait que neutraliser les offsets inline du desktop
       quand on bascule en compact pour éviter les panneaux hors écran. */
    if (_compactMode) {
      if (tb) {
        tb.style.left = '8px';
        tb.style.right = 'auto';
        tb.style.top = 'auto';
        tb.style.bottom = '42px';
      }
      if (dr) {
        dr.style.left = '0';
        dr.style.right = '0';
      }
      if (mb) {
        mb.style.left = 'auto';
        mb.style.right = '8px';
        mb.style.top = 'auto';
        mb.style.bottom = '42px';
      }
      if (db) {
        db.style.left = '0';
        db.style.right = '0';
        db.style.bottom = '0';
      }
      return;
    }

    if (tb) {
      tb.style.left = (sb && !sb.classList.contains('collapsed') && panels.sigToolbar.open ? (sb.offsetWidth + 10) : 10) + 'px';
      tb.style.right = '';
      tb.style.top = '60px';
      tb.style.bottom = '';
    }
    if (mb) {
      mb.style.left = '';
      mb.style.right = '';
      mb.style.top = '12px';
      mb.style.bottom = '';
    }
    if (dr) {
      dr.style.left = '';
      dr.style.right = '';
    }
    if (db) {
      db.style.left = '';
      db.style.right = '';
    }
  }

  /* ===== MODE COMPACT ===== */
  function checkCompactMode() {
    _compactMode = window.innerWidth <= COMPACT_BREAKPOINT;
    if (_compactMode) {
      document.body.classList.add('uil-compact');
      autoCollapsePanels();
    } else {
      document.body.classList.remove('uil-compact');
    }
  }

  function autoCollapsePanels() {
    /* V4.0: sigInfoPanel collapse removed */
  }

  function onResize() {
    checkCompactMode();
    recalcLayout();
  }

  /* ===== API PUBLIQUE ===== */
  function setPanelState(panelKey, state) {
    if (panels[panelKey]) {
      if (state === 'open') {
        panels[panelKey].open = true;
      } else if (state === 'closed') {
        panels[panelKey].open = false;
      }
      recalcLayout();
    }
  }

  function getZ(key) {
    return Z[key] || 0;
  }

  function isCompact() { return _compactMode; }

  /* ===== EVENT SYSTEM ===== */
  function on(evt, fn) { _listeners.push({ evt: evt, fn: fn }); }
  function off(evt, fn) { _listeners = _listeners.filter(function(l) { return !(l.evt === evt && l.fn === fn); }); }
  function emit(evt, data) {
    _listeners.forEach(function(l) {
      if (l.evt === evt) { try { l.fn(data); } catch(e) { console.warn('UILayoutManager:', e); } }
    });
  }

  /* Auto-init */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init: init,
    recalcLayout: recalcLayout,
    setPanelState: setPanelState,
    getZ: getZ,
    isCompact: isCompact,
    on: on, off: off, emit: emit,
    Z: Z
  };
})();

/* ===================================================================
 * GeoROADTextNormalizer
 *
 * Corrige le mojibake issu d'un encodage HTML/JS incohérent.
 * S'applique sur les textes déjà rendus et sur les nouveaux noeuds
 * injectés dynamiquement par les modules admin / geoportail.
 * =================================================================== */
var GeoROADTextNormalizer = (function() {
  'use strict';

  var CP1252_REVERSE = {
    8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135,
    710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142,
    8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151,
    732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159
  };

  var NORMALIZABLE_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'value', 'data-tooltip', 'alt'];
  var observer = null;

  function shouldNormalize(text) {
    return typeof text === 'string' && /[ÃÂâ]/.test(text);
  }

  function decodeOnce(text) {
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code <= 255) {
        bytes[i] = code;
      } else if (CP1252_REVERSE[code] !== undefined) {
        bytes[i] = CP1252_REVERSE[code];
      } else {
        return text;
      }
    }
    try {
      var decoded = new TextDecoder('utf-8').decode(bytes);
      return decoded.indexOf('�') !== -1 ? text : decoded;
    } catch(e) {
      return text;
    }
  }

  function decodeText(text) {
    if (!shouldNormalize(text)) return text;
    var current = text;
    for (var pass = 0; pass < 4; pass++) {
      var next = decodeOnce(current);
      if (!next || next === current) break;
      current = next;
      if (!shouldNormalize(current)) break;
    }
    return current;
  }

  function normalizeAttributes(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    for (var i = 0; i < NORMALIZABLE_ATTRIBUTES.length; i++) {
      var name = NORMALIZABLE_ATTRIBUTES[i];
      var value = el.getAttribute(name);
      if (value && shouldNormalize(value)) {
        var fixed = decodeText(value);
        if (fixed !== value) {
          el.setAttribute(name, fixed);
          if (name === 'value' && typeof el.value !== 'undefined') {
            el.value = fixed;
          }
        }
      }
    }
  }

  function normalizeNode(root) {
    if (!root || typeof document === 'undefined') return;

    var walk = function(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        var fixedText = decodeText(node.nodeValue || '');
        if (fixedText !== node.nodeValue) {
          node.nodeValue = fixedText;
        }
        return;
      }
      if (node.nodeType === 1) {
        normalizeAttributes(node);
      }
      if (node.childNodes && node.childNodes.length) {
        for (var i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
      }
    };

    walk(root);
  }

  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    var target = document.body || document.documentElement;
    if (!target) return;
    observer = new MutationObserver(function(records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (!record.addedNodes) continue;
        for (var j = 0; j < record.addedNodes.length; j++) {
          normalizeNode(record.addedNodes[j]);
        }
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    if (typeof document === 'undefined') return;
    normalizeNode(document.body || document.documentElement);
    startObserver();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      setTimeout(init, 0);
    }
  }

  return {
    decodeText: decodeText,
    normalizeNode: normalizeNode,
    init: init
  };
})();

/* ===================================================================
 * GeoROADDownload
 *
 * Démarre les téléchargements de blobs de manière fiable.
 * Attache temporairement le lien au DOM avant le clic, puis le retire.
 * =================================================================== */
var GeoROADDownload = (function() {
  'use strict';

  function downloadBlob(blob, filename, options) {
    options = options || {};
    var revokeDelay = typeof options.revokeDelayMs === 'number' ? options.revokeDelayMs : 400;

    if (typeof navigator !== 'undefined' && navigator.msSaveOrOpenBlob) {
      navigator.msSaveOrOpenBlob(blob, filename);
      return true;
    }

    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return false;
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    link.rel = 'noopener';
    link.style.display = 'none';

    (document.body || document.documentElement).appendChild(link);
    link.click();

    setTimeout(function() {
      if (link.parentNode) link.parentNode.removeChild(link);
      URL.revokeObjectURL(url);
    }, revokeDelay);

    return true;
  }

  return {
    downloadBlob: downloadBlob
  };
})();
