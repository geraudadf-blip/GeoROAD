/* ===================================================================
 * GeoROAD TOGO — Bundle utils
 * Auto-généré par build_bundles.py — NE PAS ÉDITER MANUELLEMENT
 * Source : ui-layout-manager.js
 * ===================================================================
 */


/* ===== ui-layout-manager.js ===== */

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
