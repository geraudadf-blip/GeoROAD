/* ===================================================================
 * GeoROAD TOGO — Module Gestion des Ouvrages d'Art
 *
 * CRUD complet pour les ouvrages d'art (ponts, dalots, buses, etc.).
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Remplacer le stockage localStorage par des appels fetch('/api/ouvrages')
 *   - Garder la même interface (getById, getAll, save, remove)
 *
 * Données persistées via SIGPersistence ('layers.ouvrages') et exposées
 * dans window.json_Ouvrages pour accès par la carte et autres modules.
 * =================================================================== */
var OuvrageModule = (function() {
  'use strict';

  /* ===== CONFIGURATION ===== */
  var PER_PAGE = 10;

  var TYPE_OPTIONS = ['Pont', 'Dalot', 'Buse', 'Caniveau', 'Mur de sout\u00e8nement'];
  var ETAT_OPTIONS = ['Bon', 'Moyen', 'Mauvais', 'En travaux'];

  var TYPE_COLORS = {
    'Pont': '#4a9eff',
    'Dalot': '#ff9f43',
    'Buse': '#2ed573',
    'Caniveau': '#a55eea',
    'Mur de sout\u00e8nement': '#ff6b6b'
  };

  var TYPE_ICONS = {
    'Pont': 'fa-bridge',
    'Dalot': 'fa-arrows-alt-v',
    'Buse': 'fa-water',
    'Caniveau': 'fa-grip-lines',
    'Mur de sout\u00e8nement': 'fa-building'
  };

  var ETAT_CLASSES = {
    'Bon': 'active',
    'Moyen': 'pending',
    'Mauvais': 'inactive',
    'En travaux': 'pending'
  };

  /* ===== ÉTAT INTERNE ===== */
  var state = {
    allOuvrages: [],    /* Array de GeoJSON Feature {type,id,geometry,properties} */
    filtered: [],       /* Résultat après filtres */
    page: 1,
    search: '',
    filters: { type: '', etat: '', route: '' }
  };

  /* ===== HELPER D'ÉCHAPPEMENT ===== */
  function esc(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  function escapeAttr(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  /* ===== RBAC ===== */
  function isAdmin() {
    try {
      var session = typeof AdminAuth !== 'undefined' ? AdminAuth.getSession() : null;
      return session && (session.role === 'administrateur' || session.role === 'Administrateur');
    } catch (e) { return false; }
  }

  function canEdit() {
    return isAdmin();
  }

  function getSessionName() {
    try {
      var session = typeof AdminAuth !== 'undefined' ? AdminAuth.getSession() : null;
      return session ? (session.name || session.user || 'Inconnu') : 'Inconnu';
    } catch (e) { return 'Inconnu'; }
  }

  /* ===== DATA ACCESS LAYER ===== */

  /** Charge les données ouvrages — base vidée (nettoyage fonctionnel).
   *  Les ouvrages d'art de test ont été supprimés.
   *  La base repart d'une collection vide.
   */
  function loadData() {
    /* Purger toute donnée existante dans le localStorage */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.deleteLayer('layers.ouvrages');
    }
    /* Aussi supprimer par clé brute au cas où */
    try { localStorage.removeItem('georoad_sig.layers.ouvrages'); } catch(e) {}

    /* Forcer une collection vide */
    var fc = { type: 'FeatureCollection', features: [] };
    state.allOuvrages = [];
    state.filtered = [];
    state.page = 1;
    state.search = '';
    state.filters = { type: '', etat: '', route: '' };

    /* Exposer globalement pour la carte et autres modules */
    window.json_Ouvrages = fc;
  }

  /** Retourne la liste des noms de routes depuis json_Rseauroutier_6. */
  function getRouteList() {
    if (typeof json_Rseauroutier_6 === 'undefined' || !json_Rseauroutier_6.features) return [];
    return json_Rseauroutier_6.features.map(function(f, idx) {
      return {
        index: idx,
        name: (f.properties && f.properties.Name) || ('Route ' + idx)
      };
    });
  }

  /** Retourne l'index de la route dans json_Rseauroutier_6. */
  function getRouteIndex(routeName) {
    if (typeof json_Rseauroutier_6 === 'undefined' || !json_Rseauroutier_6.features) return 0;
    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var rName = (json_Rseauroutier_6.features[i].properties && json_Rseauroutier_6.features[i].properties.Name) || '';
      if (rName === routeName) return i;
    }
    return 0;
  }

  /** Trouve un ouvrage par son id. */
  function findOuvrage(id) {
    for (var i = 0; i < state.allOuvrages.length; i++) {
      if (String(state.allOuvrages[i].id) === String(id)) return state.allOuvrages[i];
    }
    return null;
  }

  /** Construit le FeatureCollection à partir de state.allOuvrages. */
  function buildFeatureCollection() {
    return { type: 'FeatureCollection', features: state.allOuvrages };
  }

  /** Persiste vers localStorage, met à jour window.json_Ouvrages et notifie. */
  function persistAndNotify(eventType, detail) {
    var fc = buildFeatureCollection();
    window.json_Ouvrages = fc;

    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.saveLayer('layers.ouvrages', fc);
    }

    /* Refresh map layer */
    if (typeof SIGMapLayers !== 'undefined' && typeof SIGMapLayers.reloadPK === 'function') {
      SIGMapLayers.reloadPK();
    }

    if (typeof SIGEventBus !== 'undefined') {
      var evtType = eventType || 'sig:feature:updated';
      SIGEventBus.emit(evtType, detail || {});
      SIGEventBus.emit('sig:stats:changed', { source: 'ouvrages' });
      SIGEventBus.emit('sig:dashboard:refresh', {});
    }

    /* Audit trail */
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        var action = detail && detail.action ? detail.action : 'UPDATE';
        SIGAuditTrail.log({
          action: 'OUVRAGE_' + action,
          featureId: (detail && detail.id) || null,
          user: getSessionName(),
          details: detail || {}
        });
      } catch (e) {}
    }
  }

  /* ===== STATISTIQUES ===== */

  function computeStats() {
    var total = state.allOuvrages.length;
    var typeCounts = {};
    var etatCounts = {};

    TYPE_OPTIONS.forEach(function(t) { typeCounts[t] = 0; });
    ETAT_OPTIONS.forEach(function(e) { etatCounts[e] = 0; });

    state.allOuvrages.forEach(function(o) {
      var p = o.properties || {};
      var t = p.type || '';
      var e = p.etat || '';
      if (typeCounts[t] !== undefined) typeCounts[t]++;
      if (etatCounts[e] !== undefined) etatCounts[e]++;
    });

    return { total: total, typeCounts: typeCounts, etatCounts: etatCounts };
  }

  /* ===== FILTRAGE & RECHERCHE ===== */

  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;

    state.filtered = state.allOuvrages.filter(function(o) {
      var p = o.properties || {};

      /* Recherche textuelle */
      if (s) {
        var haystack = ((p.nom || '') + ' ' + (p.type || '') + ' ' + (p.route || '') + ' ' + (p.pk || '') + ' ' + (p.observations || '')).toLowerCase();
        if (haystack.indexOf(s) === -1) return false;
      }

      /* Filtres */
      if (f.type && p.type !== f.type) return false;
      if (f.etat && p.etat !== f.etat) return false;
      if (f.route && p.route !== f.route) return false;

      return true;
    });

    if (state.page > totalPages()) state.page = 1;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE));
  }

  function getPageData() {
    var start = (state.page - 1) * PER_PAGE;
    return state.filtered.slice(start, start + PER_PAGE);
  }

  /* ===== NOTIFICATION TOAST ===== */
  function notify(msg, type) {
    type = type || 'success';
    var existing = document.getElementById('ouvrage-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'ouvrage-toast';
    toast.className = 'route-toast ' + type;
    var icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    toast.innerHTML = '<i class="fas ' + icon + '"></i> ' + esc(msg);
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
  }

  /* ===== RENDU HTML ===== */

  /** Point d'entrée principal — rend la page complète. */
  function render() {
    loadData();
    applyFilters();
    return buildPage();
  }

  function buildPage() {
    var stats = computeStats();

    /* Page header */
    var html = '<div class="page-header">'
      + '<h1><i class="fas fa-bridge" style="margin-right:10px;color:var(--gold)"></i>Gestion des ouvrages d\'art</h1>'
      + '<p>Consultation, cr\u00e9ation et gestion des ' + stats.total + ' ouvrages d\'art du r\u00e9seau routier</p>'
      + '</div>';

    /* Stats row */
    html += '<div class="stats-row grid-2">';

    /* Total */
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-bridge"></i></div><div class="sc-value">' + stats.total + '</div><div class="sc-label">Ouvrages totaux</div></div>';

    /* Type breakdown with mini bar chart */
    var maxTypeCount = 0;
    TYPE_OPTIONS.forEach(function(t) { if (stats.typeCounts[t] > maxTypeCount) maxTypeCount = stats.typeCounts[t]; });
    var typeBarHtml = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">';
    TYPE_OPTIONS.forEach(function(t) {
      var count = stats.typeCounts[t] || 0;
      var pct = maxTypeCount > 0 ? Math.max(8, (count / maxTypeCount) * 100) : 0;
      var color = TYPE_COLORS[t] || '#4a9eff';
      var shortLabel = t === 'Mur de sout\u00e8nement' ? 'Mur' : t;
      typeBarHtml += '<div style="display:flex;align-items:center;gap:8px;font-size:.78rem">'
        + '<span style="width:52px;color:var(--text-3);text-align:right;flex-shrink:0">' + esc(shortLabel) + '</span>'
        + '<div style="flex:1;background:var(--bg-3,#111);border-radius:4px;height:14px;overflow:hidden;min-width:60px">'
        + '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;transition:width .3s"></div>'
        + '</div>'
        + '<span style="width:24px;color:var(--text,#e0e0e0);font-weight:600">' + count + '</span>'
        + '</div>';
    });
    typeBarHtml += '</div>';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-chart-bar"></i></div><div class="sc-label">R\u00e9partition par type</div>' + typeBarHtml + '</div>';

    /* État distribution */
    var etatHtml = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">';
    ETAT_OPTIONS.forEach(function(e) {
      var count = stats.etatCounts[e] || 0;
      var cls = ETAT_CLASSES[e] || 'pending';
      etatHtml += '<span class="status-badge ' + cls + '" style="font-size:.8rem;padding:4px 10px;border-radius:20px;cursor:default">' + esc(e) + ': <strong>' + count + '</strong></span>';
    });
    etatHtml += '</div>';
    html += '<div class="stat-card-admin"><div class="sc-icon green"><i class="fas fa-clipboard-check"></i></div><div class="sc-label">R\u00e9partition par \u00e9tat</div>' + etatHtml + '</div>';

    html += '</div>';

    /* Barre d'actions : recherche + filtres + bouton ajouter */
    html += '<div class="routes-toolbar">';
    html += '<div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="ouvrage-search-input" placeholder="Rechercher par nom, type, route, PK..." value="' + escapeAttr(state.search) + '" oninput="OuvrageModule.onSearch(this.value)">';
    html += '</div>';
    html += '<div class="routes-actions">';

    /* Filtre par type */
    html += '<select id="ouvrage-filter-type" onchange="OuvrageModule.onFilter(\'type\', this.value)" style="background:var(--bg-3,#111);border:1px solid var(--border,#333);color:var(--text,#e0e0e0);padding:8px 12px;border-radius:6px;min-width:160px;margin-right:6px;font-size:.85rem">';
    html += '<option value="">-- Tous les types --</option>';
    TYPE_OPTIONS.forEach(function(t) {
      var sel = t === state.filters.type ? ' selected' : '';
      html += '<option value="' + escapeAttr(t) + '"' + sel + '>' + esc(t) + '</option>';
    });
    html += '</select>';

    /* Filtre par état */
    html += '<select id="ouvrage-filter-etat" onchange="OuvrageModule.onFilter(\'etat\', this.value)" style="background:var(--bg-3,#111);border:1px solid var(--border,#333);color:var(--text,#e0e0e0);padding:8px 12px;border-radius:6px;min-width:140px;margin-right:6px;font-size:.85rem">';
    html += '<option value="">-- Tous les \u00e9tats --</option>';
    ETAT_OPTIONS.forEach(function(e) {
      var sel = e === state.filters.etat ? ' selected' : '';
      html += '<option value="' + escapeAttr(e) + '"' + sel + '>' + esc(e) + '</option>';
    });
    html += '</select>';

    /* Filtre par route */
    var routes = getRouteList();
    html += '<select id="ouvrage-filter-route" onchange="OuvrageModule.onFilter(\'route\', this.value)" style="background:var(--bg-3,#111);border:1px solid var(--border,#333);color:var(--text,#e0e0e0);padding:8px 12px;border-radius:6px;min-width:180px;margin-right:8px;font-size:.85rem">';
    html += '<option value="">-- Toutes les routes --</option>';
    routes.forEach(function(r) {
      var sel = String(r.name) === String(state.filters.route) ? ' selected' : '';
      html += '<option value="' + escapeAttr(r.name) + '"' + sel + '>' + esc(r.name) + '</option>';
    });
    html += '</select>';

    if (canEdit()) {
      html += '<button class="btn-sm primary" onclick="OuvrageModule.openCreateModal()"><i class="fas fa-plus"></i> Ajouter un ouvrage</button>';
    }
    html += '</div></div>';

    /* Réinitialiser filtres si actifs */
    if (state.search || state.filters.type || state.filters.etat || state.filters.route) {
      html += '<div style="padding:0 0 8px;display:flex;align-items:center;gap:8px">';
      html += '<button class="btn-sm ghost" onclick="OuvrageModule.resetFilters()"><i class="fas fa-rotate-left"></i> R\u00e9initialiser les filtres</button>';
      html += '<span style="font-size:.82rem;color:var(--text-3)">' + state.filtered.length + ' r\u00e9sultat' + (state.filtered.length > 1 ? 's' : '') + '</span>';
      html += '</div>';
    }

    /* Tableau */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-bridge"></i> Ouvrages d\'art <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ' r\u00e9sultat' + (state.filtered.length > 1 ? 's' : '') + ')</span></h3></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Nom</th><th>Type</th><th>Route</th><th>PK</th><th>\u00c9tat</th><th>Date construction</th><th style="text-align:right">Actions</th>';
    html += '</tr></thead><tbody id="ouvrage-tbody">';

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-4)"><div class="empty-state"><i class="fas fa-bridge"></i><h3>Aucun ouvrage d\'art trouv\u00e9</h3><p>Modifiez vos crit\u00e8res de recherche ou ajoutez un nouvel ouvrage.</p>';
      if (canEdit()) {
        html += '<button class="btn-sm primary" onclick="OuvrageModule.openCreateModal()" style="margin-top:12px"><i class="fas fa-plus"></i> Ajouter un ouvrage</button>';
      }
      html += '</div></td></tr>';
    } else {
      rows.forEach(function(o) {
        html += buildRow(o);
      });
    }

    html += '</tbody></table></div>';

    /* Pagination */
    html += buildPagination();

    html += '</div>';

    return html;
  }

  function buildRow(o) {
    var p = o.properties || {};
    var typeName = p.type || '\u2014';
    var typeColor = TYPE_COLORS[typeName] || '#4a9eff';
    var typeIcon = TYPE_ICONS[typeName] || 'fa-bridge';
    var etatClass = ETAT_CLASSES[p.etat] || 'pending';
    var dateStr = p.dateConstruction ? formatDate(p.dateConstruction) : '\u2014';

    var html = '<tr>';
    /* Nom — cliquable pour ouvrir la fiche */
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="OuvrageModule.openViewModal(\'' + escapeAttr(o.id) + '\')" title="Voir la fiche">' + esc(p.nom || '\u2014') + '</strong></td>';
    /* Type badge */
    html += '<td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:.8rem;font-weight:600;background:' + typeColor + '22;color:' + typeColor + ';border:1px solid ' + typeColor + '44"><i class="fas ' + typeIcon + '"></i> ' + esc(typeName) + '</span></td>';
    /* Route */
    html += '<td>' + esc(p.route || '\u2014') + '</td>';
    /* PK */
    html += '<td style="font-size:.85rem;font-family:monospace;color:var(--text-2)">' + esc(p.pk || '\u2014') + '</td>';
    /* État */
    html += '<td><span class="status-badge ' + etatClass + '">' + esc(p.etat || '\u2014') + '</span></td>';
    /* Date */
    html += '<td style="font-size:.85rem;color:var(--text-3)">' + dateStr + '</td>';
    /* Actions */
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="OuvrageModule.openViewModal(\'' + escapeAttr(o.id) + '\')"><i class="fas fa-eye"></i></button>';
    if (canEdit()) {
      html += '<button class="btn-icon" title="Modifier" onclick="OuvrageModule.openEditModal(\'' + escapeAttr(o.id) + '\')"><i class="fas fa-pen"></i></button>';
    }
    if (isAdmin()) {
      html += '<button class="btn-icon danger" title="Supprimer" onclick="OuvrageModule.confirmDelete(\'' + escapeAttr(o.id) + '\')"><i class="fas fa-trash"></i></button>';
    }
    html += '</td></tr>';
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return '';
    var html = '<div class="routes-pagination">';
    html += '<span class="pag-info">Page ' + state.page + ' / ' + tp + ' (' + state.filtered.length + ' r\u00e9sultat' + (state.filtered.length > 1 ? 's' : '') + ')</span>';
    html += '<div class="pag-buttons">';
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? 'disabled' : '') + ' onclick="OuvrageModule.goPage(' + (state.page - 1) + ')"><i class="fas fa-chevron-left"></i></button>';
    var pages = getPaginationRange(state.page, tp);
    pages.forEach(function(pg) {
      if (pg === '...') {
        html += '<span class="pag-dots">...</span>';
      } else {
        var cls = pg === state.page ? 'primary' : 'ghost';
        html += '<button class="btn-sm ' + cls + '" onclick="OuvrageModule.goPage(' + pg + ')">' + pg + '</button>';
      }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? 'disabled' : '') + ' onclick="OuvrageModule.goPage(' + (state.page + 1) + ')"><i class="fas fa-chevron-right"></i></button>';
    html += '</div></div>';
    return html;
  }

  function getPaginationRange(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  /* ===== MODALES ===== */

  /* ===== Styles de formulaire (non-modale) ===== */
  var INPUT_STYLE = 'background:#111;border:1px solid #333;color:#e0e0e0;padding:8px 12px;border-radius:6px;width:100%';
  var LABEL_STYLE = 'display:block;font-size:.85rem;font-weight:600;margin-bottom:4px;color:#ccc';
  var FORM_GROUP_STYLE = 'margin-bottom:16px';
  var FORM_ROW_STYLE = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';
  var DETAIL_GRID_STYLE = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';
  var DETAIL_LABEL_STYLE = 'font-size:.78rem;color:#888;margin-bottom:2px;text-transform:uppercase;letter-spacing:.03em';
  var DETAIL_VALUE_STYLE = 'font-size:.92rem;color:#e0e0e0;font-weight:500';
  var DETAIL_FULL_STYLE = 'grid-column:1/-1';

  /** Modale de visualisation (fiche complète). */
  function openViewModal(id) {
    var o = findOuvrage(id);
    if (!o) return;
    var p = o.properties || {};
    var typeName = p.type || '\u2014';
    var typeColor = TYPE_COLORS[typeName] || '#4a9eff';
    var typeIcon = TYPE_ICONS[typeName] || 'fa-bridge';
    var etatClass = ETAT_CLASSES[p.etat] || 'pending';

    var html = '<div id="modal-ouvrage-view" class="modal-admin-overlay" onclick="OuvrageModule.closeModalOnOverlay(event, \'modal-ouvrage-view\')">';
    html += '<div class="modal-admin" style="width:600px;max-width:95vw">';
    html += '<div class="modal-admin-header"><h2 style="margin:0;font-size:1.1rem"><i class="fas ' + typeIcon + '" style="color:' + typeColor + ';margin-right:8px"></i> Fiche ouvrage d\'art</h2><button onclick="OuvrageModule.closeModal(\'modal-ouvrage-view\')" style="background:none;border:none;color:inherit;font-size:1.2rem;cursor:pointer;padding:4px"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';

    /* Type icon header */
    html += '<div style="text-align:center;margin-bottom:16px;padding:16px;background:#111;border-radius:10px">';
    html += '<div style="width:56px;height:56px;border-radius:50%;background:' + typeColor + '22;display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px;border:2px solid ' + typeColor + '44"><i class="fas ' + typeIcon + '" style="font-size:1.4rem;color:' + typeColor + '"></i></div>';
    html += '<div style="font-size:1.1rem;font-weight:700;color:#e0e0e0">' + esc(p.nom || '\u2014') + '</div>';
    html += '<div style="font-size:.85rem;color:#888;margin-top:4px">' + esc(typeName) + '</div>';
    html += '</div>';

    html += '<div style="' + DETAIL_GRID_STYLE + '">';
    html += detailField('Type', '<span style="color:' + typeColor + ';font-weight:600">' + esc(typeName) + '</span>');
    html += detailField('\u00c9tat', '<span class="status-badge ' + etatClass + '">' + esc(p.etat || '\u2014') + '</span>');
    html += detailField('Route', p.route);
    html += detailField('PK', p.pk);
    html += detailField('Coordonn\u00e9e X', p.coordX !== undefined && p.coordX !== null ? p.coordX : '\u2014');
    html += detailField('Coordonn\u00e9e Y', p.coordY !== undefined && p.coordY !== null ? p.coordY : '\u2014');
    html += detailField('Date de construction', p.dateConstruction ? formatDate(p.dateConstruction) : '\u2014');
    html += detailField('Modifi\u00e9 par', p.modifiedBy);
    html += detailField('Date de cr\u00e9ation', p.createdAt ? new Date(p.createdAt).toLocaleString('fr-FR') : '\u2014');
    html += detailField('Derni\u00e8re modification', p.lastModified ? new Date(p.lastModified).toLocaleString('fr-FR') : '\u2014');

    /* Photos */
    if (p.photos && p.photos.trim()) {
      var photoUrls = p.photos.split(',').map(function(u) { return u.trim(); }).filter(Boolean);
      if (photoUrls.length > 0) {
        var photosHtml = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">';
        photoUrls.forEach(function(url) {
          photosHtml += '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener" style="display:inline-block;width:64px;height:64px;border-radius:6px;overflow:hidden;border:1px solid #333"><img src="' + escapeAttr(url) + '" alt="Photo" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"></a>';
        });
        photosHtml += '</div>';
        html += '<div style="' + DETAIL_FULL_STYLE + '"><div style="' + DETAIL_LABEL_STYLE + '">Photos</div>' + photosHtml + '</div>';
      }
    }

    if (p.observations) {
      html += detailFieldFull('Observations', p.observations);
    }
    html += '</div>';

    /* Géométrie résumé */
    if (o.geometry && o.geometry.coordinates) {
      html += '<div style="margin-top:16px;padding:12px;background:#111;border-radius:8px;font-size:.82rem;color:#888">';
      html += '<strong>G\u00e9om\u00e9trie :</strong> ' + esc(o.geometry.type || 'Point') + ' [' + esc(o.geometry.coordinates.join(', ')) + ']';
      html += '</div>';
    }

    html += '</div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="OuvrageModule.closeModal(\'modal-ouvrage-view\')">Fermer</button>';
    if (canEdit()) {
      html += '<button class="btn-sm primary" onclick="OuvrageModule.closeModal(\'modal-ouvrage-view\');OuvrageModule.openEditModal(\'' + escapeAttr(id) + '\')"><i class="fas fa-pen"></i> Modifier</button>';
    }
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Formulaire de création. */
  function openCreateModal() {
    openFormModal(null);
  }

  /** Formulaire de modification. */
  function openEditModal(id) {
    var o = findOuvrage(id);
    if (!o) return;
    openFormModal(o);
  }

  function openFormModal(ouvrage) {
    var isEdit = !!ouvrage;
    var p = ouvrage ? (ouvrage.properties || {}) : {};
    var title = isEdit ? 'Modifier l\'ouvrage' : 'Ajouter un ouvrage';
    var editId = isEdit ? ouvrage.id : null;

    var routeList = getRouteList();

    var html = '<div id="modal-ouvrage-form" class="modal-admin-overlay" onclick="OuvrageModule.closeModalOnOverlay(event, \'modal-ouvrage-form\')">';
    html += '<div class="modal-admin" style="width:600px;max-width:95vw;max-height:90vh;overflow-y:auto">';
    html += '<div class="modal-admin-header"><h2 style="margin:0;font-size:1.1rem"><i class="fas fa-' + (isEdit ? 'pen' : 'plus') + '" style="color:var(--gold);margin-right:8px"></i> ' + esc(title) + '</h2><button onclick="OuvrageModule.closeModal(\'modal-ouvrage-form\')" style="background:none;border:none;color:inherit;font-size:1.2rem;cursor:pointer;padding:4px"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';
    html += '<form id="ouvrage-form" onsubmit="return OuvrageModule.saveOuvrage(event, ' + (editId !== null ? '\'' + escapeAttr(editId) + '\'' : 'null') + ')">';

    /* Nom */
    html += '<div style="' + FORM_GROUP_STYLE + '">';
    html += '<label style="' + LABEL_STYLE + '">Nom de l\'ouvrage *</label>';
    html += '<input type="text" name="nom" required value="' + escapeAttr(p.nom || '') + '" placeholder="Ex: Pont sur la Kara" style="' + INPUT_STYLE + '">';
    html += '</div>';

    /* Type + État */
    html += '<div style="' + FORM_ROW_STYLE + ';' + FORM_GROUP_STYLE + '">';
    html += '<div><label style="' + LABEL_STYLE + '">Type *</label>';
    html += '<select name="type" required style="' + INPUT_STYLE + '">';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    TYPE_OPTIONS.forEach(function(t) {
      var sel = t === p.type ? ' selected' : '';
      html += '<option value="' + escapeAttr(t) + '"' + sel + '>' + esc(t) + '</option>';
    });
    html += '</select></div>';

    html += '<div><label style="' + LABEL_STYLE + '">\u00c9tat *</label>';
    html += '<select name="etat" required style="' + INPUT_STYLE + '">';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    ETAT_OPTIONS.forEach(function(e) {
      var sel = e === p.etat ? ' selected' : '';
      html += '<option value="' + escapeAttr(e) + '"' + sel + '>' + esc(e) + '</option>';
    });
    html += '</select></div>';
    html += '</div>';

    /* Route */
    html += '<div style="' + FORM_GROUP_STYLE + '">';
    html += '<label style="' + LABEL_STYLE + '">Route</label>';
    html += '<select name="route" id="ouvrage-form-route" style="' + INPUT_STYLE + '">';
    html += '<option value="">-- S\u00e9lectionner une route --</option>';
    routeList.forEach(function(r) {
      var sel = String(r.name) === String(p.route) ? ' selected' : '';
      html += '<option value="' + escapeAttr(r.name) + '" data-idx="' + r.index + '"' + sel + '>' + esc(r.name) + '</option>';
    });
    html += '</select>';
    html += '</div>';

    /* PK */
    html += '<div style="' + FORM_GROUP_STYLE + '">';
    html += '<label style="' + LABEL_STYLE + '">Point kilom\u00e9trique (PK)</label>';
    html += '<input type="text" name="pk" value="' + escapeAttr(p.pk || '') + '" placeholder="Ex: PK 3+500" style="' + INPUT_STYLE + '">';
    html += '</div>';

    /* Coordonnées X / Y */
    html += '<div style="' + FORM_ROW_STYLE + ';' + FORM_GROUP_STYLE + '">';
    html += '<div><label style="' + LABEL_STYLE + '">Coordonn\u00e9e X (longitude) *</label>';
    html += '<input type="number" step="any" name="coordX" required value="' + (p.coordX !== undefined && p.coordX !== null ? p.coordX : '') + '" placeholder="Ex: 1.234" style="' + INPUT_STYLE + '"></div>';
    html += '<div><label style="' + LABEL_STYLE + '">Coordonn\u00e9e Y (latitude) *</label>';
    html += '<input type="number" step="any" name="coordY" required value="' + (p.coordY !== undefined && p.coordY !== null ? p.coordY : '') + '" placeholder="Ex: 9.456" style="' + INPUT_STYLE + '"></div>';
    html += '</div>';

    /* Date de construction */
    html += '<div style="' + FORM_GROUP_STYLE + '">';
    html += '<label style="' + LABEL_STYLE + '">Date de construction</label>';
    html += '<input type="date" name="dateConstruction" value="' + escapeAttr(p.dateConstruction || '') + '" style="' + INPUT_STYLE + '">';
    html += '</div>';

    /* Photos */
    html += '<div style="' + FORM_GROUP_STYLE + '">';
    html += '<label style="' + LABEL_STYLE + '">Photos</label>';
    html += '<input type="text" name="photos" value="' + escapeAttr(p.photos || '') + '" placeholder="URLs s\u00e9par\u00e9es par des virgules" style="' + INPUT_STYLE + '">';
    html += '</div>';

    /* Observations */
    html += '<div style="' + FORM_GROUP_STYLE + '">';
    html += '<label style="' + LABEL_STYLE + '">Observations</label>';
    html += '<textarea name="observations" rows="3" placeholder="Observations suppl\u00e9mentaires..." style="' + INPUT_STYLE + ';resize:vertical">' + esc(p.observations || '') + '</textarea>';
    html += '</div>';

    /* Info */
    html += '<div style="padding:10px 12px;background:#111;border-radius:8px;font-size:.82rem;color:#888;margin-top:4px">';
    html += '<i class="fas fa-info-circle" style="margin-right:6px;color:#4a9eff"></i>';
    html += 'Les coordonn\u00e9es X/Y sont obligatoires pour la cr\u00e9ation d\'un ouvrage. Si la route est s\u00e9lectionn\u00e9e, l\'ouvrage sera \u00e9galement associ\u00e9 \u00e0 celle-ci.';
    html += '</div>';

    html += '</form></div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="OuvrageModule.closeModal(\'modal-ouvrage-form\')">Annuler</button>';
    html += '<button class="btn-sm primary" onclick="document.getElementById(\'ouvrage-form\').dispatchEvent(new Event(\'submit\',{cancelable:true}))"><i class="fas fa-save"></i> ' + (isEdit ? 'Enregistrer' : 'Ajouter') + '</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Confirmation de suppression. */
  function confirmDelete(id) {
    if (!isAdmin()) {
      notify('Seul un Administrateur peut supprimer des ouvrages.', 'error');
      return;
    }
    var o = findOuvrage(id);
    if (!o) return;
    var name = (o.properties && o.properties.nom) || 'cet ouvrage';

    var html = '<div id="modal-ouvrage-delete" class="modal-admin-overlay">';
    html += '<div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2 style="margin:0;font-size:1.1rem"><i class="fas fa-exclamation-triangle" style="color:#ff6b6b;margin-right:8px"></i> Confirmer la suppression</h2><button onclick="OuvrageModule.closeModal(\'modal-ouvrage-delete\')" style="background:none;border:none;color:inherit;font-size:1.2rem;cursor:pointer;padding:4px"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';
    html += '<p style="font-size:.92rem;margin:0 0 8px">Vous \u00eates sur le point de supprimer :</p>';
    html += '<p style="font-weight:700;font-size:1rem;color:#ff6b6b;margin:0 0 16px">' + esc(name) + '</p>';
    html += '<p style="font-size:.84rem;color:#888;margin:0">Cette action est irr\u00e9versible. L\'ouvrage sera retir\u00e9 de la carte et des statistiques.</p>';
    html += '</div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="OuvrageModule.closeModal(\'modal-ouvrage-delete\')">Annuler</button>';
    html += '<button class="btn-sm danger" onclick="OuvrageModule.deleteOuvrage(\'' + escapeAttr(id) + '\')"><i class="fas fa-trash"></i> Supprimer d\u00e9finitivement</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ===== ACTIONS CRUD ===== */

  /** Sauvegarde un ouvrage (création ou modification). */
  function saveOuvrage(event, id) {
    if (event) event.preventDefault();
    var form = document.getElementById('ouvrage-form');
    if (!form) return false;

    if (!canEdit()) {
      notify('Vous n\'avez pas les permissions pour modifier les ouvrages.', 'error');
      return false;
    }

    var data = getFormData(form);

    if (!data.nom || !data.nom.trim()) {
      notify('Le nom de l\'ouvrage est obligatoire.', 'error');
      return false;
    }
    if (!data.type || !data.type.trim()) {
      notify('Le type de l\'ouvrage est obligatoire.', 'error');
      return false;
    }
    if (!data.etat || !data.etat.trim()) {
      notify('L\'\u00e9tat de l\'ouvrage est obligatoire.', 'error');
      return false;
    }

    var coordX = (data.coordX !== '' && data.coordX !== undefined && !isNaN(data.coordX)) ? parseFloat(data.coordX) : null;
    var coordY = (data.coordY !== '' && data.coordY !== undefined && !isNaN(data.coordY)) ? parseFloat(data.coordY) : null;
    var now = new Date().toISOString();
    var userName = getSessionName();
    var routeName = data.route || '';
    var routeId = routeName ? getRouteIndex(routeName) : null;

    if (id !== null && id !== undefined) {
      /* Modification */
      var o = findOuvrage(id);
      if (o) {
        o.properties.nom = data.nom.trim();
        o.properties.type = data.type.trim();
        o.properties.etat = data.etat.trim();
        o.properties.route = routeName;
        o.properties.routeId = routeId;
        o.properties.pk = data.pk || '';
        o.properties.coordX = coordX;
        o.properties.coordY = coordY;
        o.properties.dateConstruction = data.dateConstruction || '';
        o.properties.photos = data.photos || '';
        o.properties.observations = data.observations || '';
        o.properties.lastModified = now;
        o.properties.modifiedBy = userName;

        /* Update geometry if coordinates are provided — stored as-is, no forced CRS transformation */
        if (coordX !== null && coordY !== null) {
          o.geometry = { type: 'Point', coordinates: [coordX, coordY] };
        }

        persistAndNotify('sig:feature:updated', {
          id: id,
          nom: data.nom,
          type: 'ouvrage',
          action: 'UPDATE'
        });

        closeModal('modal-ouvrage-form');
        notify('"' + data.nom + '" modifi\u00e9 avec succ\u00e8s.', 'success');
      }
    } else {
      /* Création */
      var newId = 'ouvrage_' + (Date.now());
      /* Ensure unique id */
      state.allOuvrages.forEach(function(existing) {
        var existingNum = parseInt(String(existing.id).replace('ouvrage_', ''), 10);
        var newNum = parseInt(String(newId).replace('ouvrage_', ''), 10);
        if (!isNaN(existingNum) && existingNum >= newNum) {
          newId = 'ouvrage_' + (existingNum + 1);
        }
      });

      var geometry = null;
      if (coordX !== null && coordY !== null) {
        geometry = { type: 'Point', coordinates: [coordX, coordY] };
      } else {
        notify('Les coordonnées sont obligatoires pour créer un ouvrage. Veuillez fournir la longitude (X) et la latitude (Y).', 'error');
        return false;
      }

      var newOuvrage = {
        type: 'Feature',
        id: newId,
        geometry: geometry,
        properties: {
          nom: data.nom.trim(),
          type: data.type.trim(),
          route: routeName,
          routeId: routeId,
          pk: data.pk || '',
          pkId: null,
          coordX: coordX,
          coordY: coordY,
          etat: data.etat.trim(),
          dateConstruction: data.dateConstruction || '',
          photos: data.photos || '',
          observations: data.observations || '',
          createdAt: now,
          lastModified: now,
          modifiedBy: userName
        }
      };

      state.allOuvrages.push(newOuvrage);

      persistAndNotify('sig:feature:created', {
        id: newId,
        nom: data.nom,
        type: 'ouvrage',
        action: 'CREATE'
      });

      closeModal('modal-ouvrage-form');
      notify('"' + data.nom + '" ajout\u00e9 avec succ\u00e8s.', 'success');
    }

    refresh();
    return false;
  }

  /** Supprime un ouvrage. */
  function deleteOuvrage(id) {
    if (!isAdmin()) {
      notify('Seul un Administrateur peut supprimer des ouvrages.', 'error');
      return;
    }
    var o = findOuvrage(id);
    var name = o ? ((o.properties && o.properties.nom) || 'Ouvrage') : 'Ouvrage';

    state.allOuvrages = state.allOuvrages.filter(function(item) { return String(item.id) !== String(id); });

    persistAndNotify('sig:feature:deleted', {
      id: id,
      nom: name,
      type: 'ouvrage',
      action: 'DELETE'
    });

    closeModal('modal-ouvrage-delete');
    notify('"' + name + '" supprim\u00e9 avec succ\u00e8s.', 'success');
    refresh();
  }

  /* ===== EVENT HANDLERS (appelés par le HTML) ===== */

  function onSearch(val) {
    state.search = val;
    state.page = 1;
    applyFilters();
    refresh();
  }

  function onFilter(key, val) {
    state.filters[key] = val;
    state.page = 1;
    applyFilters();
    refresh();
  }

  function resetFilters() {
    state.search = '';
    state.filters = { type: '', etat: '', route: '' };
    state.page = 1;
    applyFilters();
    refresh();
  }

  function goPage(p) {
    state.page = p;
    refresh();
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  function closeModalOnOverlay(event, id) {
    if (event.target.id === id) closeModal(id);
  }

  /** Rafraîchit le contenu de la page ouvrages. */
  function refresh() {
    applyFilters();
    var el = document.getElementById('adminContent');
    if (el) {
      el.innerHTML = buildPage();
      el.scrollTop = 0;
    }
  }

  /* ===== HELPERS INTERNES ===== */

  function getFormData(form) {
    var data = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var v = el.value;
      if (el.type === 'number' && v !== '') v = parseFloat(v);
      data[el.name] = v;
    }
    return data;
  }

  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return esc(dateStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return esc(dateStr);
    }
  }

  function detailField(label, value) {
    return '<div><div style="' + DETAIL_LABEL_STYLE + '">' + esc(label) + '</div><div style="' + DETAIL_VALUE_STYLE + '">' + (value || '\u2014') + '</div></div>';
  }

  function detailFieldFull(label, value) {
    return '<div style="' + DETAIL_FULL_STYLE + '"><div style="' + DETAIL_LABEL_STYLE + '">' + esc(label) + '</div><div style="' + DETAIL_VALUE_STYLE + '">' + esc(value || '\u2014') + '</div></div>';
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render,
    onSearch: onSearch,
    onFilter: onFilter,
    resetFilters: resetFilters,
    goPage: goPage,
    openViewModal: openViewModal,
    openEditModal: openEditModal,
    openCreateModal: openCreateModal,
    saveOuvrage: saveOuvrage,
    confirmDelete: confirmDelete,
    deleteOuvrage: deleteOuvrage,
    closeModal: closeModal,
    closeModalOnOverlay: closeModalOnOverlay
  };
})();