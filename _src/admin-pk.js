/* ===================================================================
 * GeoROAD TOGO — Module Gestion des Points Kilométriques (PK)
 *
 * Chaque PK a un point de DÉBUT (X, Y) et un point de FIN (X, Y).
 * Synchronisé avec les routes existantes (PK_DEB_X/Y, PK_FIN_X/Y).
 * =================================================================== */
var PKModule = (function() {
  "use strict";

  var PER_PAGE = 10;
  var state = { allPKs: [], filtered: [], page: 1, search: "", filters: { route: "" } };

  function esc(s) { return s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") : ""; }
  function ea(s) { return s ? String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }
  function fc(v) { if (v===undefined||v===null||v==="") return "\u2014"; var n=parseFloat(v); return isNaN(n)? "\u2014":n.toLocaleString("fr-FR",{maximumFractionDigits:2}); }
  function isAdmin() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s && (s.role === "administrateur" || s.role === "Administrateur"); } catch(e) { return false; } }
  function canEdit() { return isAdmin(); }
  function getSessionName() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s ? (s.name || s.user || "Inconnu") : "Inconnu"; } catch(e) { return "Inconnu"; } }

  /* ===== DATA ===== */
  function loadData() {
    var fc = null;
    if (typeof SIGPersistence !== "undefined") fc = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
    if (fc && fc.type === "FeatureCollection" && fc.features && fc.features.length > 0) {
      state.allPKs = fc.features;
    } else {
      state.allPKs = [];
      fc = { type: "FeatureCollection", features: [] };
    }
    window.json_PK = fc;
    /* Synchroniser les PK existants des routes */
    syncFromRoutes();
  }

  /**
   * Synchronise les PK à partir des données des routes existantes.
   * Chaque route qui possède PK_DEB_X/Y et PK_FIN_X/Y génère un PK
   * s'il n'existe pas déjà dans state.allPKs.
   * N'invente aucune donnée — utilise uniquement les propriétés des routes.
   */
  function syncFromRoutes() {
    if (typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    var added = false;
    var baseTime = Date.now();
    /* Index des routes déjà présentes dans les PK (par nom de route) */
    var existingRoutes = {};
    state.allPKs.forEach(function(pk) {
      var r = (pk.properties || {}).route || "";
      if (r) existingRoutes[r] = true;
    });

    json_Rseauroutier_6.features.forEach(function(feat, idx) {
      var props = feat.properties || {};
      var routeName = props.Name || "";
      /* Vérifier que la route a des coordonnées PK valides */
      var debX = props.PK_DEB_X;
      var debY = props.PK_DEB_Y;
      var finX = props.PK_FIN_X;
      var finY = props.PK_FIN_Y;
      if (!routeName) return;
      if (debX === null || debX === undefined || finX === null || finX === undefined) return;
      if (debX === 0 && debY === 0 && finX === 0 && finY === 0) return;
      /* Ne pas dupliquer si un PK existe déjà pour cette route */
      if (existingRoutes[routeName]) return;

      /* Créer le PK à partir des données existantes de la route */
      var pkProps = {
        numero: "PK 0+000",
        route: routeName,
        PK_DEB_X: parseFloat(debX),
        PK_DEB_Y: parseFloat(debY),
        PK_FIN_X: parseFloat(finX),
        PK_FIN_Y: parseFloat(finY),
        classe: props.CLASSE || "",
        longueur: props.LONGEUR || 0,
        source: "route",
        observations: "",
        lastModified: new Date().toISOString(),
        modifiedBy: "Système (sync route)"
      };
      var geom = {
        type: "LineString",
        coordinates: [[pkProps.PK_DEB_X, pkProps.PK_DEB_Y], [pkProps.PK_FIN_X, pkProps.PK_FIN_Y]]
      };
      var newPK = {
        type: "Feature",
        id: "pk_route_" + idx + "_" + (baseTime + idx),
        geometry: geom,
        properties: pkProps
      };
      state.allPKs.push(newPK);
      existingRoutes[routeName] = true;
      added = true;
    });

    /* Persister uniquement si de nouveaux PK ont été ajoutés */
    if (added) {
      var fc2 = { type: "FeatureCollection", features: state.allPKs };
      window.json_PK = fc2;
      if (typeof SIGPersistence !== "undefined") SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, fc2);
    }
  }

  function getRouteList() {
    if (typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return [];
    return json_Rseauroutier_6.features.map(function(f, idx) {
      var p = f.properties || {};
      return {
        index: idx, name: p.Name || ("Route " + idx), classe: p.CLASSE || "",
        pkDebX: p.PK_DEB_X || 0, pkDebY: p.PK_DEB_Y || 0,
        pkFinX: p.PK_FIN_X || 0, pkFinY: p.PK_FIN_Y || 0, longueur: p.LONGEUR || 0
      };
    });
  }

  function findPK(id) {
    for (var i = 0; i < state.allPKs.length; i++) {
      if (String(state.allPKs[i].id) === String(id)) return state.allPKs[i];
    }
    return null;
  }

  function persistAndNotify(eventType, detail) {
    var fc2 = { type: "FeatureCollection", features: state.allPKs };
    window.json_PK = fc2;
    if (typeof SIGPersistence !== "undefined") SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, fc2);
    /* Utiliser les constantes SIGEventBus.EVENTS si disponibles, sinon fallback string */
    if (typeof SIGEventBus !== "undefined") {
      var evMap = {
        "sig:feature:created": SIGEventBus.EVENTS.FEATURE_CREATED,
        "sig:feature:updated": SIGEventBus.EVENTS.FEATURE_UPDATED,
        "sig:feature:deleted": SIGEventBus.EVENTS.FEATURE_DELETED,
        "sig:stats:changed": SIGEventBus.EVENTS.STATS_CHANGED,
        "sig:dashboard:refresh": SIGEventBus.EVENTS.DASHBOARD_REFRESH
      };
      var ev = evMap[eventType] || eventType;
      SIGEventBus.emit(ev, { featureId: (detail && detail.id) || null, layer: 'pk', numero: detail && detail.numero });
      if (SIGEventBus.EVENTS.STATS_CHANGED) SIGEventBus.emit(SIGEventBus.EVENTS.STATS_CHANGED, { source: 'pk' });
      if (SIGEventBus.EVENTS.DASHBOARD_REFRESH) SIGEventBus.emit(SIGEventBus.EVENTS.DASHBOARD_REFRESH, {});
    }
    /* Audit avec signature correcte log(action, options) */
    if (typeof SIGAuditTrail !== "undefined") {
      try {
        var action = (detail && detail.action) ? detail.action : "UPDATE";
        var actionConst;
        if (action === "CREATE") actionConst = SIGAuditTrail.ACTIONS.CREATE_ROUTE;
        else if (action === "DELETE") actionConst = SIGAuditTrail.ACTIONS.DELETE_ROUTE;
        else actionConst = SIGAuditTrail.ACTIONS.UPDATE_ROUTE;
        SIGAuditTrail.log(actionConst, {
          featureId: (detail && detail.id) ? String(detail.id) : null,
          featureName: (detail && detail.numero) || 'PK',
          user: getSessionName(),
          details: 'PK ' + ((detail && detail.numero) || '') + ' — action ' + action + ' (couche PK)',
          before: null,
          after: null
        });
      } catch(e) {}
    }
  }

  /* ===== STATS ===== */
  function computeStats() {
    var total = state.allPKs.length;
    var rs = {};
    state.allPKs.forEach(function(pk) { rs[(pk.properties || {}).route || "Non associ\u00e9"] = true; });
    var rc = Object.keys(rs).length;
    return { total: total, routeCount: rc, avgPerRoute: rc > 0 ? (total / rc) : 0 };
  }

  /* ===== FILTRES ===== */
  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;
    state.filtered = state.allPKs.filter(function(pk) {
      var p = pk.properties || {};
      if (s) {
        var h = ((p.numero || "") + " " + (p.route || "") + " " + (p.observations || "") + " " + (p.PK_DEB_X || "") + " " + (p.PK_FIN_X || "")).toLowerCase();
        if (h.indexOf(s) === -1) return false;
      }
      if (f.route && p.route !== f.route) return false;
      return true;
    });
    if (state.page > totalPages()) state.page = 1;
  }
  function totalPages() { return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE)); }
  function getPageData() { var s = (state.page - 1) * PER_PAGE; return state.filtered.slice(s, s + PER_PAGE); }

  /* ===== TOAST ===== */
  function notify(msg, type) {
    type = type || "success";
    var ex = document.getElementById("pk-toast");
    if (ex) ex.remove();
    var t = document.createElement("div");
    t.id = "pk-toast";
    t.className = "route-toast " + type;
    var ic = type === "success" ? "fa-check-circle" : (type === "error" ? "fa-exclamation-circle" : "fa-info-circle");
    t.innerHTML = '<i class="fas ' + ic + '"></i> ' + esc(msg);
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add("show"); }, 10);
    setTimeout(function() { t.classList.remove("show"); setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 3000);
  }

  /* ===== RENDER ===== */
  function render() { loadData(); applyFilters(); return buildPage(); }

  function buildPage() {
    var stats = computeStats();
    var html = '<div class="page-header"><h1>Gestion des points kilom\u00e9triques</h1>'
      + '<p>Consultation, cr\u00e9ation et gestion des ' + stats.total + ' points kilom\u00e9triques du r\u00e9seau</p></div>';

    html += '<div class="stats-row grid-2">';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-map-marker-alt"></i></div><div class="sc-value">' + stats.total + '</div><div class="sc-label">PKs totaux</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-road"></i></div><div class="sc-value">' + stats.routeCount + '</div><div class="sc-label">Routes avec PK</div></div>';
    html += '</div>';

    /* Toolbar */
    html += '<div class="routes-toolbar"><div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="pk-search-input" placeholder="Rechercher..." value="' + ea(state.search) + '" oninput="PKModule.onSearch(this.value)"></div>';
    html += '<div class="routes-actions">';

    var routes = getRouteList();
    html += '<select id="pk-filter-route" onchange="PKModule.onFilter(&#39;route&#39;, this.value)" style="background:var(--bg-3,#111);border:1px solid var(--border,#333);color:var(--text,#e0e0e0);padding:8px 12px;border-radius:6px;min-width:180px;margin-right:8px;font-size:.85rem">';
    html += '<option value="">-- Toutes les routes --</option>';
    routes.forEach(function(r) {
      var sel = String(r.name) === String(state.filters.route) ? " selected" : "";
      html += '<option value="' + ea(r.name) + '"' + sel + '>' + esc(r.name) + '</option>';
    });
    html += '</select>';

    if (canEdit()) {
      html += '<button class="btn-sm primary" onclick="PKModule.openCreateModal()"><i class="fas fa-plus"></i> Ajouter un PK</button>';
    }
    html += '</div></div>';

    if (state.search || state.filters.route) {
      html += '<div style="padding:0 0 8px;display:flex;align-items:center;gap:8px">';
      html += '<button class="btn-sm ghost" onclick="PKModule.resetFilters()"><i class="fas fa-rotate-left"></i> R\u00e9initialiser</button>';
      html += '<span style="font-size:.82rem;color:var(--text-3)">' + state.filtered.length + ' r\u00e9sultat' + (state.filtered.length > 1 ? "s" : "") + '</span>';
      html += '</div>';
    }

    /* Table */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-map-marker-alt"></i> Points kilom\u00e9triques <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ')</span></h3></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Num\u00e9ro</th><th>Route</th><th>Classe</th><th>D\u00e9but (X, Y)</th><th>Fin (X, Y)</th><th style="text-align:right">Actions</th>';
    html += '</tr></thead><tbody>';

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-4)"><div class="empty-state"><i class="fas fa-map-marker-alt"></i><h3>Aucun PK</h3><p>Ajoutez un PK ou modifiez vos filtres.</p>';
      if (canEdit()) html += '<button class="btn-sm primary" onclick="PKModule.openCreateModal()" style="margin-top:12px"><i class="fas fa-plus"></i> Ajouter</button>';
      html += '</div></td></tr>';
    } else {
      rows.forEach(function(pk) { html += buildRow(pk); });
    }

    html += '</tbody></table></div>';
    html += buildPagination();
    html += '</div>';
    return html;
  }

  function buildRow(pk) {
    var p = pk.properties || {};
    var html = "<tr>";
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="PKModule.openViewModal(&#39;' + ea(pk.id) + '&#39;)">' + esc(p.numero || "\u2014") + "</strong></td>";
    html += "<td>" + esc(p.route || "\u2014") + "</td>";
    html += '<td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.78rem;font-weight:600;background:' + (p.classe === "RN" ? "var(--red,.c44)" : p.classe === "CU" ? "var(--gold-dark,#b8860b)" : p.classe === "RR" ? "var(--blue,.48c)" : p.classe === "RC" ? "var(--green,.4a4)" : "var(--text-4,#666)") + ';color:#fff">' + esc(p.classe || "\u2014") + "</span></td>";
    html += '<td style="font-size:.82rem;font-family:monospace;color:var(--text-3)">' + fc(p.PK_DEB_X) + ", " + fc(p.PK_DEB_Y) + "</td>";
    html += '<td style="font-size:.82rem;font-family:monospace;color:var(--text-3)">' + fc(p.PK_FIN_X) + ", " + fc(p.PK_FIN_Y) + "</td>";
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="PKModule.openViewModal(&#39;' + ea(pk.id) + '&#39;)"><i class="fas fa-eye"></i></button>';
    if (canEdit()) html += '<button class="btn-icon" title="Modifier" onclick="PKModule.openEditModal(&#39;' + ea(pk.id) + '&#39;)"><i class="fas fa-pen"></i></button>';
    if (isAdmin()) html += '<button class="btn-icon danger" title="Supprimer" onclick="PKModule.confirmDelete(&#39;' + ea(pk.id) + '&#39;)"><i class="fas fa-trash"></i></button>';
    html += "</td></tr>";
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return "";
    var html = '<div class="routes-pagination"><span class="pag-info">Page ' + state.page + "/" + tp + " (" + state.filtered.length + ")</span><div class=\"pag-buttons\">";
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? "disabled" : "") + " onclick=\"PKModule.goPage(" + (state.page - 1) + ")\"><i class=\"fas fa-chevron-left\"></i></button>";
    var pgs = pagRange(state.page, tp);
    pgs.forEach(function(pg) {
      if (pg === "...") { html += '<span class="pag-dots">...</span>'; }
      else { var cls = pg === state.page ? "primary" : "ghost"; html += '<button class="btn-sm ' + cls + '" onclick="PKModule.goPage(' + pg + ')">' + pg + "</button>"; }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? "disabled" : "") + " onclick=\"PKModule.goPage(" + (state.page + 1) + ")\"><i class=\"fas fa-chevron-right\"></i></button>";
    html += "</div></div>";
    return html;
  }
  function pagRange(c, t) {
    if (t <= 7) { var a = []; for (var i = 1; i <= t; i++) a.push(i); return a; }
    if (c <= 4) return [1, 2, 3, 4, 5, "...", t];
    if (c >= t - 3) return [1, "...", t - 4, t - 3, t - 2, t - 1, t];
    return [1, "...", c - 1, c, c + 1, "...", t];
  }

  /* ===== MODALS ===== */

  function openViewModal(id) {
    var pk = findPK(id);
    if (!pk) return;
    var p = pk.properties || {};

    var html = '<div class="modal-admin-overlay" id="modal-pk-view" onclick="PKModule.closeModalOnOverlay(event, &#39;modal-pk-view&#39;)">';
    html += '<div class="modal-admin"><div class="modal-admin-header"><h2><i class="fas fa-map-marker-alt" style="color:var(--gold);margin-right:8px"></i> Fiche PK</h2><button class="modal-admin-close" onclick="PKModule.closeModal(&#39;modal-pk-view&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><div class="detail-grid">';
    html += df("Num\u00e9ro", p.numero);
    html += df("Route", p.route);
    html += df("Classe", p.classe || "\u2014");
    if (p.longueur) html += df("Longueur (m)", fc(p.longueur));
    html += df("Source", p.source === "route" ? "Donn\u00e9es route" : "Saisie manuelle");
    html += "</div>";

    /* Point de début */
    html += '<div style="margin-top:16px;padding:12px;background:var(--bg-2);border-radius:8px"><div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-play" style="margin-right:6px"></i> Point de d\u00e9but</div><div class="detail-grid">';
    html += df("X (PK_DEB_X)", fc(p.PK_DEB_X));
    html += df("Y (PK_DEB_Y)", fc(p.PK_DEB_Y));
    html += "</div></div>";

    /* Point de fin */
    html += '<div style="margin-top:8px;padding:12px;background:var(--bg-2);border-radius:8px"><div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-flag-checkered" style="margin-right:6px"></i> Point de fin</div><div class="detail-grid">';
    html += df("X (PK_FIN_X)", fc(p.PK_FIN_X));
    html += df("Y (PK_FIN_Y)", fc(p.PK_FIN_Y));
    html += "</div></div>";

    if (p.observations) html += dff("Observations", p.observations);
    html += df("Cr\u00e9\u00e9 par", p.modifiedBy);
    html += df("Date", p.createdAt ? new Date(p.createdAt).toLocaleString("fr-FR") : "\u2014");
    html += "</div><div class=\"modal-admin-footer\">";
    html += '<button class="btn-sm ghost" onclick="PKModule.closeModal(&#39;modal-pk-view&#39;)">Fermer</button>';
    if (canEdit()) html += '<button class="btn-sm primary" onclick="PKModule.closeModal(&#39;modal-pk-view&#39;);PKModule.openEditModal(&#39;' + ea(id) + '&#39;)"><i class="fas fa-pen"></i> Modifier</button>';
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function openCreateModal() { openFormModal(null); }
  function openEditModal(id) { var pk = findPK(id); if (pk) openFormModal(pk); }

  function openFormModal(pk) {
    var isEdit = !!pk;
    var p = pk ? (pk.properties || {}) : {};
    var title = isEdit ? "Modifier le PK" : "Ajouter un PK";
    var editId = isEdit ? pk.id : null;
    var routes = getRouteList();

    var html = '<div class="modal-admin-overlay" id="modal-pk-form" onclick="PKModule.closeModalOnOverlay(event, &#39;modal-pk-form&#39;)">';
    html += '<div class="modal-admin"><div class="modal-admin-header"><h2><i class="fas fa-' + (isEdit ? "pen" : "plus") + '" style="color:var(--gold);margin-right:8px"></i> ' + esc(title) + '</h2><button class="modal-admin-close" onclick="PKModule.closeModal(&#39;modal-pk-form&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><form id="pk-form" onsubmit="return PKModule.savePK(event, ' + (editId !== null ? "&#39;" + ea(editId) + "&#39;" : "null") + ')">';

    /* Numéro */
    html += '<div class="form-row-single"><div class="fm-group"><label>Num\u00e9ro PK *</label>';
    html += '<input type="text" name="numero" required value="' + ea(p.numero || "") + '" placeholder="Ex: PK 0+000"></div></div>';

    /* Route */
    html += '<div class="form-row-single"><div class="fm-group"><label>Route associ\u00e9e *</label>';
    html += '<select name="route" required id="pk-form-route" onchange="PKModule.onRouteChange(this.value)">';
    html += '<option value="">-- S\u00e9lectionner une route --</option>';
    routes.forEach(function(r) {
      var sel = String(r.name) === String(p.route) ? " selected" : "";
      var badge = (r.pkDebX && r.pkFinX) ? " \u2705" : "";
      html += '<option value="' + ea(r.name) + '" data-deb-x="' + r.pkDebX + '" data-deb-y="' + r.pkDebY + '" data-fin-x="' + r.pkFinX + '" data-fin-y="' + r.pkFinY + '"' + sel + ">" + esc(r.name) + badge + "</option>";
    });
    html += "</select></div></div>";

    /* Point de début */
    html += '<div style="margin-top:12px;padding:10px 12px;background:var(--bg-2);border-radius:8px">';
    html += '<div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-play" style="margin-right:6px"></i> Point de d\u00e9but</div>';
    html += '<div class="form-row"><div class="fm-group"><label>X (PK_DEB_X) *</label>';
    html += '<input type="number" step="any" name="PK_DEB_X" required id="pk-deb-x" value="' + (p.PK_DEB_X !== undefined && p.PK_DEB_X !== null && p.PK_DEB_X !== "" ? p.PK_DEB_X : "") + '" placeholder="Coordonn\u00e9e X d\u00e9but"></div>';
    html += '<div class="fm-group"><label>Y (PK_DEB_Y) *</label>';
    html += '<input type="number" step="any" name="PK_DEB_Y" required id="pk-deb-y" value="' + (p.PK_DEB_Y !== undefined && p.PK_DEB_Y !== null && p.PK_DEB_Y !== "" ? p.PK_DEB_Y : "") + '" placeholder="Coordonn\u00e9e Y d\u00e9but"></div>';
    html += "</div></div>";

    /* Point de fin */
    html += '<div style="margin-top:8px;padding:10px 12px;background:var(--bg-2);border-radius:8px">';
    html += '<div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-flag-checkered" style="margin-right:6px"></i> Point de fin</div>';
    html += '<div class="form-row"><div class="fm-group"><label>X (PK_FIN_X) *</label>';
    html += '<input type="number" step="any" name="PK_FIN_X" required id="pk-fin-x" value="' + (p.PK_FIN_X !== undefined && p.PK_FIN_X !== null && p.PK_FIN_X !== "" ? p.PK_FIN_X : "") + '" placeholder="Coordonn\u00e9e X fin"></div>';
    html += '<div class="fm-group"><label>Y (PK_FIN_Y) *</label>';
    html += '<input type="number" step="any" name="PK_FIN_Y" required id="pk-fin-y" value="' + (p.PK_FIN_Y !== undefined && p.PK_FIN_Y !== null && p.PK_FIN_Y !== "" ? p.PK_FIN_Y : "") + '" placeholder="Coordonn\u00e9e Y fin"></div>';
    html += "</div></div>";

    /* Observations */
    html += '<div class="form-row-single" style="margin-top:12px"><div class="fm-group"><label>Observations</label>';
    html += '<textarea name="observations" rows="3" placeholder="Observations...">' + esc(p.observations || "") + "</textarea></div></div>";

    /* Info */
    html += '<div style="padding:10px 12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-4);margin-top:4px">';
    html += '<i class="fas fa-info-circle" style="margin-right:6px;color:var(--blue)"></i>';
    html += "La s\u00e9lection d\u2019une route remplit automatiquement les coordonn\u00e9es de d\u00e9but et fin. Les routes avec PK existant sont marqu\u00e9es \u2705.";
    html += "</div>";

    html += '</form></div><div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="PKModule.closeModal(&#39;modal-pk-form&#39;)">Annuler</button>';
    html += '<button class="btn-sm primary" onclick="document.getElementById(&#39;pk-form&#39;).dispatchEvent(new Event(&#39;submit&#39;,{cancelable:true}))"><i class="fas fa-save"></i> ' + (isEdit ? "Enregistrer" : "Ajouter") + "</button>";
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function confirmDelete(id) {
    if (!isAdmin()) { notify("Seul un Administrateur peut supprimer.", "error"); return; }
    var pk = findPK(id);
    if (!pk) return;
    var name = (pk.properties && pk.properties.numero) || "ce PK";
    var html = '<div class="modal-admin-overlay" id="modal-pk-delete"><div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--red);margin-right:8px"></i> Confirmer</h2><button class="modal-admin-close" onclick="PKModule.closeModal(&#39;modal-pk-delete&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><p>Supprimer <strong style="color:var(--red)">' + esc(name) + "</strong> ?</p><p style=\"font-size:.84rem;color:var(--text-4);margin-top:8px\">Action irr\u00e9versible.</p></div>";
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="PKModule.closeModal(&#39;modal-pk-delete&#39;)">Annuler</button>';
    html += '<button class="btn-sm danger" onclick="PKModule.deletePK(&#39;' + ea(id) + '&#39;)"><i class="fas fa-trash"></i> Supprimer</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* ===== CRUD ===== */
  function savePK(event, id) {
    if (event) event.preventDefault();
    var form = document.getElementById("pk-form");
    if (!form) return false;
    if (!canEdit()) { notify("Permissions insuffisantes.", "error"); return false; }

    var data = {};
    form.querySelectorAll("input,select,textarea").forEach(function(el) {
      var v = el.value;
      if (el.type === "number" && v !== "") v = parseFloat(v);
      data[el.name] = v;
    });

    if (!data.numero || !data.numero.trim()) { notify("Le num\u00e9ro PK est obligatoire.", "error"); return false; }
    if (!data.route || !data.route.trim()) { notify("La route est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_DEB_X)) { notify("La coordonn\u00e9e X de d\u00e9but est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_DEB_Y)) { notify("La coordonn\u00e9e Y de d\u00e9but est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_FIN_X)) { notify("La coordonn\u00e9e X de fin est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_FIN_Y)) { notify("La coordonn\u00e9e Y de fin est obligatoire.", "error"); return false; }

    var now = new Date().toISOString();
    var userName = getSessionName();
    var props = {
      numero: data.numero.trim(), route: data.route.trim(),
      PK_DEB_X: parseFloat(data.PK_DEB_X), PK_DEB_Y: parseFloat(data.PK_DEB_Y),
      PK_FIN_X: parseFloat(data.PK_FIN_X), PK_FIN_Y: parseFloat(data.PK_FIN_Y),
      observations: data.observations || "",
      lastModified: now, modifiedBy: userName
    };
    var geom = { type: "LineString", coordinates: [[props.PK_DEB_X, props.PK_DEB_Y], [props.PK_FIN_X, props.PK_FIN_Y]] };

    if (id !== null && id !== undefined) {
      var pk = findPK(id);
      if (pk) {
        /* Conserver createdAt si présent (PHASE 5) */
        if (pk.properties && pk.properties.createdAt) props.createdAt = pk.properties.createdAt;
        if (pk.properties) { for (var k in props) pk.properties[k] = props[k]; }
        else { pk.properties = props; }
        pk.geometry = geom;
        /* Synchroniser les PK_DEB_X/Y et PK_FIN_X/Y de la route associée (sync PK→route) */
        syncPKToRoute(props.route, props);
        persistAndNotify("sig:feature:updated", { id: id, numero: data.numero, type: "pk", action: "UPDATE" });
        closeModal("modal-pk-form");
        notify('"' + data.numero + '" modifié.', "success");
      }
    } else {
      props.createdAt = now;
      var newId = "pk_" + Date.now();
      var newPK = { type: "Feature", id: newId, geometry: geom, properties: props };
      state.allPKs.push(newPK);
      /* Synchroniser les PK_DEB_X/Y et PK_FIN_X/Y de la route associée (sync PK→route) */
      syncPKToRoute(props.route, props);
      persistAndNotify("sig:feature:created", { id: newId, numero: data.numero, type: "pk", action: "CREATE" });
      closeModal("modal-pk-form");
      notify('"' + data.numero + '" ajouté.', "success");
    }
    refresh();
    return false;
  }

  function deletePK(id) {
    if (!isAdmin()) { notify("Permissions insuffisantes.", "error"); return; }
    var pk = findPK(id);
    var name = pk ? ((pk.properties && pk.properties.numero) || "PK") : "PK";
    state.allPKs = state.allPKs.filter(function(p) { return String(p.id) !== String(id); });
    persistAndNotify("sig:feature:deleted", { id: id, numero: name, type: "pk", action: "DELETE" });
    closeModal("modal-pk-delete");
    notify('"' + name + '" supprim\u00e9.', "success");
    refresh();
  }

  /**
   * Synchronise les coordonnées du PK vers la route associée dans json_Rseauroutier_6.
   * Met à jour PK_DEB_X/Y et PK_FIN_X/Y de la route. Sync bidirectionnelle PK→route.
   */
  function syncPKToRoute(routeName, pkProps) {
    if (!routeName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    json_Rseauroutier_6.features.forEach(function(feat) {
      var p = feat.properties || {};
      if (p.Name === routeName) {
        p.PK_DEB_X = pkProps.PK_DEB_X;
        p.PK_DEB_Y = pkProps.PK_DEB_Y;
        p.PK_FIN_X = pkProps.PK_FIN_X;
        p.PK_FIN_Y = pkProps.PK_FIN_Y;
        p.lastModified = new Date().toISOString();
        p.modifiedBy = 'PKModule (sync PK→route)';
      }
    });
    /* Persister la mise à jour de la route */
    if (typeof SIGPersistence !== "undefined") {
      try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6); } catch(e) {}
    }
  }

  /**
   * Calcule le chaînage d'un PK sous la forme "PK X+YYY" (km+ mètres)
   * depuis la longueur connue de la route ou la distance haversine entre début et fin.
   * @param {Object} pkProps - propriétés du PK (route, PK_DEB_X/Y, PK_FIN_X/Y, longueur)
   * @returns {string} chaînage formaté, ex: "PK 12+450"
   */
  function computeChainage(pkProps) {
    if (!pkProps) return "—";
    /* Si on a la longueur explicite de la route, l'utiliser comme chaînage total */
    var longueur = parseFloat(pkProps.longueur);
    if (!isNaN(longueur) && longueur > 0) {
      var km = Math.floor(longueur / 1000);
      var m = Math.round(longueur - km * 1000);
      return "PK " + km + "+" + (m < 10 ? "00" + m : m < 100 ? "0" + m : m);
    }
    /* Sinon, calculer la distance haversine entre début et fin */
    if (pkProps.PK_DEB_X !== undefined && pkProps.PK_FIN_X !== undefined) {
      var d = haversineDistance(pkProps.PK_DEB_X, pkProps.PK_DEB_Y, pkProps.PK_FIN_X, pkProps.PK_FIN_Y);
      if (!isNaN(d) && d > 0) {
        var km2 = Math.floor(d / 1000);
        var m2 = Math.round(d - km2 * 1000);
        return "PK " + km2 + "+" + (m2 < 10 ? "00" + m2 : m2 < 100 ? "0" + m2 : m2);
      }
    }
    return pkProps.numero || "—";
  }

  /**
   * Distance haversine (en mètres) entre deux points [x=lon, y=lat].
   */
  function haversineDistance(x1, y1, x2, y2) {
    var R = 6371000; /* rayon Terre en mètres */
    var toRad = function(d) { return d * Math.PI / 180; };
    var dLat = toRad(y2 - y1);
    var dLon = toRad(x2 - x1);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(y1)) * Math.cos(toRad(y2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calcule la distance entre deux PKs donnés (par ID).
   * @returns {Object} { distance, formatted } ou { error } si PK introuvable
   */
  function computeDistanceBetweenPKs(id1, id2) {
    var pk1 = findPK(id1);
    var pk2 = findPK(id2);
    if (!pk1 || !pk2) return { error: "PK introuvable" };
    var p1 = pk1.properties || {};
    var p2 = pk2.properties || {};
    /* Distance entre le point de fin de pk1 et le point de début de pk2 (chaînage consécutif) */
    var d = haversineDistance(p1.PK_FIN_X, p1.PK_FIN_Y, p2.PK_DEB_X, p2.PK_DEB_Y);
    if (isNaN(d)) return { error: "Coordonnées manquantes" };
    var km = (d / 1000).toFixed(2);
    return {
      distance: d,
      formatted: d.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " m (" + km + " km)",
      pk1Numero: p1.numero,
      pk2Numero: p2.numero
    };
  }

  /* ===== ÉCOUTE SIGEventBus : supprimer les PK orphelins quand une route est supprimée ===== */
  if (typeof SIGEventBus !== "undefined") {
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (!data) return;
      /* Si l'événement concerne une route (pas un PK), supprimer les PK orphelins */
      if (data.layer === 'routes' || data.layer === 'Rseauroutier_6') {
        var routeName = data.featureName;
        if (!routeName) return;
        var before = state.allPKs.length;
        state.allPKs = state.allPKs.filter(function(pk) {
          return !((pk.properties || {}).route === routeName);
        });
        if (state.allPKs.length !== before) {
          var fc2 = { type: "FeatureCollection", features: state.allPKs };
          window.json_PK = fc2;
          if (typeof SIGPersistence !== "undefined") {
            try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, fc2); } catch(e) {}
          }
        }
      }
    });
  }

  /* ===== EVENT HANDLERS ===== */
  function onRouteChange(routeName) {
    var sel = document.getElementById("pk-form-route");
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    var debX = document.getElementById("pk-deb-x");
    var debY = document.getElementById("pk-deb-y");
    var finX = document.getElementById("pk-fin-x");
    var finY = document.getElementById("pk-fin-y");
    if (debX) debX.value = opt.getAttribute("data-deb-x") || "";
    if (debY) debY.value = opt.getAttribute("data-deb-y") || "";
    if (finX) finX.value = opt.getAttribute("data-fin-x") || "";
    if (finY) finY.value = opt.getAttribute("data-fin-y") || "";
  }

  function onSearch(val) { state.search = val; state.page = 1; applyFilters(); refresh(); }
  function onFilter(key, val) { state.filters[key] = val; state.page = 1; applyFilters(); refresh(); }
  function resetFilters() { state.search = ""; state.filters = { route: "" }; state.page = 1; applyFilters(); refresh(); }
  function goPage(p) { state.page = p; refresh(); }
  function closeModal(id) { var el = document.getElementById(id); if (el) el.remove(); }
  function closeModalOnOverlay(event, id) { if (event.target.id === id) closeModal(id); }
  function refresh() { applyFilters(); var el = document.getElementById("adminContent"); if (el) { el.innerHTML = buildPage(); el.scrollTop = 0; } }

  function df(l, v) { return '<div class="detail-item"><div class="detail-label">' + esc(l) + "</div><div class=\"detail-value\">" + esc(v || "\u2014") + "</div></div>"; }
  function dff(l, v) { return '<div class="detail-item detail-full"><div class="detail-label">' + esc(l) + "</div><div class=\"detail-value\">" + esc(v || "\u2014") + "</div></div>"; }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render, onSearch: onSearch, onFilter: onFilter, resetFilters: resetFilters, goPage: goPage,
    openViewModal: openViewModal, openEditModal: openEditModal, openCreateModal: openCreateModal,
    savePK: savePK, confirmDelete: confirmDelete, deletePK: deletePK, onRouteChange: onRouteChange,
    closeModal: closeModal, closeModalOnOverlay: closeModalOnOverlay,
    /* Nouvelles fonctions PHASE 5 */
    computeChainage: computeChainage,
    computeDistanceBetweenPKs: computeDistanceBetweenPKs
  };
})();