/* ===================================================================
 * GeoROAD TOGO — Module Gestion des Routes
 * 
 * CRUD complet pour les tronçons routiers.
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Remplacer RouteStore par des appels fetch('/api/routes')
 *   - Garder la même interface (getById, getAll, save, remove)
 * =================================================================== */
var RouteModule = (function() {
  'use strict';

  /* ===== CONFIGURATION ===== */
  var PER_PAGE = 10;

  var CAT_LABELS = {
    'CU': 'Route Communautaire',
    'RN': 'Route Nationale',
    'RR': 'Route Régionale',
    'RC': 'Route Communale',
    'RL': 'Route Locale'
  };

  var CAT_CSS = { 'CU': 'cu', 'RN': 'rn', 'RR': 'rr', 'RC': 'rc', 'RL': 'rl' };

  /* Étiquettes pour les filtres (valeurs possibles) */
  var ETAT_OPTIONS = ['Bon', 'Moyen', 'Mauvais', 'En travaux'];
  var REVET_OPTIONS = ['Bitume', 'Terre', 'Gravier', 'Non revêtu'];

  /* ===== ÉTAT INTERNE ===== */
  var state = {
    allRoutes: [],       /* Array de {id, properties, geometry} */
    filtered: [],        /* Résultat après filtres */
    page: 1,
    search: '',
    filters: { region: '', classe: '', etat: '', revetement: '' }
  };

  /* ===== DATA ACCESS LAYER =====
   * Couche d'abstraction : les données viennent de la variable globale
   * json_Rseauroutier_6. Futur : remplacer par fetch('/api/routes').
   */
  function loadData() {
    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      state.allRoutes = json_Rseauroutier_6.features.map(function(f, idx) {
        return {
          id: idx,
          properties: Object.assign({}, f.properties),
          geometry: f.geometry ? Object.assign({}, f.geometry) : null
        };
      });
    }
    /* Ajouter les champs manquants avec valeurs par défaut */
    state.allRoutes.forEach(function(r) {
      if (!r.properties.Code) r.properties.Code = '';
      if (!r.properties.Origine) {
        var parts = (r.properties.Name || '').split('-');
        r.properties.Origine = parts[0] ? parts[0].trim() : '';
        r.properties.Destination = parts[1] ? parts[1].trim() : '';
      }
      if (!r.properties.Destination) {
        var parts2 = (r.properties.Name || '').split('-');
        r.properties.Destination = parts2[1] ? parts2[1].trim() : '';
      }
      if (!r.properties.Largeur) r.properties.Largeur = '';
      if (!r.properties.Etat) r.properties.Etat = '';
      if (!r.properties.Revetement) r.properties.Revetement = '';
      if (!r.properties.Prefecture) r.properties.Prefecture = '';
      if (!r.properties.Communes) r.properties.Communes = '';
      if (!r.properties.Pop_Dessertie) r.properties.Pop_Dessertie = '';
      if (!r.properties.Observations) r.properties.Observations = '';
    });
    applyFilters();
  }

  /** Sauvegarde dans le store local (futur : PUT /api/routes/:id). */
  function saveRoute(routeData) {
    var idx = -1;
    for (var i = 0; i < state.allRoutes.length; i++) {
      if (state.allRoutes[i].id === routeData.id) { idx = i; break; }
    }
    if (idx >= 0) {
      state.allRoutes[idx].properties = Object.assign(state.allRoutes[idx].properties, routeData.properties);
      if (routeData.geometry) state.allRoutes[idx].geometry = routeData.geometry;
      syncToGlobal();
    }
  }

  /** Ajoute une nouvelle route (futur : POST /api/routes). */
  function addRoute(routeData) {
    var newId = state.allRoutes.length > 0
      ? Math.max.apply(null, state.allRoutes.map(function(r) { return r.id; })) + 1
      : 0;
    var newRoute = {
      id: newId,
      properties: Object.assign({}, routeData.properties),
      geometry: routeData.geometry || null
    };
    state.allRoutes.push(newRoute);
    syncToGlobal();
    return newId;
  }

  /** Supprime une route (futur : DELETE /api/routes/:id). */
  function removeRoute(id) {
    state.allRoutes = state.allRoutes.filter(function(r) { return r.id !== id; });
    syncToGlobal();
  }

  /** Synchronise vers la variable globale (utilisé par le géoportail public). */
  function syncToGlobal() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      json_Rseauroutier_6.features = state.allRoutes.map(function(r) {
        return { type: 'Feature', properties: r.properties, geometry: r.geometry };
      });
      /* Mettre à jour le badge dans la sidebar */
      var badge = document.querySelector('.nav-item[data-page="routes"] .nav-badge');
      if (badge) badge.textContent = state.allRoutes.length;
    }
  }

  /* ===== FILTRAGE & RECHERCHE ===== */
  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;

    state.filtered = state.allRoutes.filter(function(r) {
      var p = r.properties;
      /* Recherche textuelle */
      if (s) {
        var haystack = ((p.Name || '') + ' ' + (p.Code || '') + ' ' + (p.Origine || '') + ' ' + (p.Destination || '') + ' ' + (p.REGIONS || '')).toLowerCase();
        if (haystack.indexOf(s) === -1) return false;
      }
      /* Filtres */
      if (f.region && p.REGIONS !== f.region) return false;
      if (f.classe && p.CLASSE !== f.classe) return false;
      if (f.etat && p.Etat !== f.etat) return false;
      if (f.revetement && p.Revetement !== f.revetement) return false;
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

  function getUniqueValues(key) {
    var vals = {};
    state.allRoutes.forEach(function(r) {
      var v = r.properties[key];
      if (v && v.trim()) vals[v.trim()] = true;
    });
    return Object.keys(vals).sort();
  }

  /* ===== NOTIFICATION TOAST ===== */
  function notify(msg, type) {
    type = type || 'success';
    var existing = document.getElementById('route-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'route-toast';
    toast.className = 'route-toast ' + type;
    var icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    toast.innerHTML = '<i class="fas ' + icon + '"></i> ' + msg;
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
    return buildPage();
  }

  function buildPage() {
    var totalKm = 0;
    state.allRoutes.forEach(function(r) { totalKm += ((r.properties.LONGEUR || 0) / 1000); });

    var html = '<div class="page-header">'
      + '<h1>Gestion des routes</h1>'
      + '<p>Consultation, modification et gestion des ' + state.allRoutes.length + ' tronçons routiers — ' + totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km au total</p>'
      + '</div>';

    /* Barre d'actions : recherche + boutons */
    html += '<div class="routes-toolbar">';
    html += '<div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="route-search-input" placeholder="Rechercher par nom, code, origine, destination..." value="' + escapeAttr(state.search) + '" oninput="RouteModule.onSearch(this.value)">';
    html += '</div>';
    html += '<div class="routes-actions">';
    html += '<button class="btn-sm ghost" onclick="RouteModule.exportCSV()"><i class="fas fa-file-csv"></i> Export CSV</button>';
    /* Bouton "Nouvelle route" supprimé — sera réintégré sous le module "AJOUT" */
    html += '</div></div>';

    /* Filtres */
    html += buildFilters();

    /* Tableau */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-list"></i> Tronçons routiers <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ' résultat' + (state.filtered.length > 1 ? 's' : '') + ')</span></h3></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Nom</th><th>Code</th><th>Catégorie</th><th>Région</th><th>Longueur</th><th>Emprise</th><th>État</th><th style="text-align:right">Actions</th>';
    html += '</tr></thead><tbody id="routes-tbody">';

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-4)">Aucun tronçon trouvé.</td></tr>';
    } else {
      rows.forEach(function(r) {
        html += buildRow(r);
      });
    }

    html += '</tbody></table></div>';

    /* Pagination */
    html += buildPagination();

    html += '</div>';

    return html;
  }

  function buildFilters() {
    var regions = getUniqueValues('REGIONS');
    var classes = ['CU', 'RN', 'RR', 'RC', 'RL'];
    var html = '<div class="routes-filters">';
    html += filterSelect('region', 'Région', regions, state.filters.region, '-- Toutes --');
    html += filterSelect('classe', 'Catégorie', classes, state.filters.classe, '-- Toutes --', CAT_LABELS);
    html += filterSelect('etat', 'État', ETAT_OPTIONS, state.filters.etat, '-- Tous --');
    html += filterSelect('revetement', 'Revêtement', REVET_OPTIONS, state.filters.revetement, '-- Tous --');
    html += '<button class="btn-sm ghost" onclick="RouteModule.resetFilters()" style="white-space:nowrap"><i class="fas fa-rotate-left"></i> Réinitialiser</button>';
    html += '</div>';
    return html;
  }

  function filterSelect(key, label, options, current, placeholder, labelMap) {
    var html = '<div class="filter-group">';
    html += '<label>' + label + '</label>';
    html += '<select onchange="RouteModule.onFilter(\'' + key + '\', this.value)">';
    html += '<option value="">' + placeholder + '</option>';
    options.forEach(function(o) {
      var sel = o === current ? ' selected' : '';
      var display = labelMap ? (labelMap[o] || o) : o;
      html += '<option value="' + escapeAttr(o) + '"' + sel + '>' + escapeHtml(display) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  function buildRow(r) {
    var p = r.properties;
    var km = ((p.LONGEUR || 0) / 1000).toFixed(1);
    var catLabel = CAT_LABELS[p.CLASSE] || p.CLASSE || '—';
    var etatClass = !p.Etat ? '' : (p.Etat === 'Bon' ? 'active' : (p.Etat === 'Mauvais' ? 'inactive' : 'pending'));

    var html = '<tr>';
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="RouteModule.viewRoute(' + r.id + ')" title="Voir la fiche">' + escapeHtml(p.Name || '—') + '</strong></td>';
    html += '<td>' + escapeHtml(p.Code || '—') + '</td>';
    html += '<td><span class="cat-dot cat-' + (CAT_CSS[p.CLASSE] || '') + '"></span> ' + escapeHtml(catLabel) + '</td>';
    html += '<td>' + escapeHtml(p.REGIONS || '—') + '</td>';
    html += '<td>' + km + ' km</td>';
    html += '<td>' + (p.EMPRISE || '—') + ' m</td>';
    html += '<td>' + (p.Etat ? '<span class="status-badge ' + etatClass + '">' + escapeHtml(p.Etat) + '</span>' : '<span style="color:var(--text-4)">—</span>') + '</td>';
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="RouteModule.viewRoute(' + r.id + ')"><i class="fas fa-eye"></i></button>';
    html += '<button class="btn-icon" title="Modifier" onclick="RouteModule.openEditForm(' + r.id + ')"><i class="fas fa-pen"></i></button>';
    html += '<button class="btn-icon danger" title="Supprimer" onclick="RouteModule.confirmDelete(' + r.id + ')"><i class="fas fa-trash"></i></button>';
    html += '</td></tr>';
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return '';
    var html = '<div class="routes-pagination">';
    html += '<span class="pag-info">Page ' + state.page + ' / ' + tp + ' (' + state.filtered.length + ' résultat' + (state.filtered.length > 1 ? 's' : '') + ')</span>';
    html += '<div class="pag-buttons">';
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? 'disabled' : '') + ' onclick="RouteModule.goPage(' + (state.page - 1) + ')"><i class="fas fa-chevron-left"></i></button>';
    /* Page numbers (max 7 visible) */
    var pages = getPaginationRange(state.page, tp);
    pages.forEach(function(pg) {
      if (pg === '...') {
        html += '<span class="pag-dots">...</span>';
      } else {
        var cls = pg === state.page ? 'primary' : 'ghost';
        html += '<button class="btn-sm ' + cls + '" onclick="RouteModule.goPage(' + pg + ')">' + pg + '</button>';
      }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? 'disabled' : '') + ' onclick="RouteModule.goPage(' + (state.page + 1) + ')"><i class="fas fa-chevron-right"></i></button>';
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

  /** Modale de visualisation (fiche complète). */
  function viewRoute(id) {
    var route = findRoute(id);
    if (!route) return;
    var p = route.properties;
    var km = ((p.LONGEUR || 0) / 1000).toFixed(2);

    var html = '<div class="modal-admin-overlay" id="modal-route-view" onclick="RouteModule.closeModalOnOverlay(event, \'modal-route-view\')">';
    html += '<div class="modal-admin">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-road" style="color:var(--gold);margin-right:8px"></i> Fiche route</h2><button class="modal-admin-close" onclick="RouteModule.closeModal(\'modal-route-view\')"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';
    html += '<div class="detail-grid">';
    html += detailField('Nom de la route', p.Name);
    html += detailField('Code', p.Code || '—');
    html += detailField('Origine', p.Origine || '—');
    html += detailField('Destination', p.Destination || '—');
    html += detailField('Catégorie', CAT_LABELS[p.CLASSE] || p.CLASSE || '—');
    html += detailField('Longueur', km + ' km');
    html += detailField('Largeur', p.Largeur ? p.Largeur + ' m' : '—');
    html += detailField('Emprise', (p.EMPRISE || '—') + ' m');
    html += detailField('Type de revêtement', p.Revetement || '—');
    html += detailField('État', p.Etat || '—');
    html += detailField('Région', p.REGIONS || '—');
    html += detailField('Préfecture', p.Prefecture || '—');
    html += detailField('Communes', p.Communes || '—');
    html += detailField('Population desservie', p.Pop_Dessertie ? Number(p.Pop_Dessertie).toLocaleString('fr-FR') + ' hab' : '—');
    html += detailField('PK Début', p.PK_DEB_X ? p.PK_DEB_X + ', ' + p.PK_DEB_Y : '—');
    html += detailField('PK Fin', p.PK_FIN_X ? p.PK_FIN_X + ', ' + p.PK_FIN_Y : '—');
    html += '</div>';
    html += detailField('Observations', p.Observations || '—', true);
    html += '</div>';
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="RouteModule.closeModal(\'modal-route-view\')">Fermer</button>';
    html += '<button class="btn-sm primary" onclick="RouteModule.closeModal(\'modal-route-view\');RouteModule.openEditForm(' + id + ')"><i class="fas fa-pen"></i> Modifier</button></div>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Formulaire d'ajout. */
  function openAddForm() {
    openForm(null);
  }

  /** Formulaire de modification. */
  function openEditForm(id) {
    var route = findRoute(id);
    if (!route) return;
    openForm(route);
  }

  function openForm(route) {
    var isEdit = !!route;
    var p = route ? route.properties : {};
    var title = isEdit ? 'Modifier la route' : 'Ajouter une route';

    var html = '<div class="modal-admin-overlay" id="modal-route-form" onclick="RouteModule.closeModalOnOverlay(event, \'modal-route-form\')">';
    html += '<div class="modal-admin" style="max-width:720px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-' + (isEdit ? 'pen' : 'plus') + '" style="color:var(--gold);margin-right:8px"></i> ' + title + '</h2><button class="modal-admin-close" onclick="RouteModule.closeModal(\'modal-route-form\')"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><form id="route-form" onsubmit="return RouteModule.saveForm(event, ' + (isEdit ? route.id : 'null') + ')">';

    /* Ligne 1 */
    html += formRow(
      formGroup('Nom de la route *', '<input type="text" name="Name" required value="' + escapeAttr(p.Name || '') + '" placeholder="Ex: Lomé-Sokodé">'),
      formGroup('Code', '<input type="text" name="Code" value="' + escapeAttr(p.Code || '') + '" placeholder="Ex: RN1">')
    );

    /* Ligne 2 */
    html += formRow(
      formGroup('Origine', '<input type="text" name="Origine" value="' + escapeAttr(p.Origine || '') + '" placeholder="Ex: Lomé">'),
      formGroup('Destination', '<input type="text" name="Destination" value="' + escapeAttr(p.Destination || '') + '" placeholder="Ex: Sokodé">')
    );

    /* Ligne 3 */
    html += formRow(
      formGroup('Catégorie *', formSelect('CLASSE', [['CU','Route Communautaire'],['RN','Route Nationale'],['RR','Route Régionale'],['RC','Route Communale'],['RL','Route Locale']], p.CLASSE || 'CU')),
      formGroup('Région *', formSelect('REGIONS', getRegionOptions(), p.REGIONS || ''))
    );

    /* Ligne 4 */
    html += formRow(
      formGroup('Longueur (m) *', '<input type="number" name="LONGEUR" step="0.01" required value="' + (p.LONGEUR || '') + '" placeholder="Ex: 52197">'),
      formGroup('Largeur (m)', '<input type="number" name="Largeur" step="0.1" value="' + escapeAttr(p.Largeur || '') + '" placeholder="Ex: 7">')
    );

    /* Ligne 5 */
    html += formRow(
      formGroup('Emprise (m)', '<input type="number" name="EMPRISE" step="1" value="' + (p.EMPRISE || '') + '" placeholder="Ex: 70">'),
      formGroup('Type de revêtement', formSelect('Revetement', REVET_OPTIONS.map(function(e) { return [e, e]; }).concat([['','Non défini']]), p.Revetement || ''))
    );

    /* Ligne 6 */
    html += formRow(
      formGroup('État', formSelect('Etat', ETAT_OPTIONS.map(function(e) { return [e, e]; }).concat([['','Non défini']]), p.Etat || '')),
      formGroup('Préfecture', '<input type="text" name="Prefecture" value="' + escapeAttr(p.Prefecture || '') + '" placeholder="Ex: Tchamba">')
    );

    /* Ligne 7 */
    html += formRow(
      formGroup('Communes', '<input type="text" name="Communes" value="' + escapeAttr(p.Communes || '') + '" placeholder="Ex: Tchamba, Soudou">'),
      formGroup('Population desservie', '<input type="number" name="Pop_Dessertie" value="' + escapeAttr(p.Pop_Dessertie || '') + '" placeholder="Ex: 15000">')
    );

    /* Ligne 8 : Coordonnées */
    html += formRow(
      formGroup('PK Début X', '<input type="number" name="PK_DEB_X" value="' + (p.PK_DEB_X || '') + '">'),
      formGroup('PK Début Y', '<input type="number" name="PK_DEB_Y" value="' + (p.PK_DEB_Y || '') + '">')
    );

    html += formRow(
      formGroup('PK Fin X', '<input type="number" name="PK_FIN_X" value="' + (p.PK_FIN_X || '') + '">'),
      formGroup('PK Fin Y', '<input type="number" name="PK_FIN_Y" value="' + (p.PK_FIN_Y || '') + '">')
    );

    /* Observations */
    html += '<div class="form-row-single">';
    html += formGroup('Observations', '<textarea name="Observations" rows="3" placeholder="Remarques, notes...">' + escapeHtml(p.Observations || '') + '</textarea>');
    html += '</div>';

    html += '</form></div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="RouteModule.closeModal(\'modal-route-form\')">Annuler</button>';
    html += '<button class="btn-sm primary" onclick="document.getElementById(\'route-form\').dispatchEvent(new Event(\'submit\',{cancelable:true}))"><i class="fas fa-save"></i> ' + (isEdit ? 'Enregistrer' : 'Ajouter') + '</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Confirmation de suppression. */
  function confirmDelete(id) {
    var route = findRoute(id);
    if (!route) return;
    var name = route.properties.Name || 'cette route';

    var html = '<div class="modal-admin-overlay" id="modal-route-delete">';
    html += '<div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--red);margin-right:8px"></i> Confirmer la suppression</h2><button class="modal-admin-close" onclick="RouteModule.closeModal(\'modal-route-delete\')"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';
    html += '<p style="font-size:.92rem;margin-bottom:8px">Vous êtes sur le point de supprimer :</p>';
    html += '<p style="font-weight:700;font-size:1rem;color:var(--red);margin-bottom:16px">' + escapeHtml(name) + '</p>';
    html += '<p style="font-size:.84rem;color:var(--text-3)">Cette action est irréversible. La route sera retirée de la carte et des statistiques.</p>';
    html += '</div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="RouteModule.closeModal(\'modal-route-delete\')">Annuler</button>';
    html += '<button class="btn-sm" style="background:var(--red);color:#fff" onclick="RouteModule.doDelete(' + id + ')"><i class="fas fa-trash"></i> Supprimer définitivement</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ===== ACTIONS ===== */

  function doDelete(id) {
    var route = findRoute(id);
    var name = route ? (route.properties.Name || 'Route') : 'Route';
    var beforeState = route ? JSON.parse(JSON.stringify(route.properties)) : null;
    removeRoute(id);
    /* EventBus + Audit (signature correcte : log(action, options) ) */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_DELETED, { featureId: id, layer: 'routes' });
    }
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.DELETE_ROUTE, {
          featureId: String(id),
          featureName: name,
          user: (typeof AdminAuth !== 'undefined' && AdminAuth.getSession()) ? (AdminAuth.getSession().name || 'admin') : 'admin',
          details: 'Route supprimée : ' + name,
          before: beforeState,
          after: null
        });
      } catch(e) {}
    }
    closeModal('modal-route-delete');
    notify('"' + name + '" supprimée avec succès.', 'success');
    refresh();
  }

  function saveForm(event, id) {
    if (event) event.preventDefault();
    var form = document.getElementById('route-form');
    if (!form) return false;

    var data = getFormData(form);
    if (!data.Name || !data.Name.trim()) {
      notify('Le nom de la route est obligatoire.', 'error');
      return false;
    }

    var currentUser = (typeof AdminAuth !== 'undefined' && AdminAuth.getSession()) ? (AdminAuth.getSession().name || 'admin') : 'admin';

    if (id !== null) {
      /* Modification */
      var route = findRoute(id);
      if (route) {
        var beforeState = JSON.parse(JSON.stringify(route.properties));
        saveRoute({ id: id, properties: data });
        notify('"' + data.Name + '" modifiée avec succès.', 'success');
        /* EventBus + Audit */
        if (typeof SIGEventBus !== 'undefined') {
          SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_UPDATED, { featureId: id, layer: 'routes' });
        }
        if (typeof SIGAuditTrail !== 'undefined') {
          try {
            SIGAuditTrail.log(SIGAuditTrail.ACTIONS.UPDATE_ROUTE, {
              featureId: String(id),
              featureName: data.Name,
              user: currentUser,
              details: 'Route modifiée : ' + (data.Name || 'Sans nom'),
              before: beforeState,
              after: data
            });
          } catch(e) {}
        }
      }
    } else {
      /* Ajout */
      var newId = addRoute({ properties: data, geometry: null });
      notify('"' + data.Name + '" ajoutée avec succès.', 'success');
      /* EventBus + Audit */
      if (typeof SIGEventBus !== 'undefined') {
        SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_CREATED, { featureId: newId, layer: 'routes' });
      }
      if (typeof SIGAuditTrail !== 'undefined') {
        try {
          SIGAuditTrail.log(SIGAuditTrail.ACTIONS.CREATE_ROUTE, {
            featureId: String(newId),
            featureName: data.Name,
            user: currentUser,
            details: 'Route créée : ' + (data.Name || 'Sans nom'),
            before: null,
            after: data
          });
        } catch(e) {}
      }
    }

    closeModal('modal-route-form');
    refresh();
    return false;
  }

  function exportCSV() {
    var headers = ['Nom', 'Code', 'Origine', 'Destination', 'Catégorie', 'Longueur (m)', 'Largeur (m)', 'Emprise (m)', 'Revêtement', 'État', 'Région', 'Préfecture', 'Communes', 'Population desservie', 'PK Début X', 'PK Début Y', 'PK Fin X', 'PK Fin Y', 'Observations'];
    var keys = ['Name', 'Code', 'Origine', 'Destination', 'CLASSE', 'LONGEUR', 'Largeur', 'EMPRISE', 'Revetement', 'Etat', 'REGIONS', 'Prefecture', 'Communes', 'Pop_Dessertie', 'PK_DEB_X', 'PK_DEB_Y', 'PK_FIN_X', 'PK_FIN_Y', 'Observations'];
    var csv = headers.join(';') + '\n';
    state.filtered.forEach(function(r) {
      var row = keys.map(function(k) {
        var v = (r.properties[k] !== undefined && r.properties[k] !== null) ? String(r.properties[k]) : '';
        return '"' + v.replace(/"/g, '""') + '"';
      });
      csv += row.join(';') + '\n';
    });

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'routes_georoad_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    notify('Export CSV téléchargé (' + state.filtered.length + ' routes).', 'success');
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
    state.filters = { region: '', classe: '', etat: '', revetement: '' };
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

  /** Rafraîchit le contenu de la page routes. */
  function refresh() {
    applyFilters();
    var el = document.getElementById('adminContent');
    if (el) {
      el.innerHTML = buildPage();
      el.scrollTop = 0;
    }
  }

  /* ===== HELPERS ===== */

  function findRoute(id) {
    for (var i = 0; i < state.allRoutes.length; i++) {
      if (state.allRoutes[i].id === id) return state.allRoutes[i];
    }
    return null;
  }

  function getFormData(form) {
    var data = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(function(el) {
      var v = el.value;
      if (el.type === 'number' && v !== '') v = parseFloat(v);
      data[el.name] = v;
    });
    /* Auto-fill CLASSE label */
    if (data.Name && !data.Origine) {
      var parts = data.Name.split('-');
      data.Origine = parts[0] ? parts[0].trim() : '';
      data.Destination = parts[1] ? parts[1].trim() : '';
    }
    return data;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formGroup(label, inputHtml) {
    return '<div class="fm-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function formRow(left, right) {
    return '<div class="form-row">' + left + right + '</div>';
  }

  function formRowSingle(content) {
    return '<div class="form-row-single">' + content + '</div>';
  }

  function formSelect(name, options, current) {
    var html = '<select name="' + name + '">';
    options.forEach(function(o) {
      var sel = String(o[0]) === String(current) ? ' selected' : '';
      html += '<option value="' + escapeAttr(o[0]) + '"' + sel + '>' + escapeHtml(o[1]) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function detailField(label, value, full) {
    var cls = full ? 'detail-item detail-full' : 'detail-item';
    return '<div class="' + cls + '"><div class="detail-label">' + escapeHtml(label) + '</div><div class="detail-value">' + escapeHtml(value || '—') + '</div></div>';
  }

  /** Renvoie la liste des régions depuis json_Rgion_2 (toutes les régions du Togo présentes dans la couche).
      Fallback : les 3 régions historiques si la couche n'est pas chargée. */
  function getRegionOptions() {
    var regions = [];
    if (typeof json_Rgion_2 !== 'undefined' && json_Rgion_2.features) {
      var seen = {};
      json_Rgion_2.features.forEach(function(f) {
        var n = f.properties && f.properties.NAME_1;
        if (n && !seen[n]) { seen[n] = true; regions.push([n, n]); }
      });
    }
    if (regions.length === 0) {
      regions = [['Centre','Centre'], ['Kara','Kara'], ['Savanes','Savanes'],
                 ['Plateaux','Plateaux'], ['Maritime','Maritime']];
    }
    return regions;
  }

  /* ===== ÉCOUTE SIGEventBus POUR SYNCHRONISATION ENTRANTE ===== */
  /* Quand une route est créée/modifiée/supprimée par un autre module
     (admin-ajout, admin-spatial, géoportail), on recharge la liste. */
  if (typeof SIGEventBus !== 'undefined') {
    var _routeRefreshTimer = null;
    var _scheduleRouteRefresh = function() {
      if (_routeRefreshTimer) clearTimeout(_routeRefreshTimer);
      _routeRefreshTimer = setTimeout(function() {
        /* Recharger les données depuis la variable globale */
        loadData();
        /* Si on est sur la page routes, re-rendre */
        var currentHash = window.location.hash.replace('#', '');
        if (currentHash === 'routes') {
          var el = document.getElementById('adminContent');
          if (el) el.innerHTML = buildPage();
        }
      }, 200);
    };
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, function(data) {
      if (!data || data.layer === 'routes' || data.layer === 'Rseauroutier_6') _scheduleRouteRefresh();
    });
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, function(data) {
      if (!data || data.layer === 'routes' || data.layer === 'Rseauroutier_6') _scheduleRouteRefresh();
    });
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (!data || data.layer === 'routes' || data.layer === 'Rseauroutier_6') _scheduleRouteRefresh();
    });
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render,
    reload: function() { render(); },
    onSearch: onSearch,
    onFilter: onFilter,
    resetFilters: resetFilters,
    goPage: goPage,
    viewRoute: viewRoute,
    openAddForm: openAddForm,
    openEditForm: openEditForm,
    confirmDelete: confirmDelete,
    doDelete: doDelete,
    saveForm: saveForm,
    exportCSV: exportCSV,
    closeModal: closeModal,
    closeModalOnOverlay: closeModalOnOverlay
  };
})();