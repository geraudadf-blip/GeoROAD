/* ===================================================================
 * GeoROAD TOGO — Module Gestion des Emprises
 *
 * Formulaire avec selecteur de route, definition emprise.
 * Synchronisation globale apres chaque enregistrement.
 * =================================================================== */
var EmpriseModule = (function() {
  "use strict";

  var PER_PAGE = 10;
  var CAT_LABELS = { "CU": "Route Communautaire", "RN": "Route Nationale", "RR": "Route R\u00e9gionale", "RC": "Route Communale", "RL": "Route Locale" };
  var CAT_CSS = { "CU": "cu", "RN": "rn", "RR": "rr", "RC": "rc", "RL": "rl" };

  var state = { allEmprises: [], filtered: [], page: 1, search: "", filters: { region: "", classe: "", empriseMin: "", empriseMax: "" } };

  function esc(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ""; }
  function ea(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : ""; }
  function isAdmin() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s && (s.role === "administrateur" || s.role === "Administrateur"); } catch(e) { return false; } }
  function canEdit() { return isAdmin(); }
  function getSessionName() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s ? (s.name || s.user || "Inconnu") : "Inconnu"; } catch(e) { return "Inconnu"; } }

  /* ===== DATA ===== */
  function loadData() {
    if (typeof json_Emprise_5 !== "undefined" && json_Emprise_5.features) {
      state.allEmprises = json_Emprise_5.features.map(function(f, idx) {
        return { id: idx, properties: Object.assign({}, f.properties || {}), geometry: f.geometry ? Object.assign({}, f.geometry) : null };
      });
    }
    state.allEmprises.forEach(function(e) {
      if (!e.properties.Name) e.properties.Name = "";
      if (!e.properties.CLASSE) e.properties.CLASSE = "";
      if (!e.properties.EMPRISE) e.properties.EMPRISE = 0;
    });
    applyFilters();
  }

  function findEmprise(id) {
    for (var i = 0; i < state.allEmprises.length; i++) { if (state.allEmprises[i].id === id) return state.allEmprises[i]; }
    return null;
  }

  function getRouteList() {
    if (typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return [];
    return json_Rseauroutier_6.features.map(function(f, idx) {
      var p = f.properties || {};
      return { index: idx, name: p.Name || ("Route " + idx), classe: p.CLASSE || "", longueur: p.LONGEUR || 0, region: p.REGIONS || "", emprise: p.EMPRISE || 0 };
    });
  }

  function findAssociatedRoute(empriseName) {
    if (!empriseName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return null;
    var name = String(empriseName).trim().toLowerCase();
    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var rn = (json_Rseauroutier_6.features[i].properties && json_Rseauroutier_6.features[i].properties.Name);
      if (rn && rn.trim().toLowerCase() === name) return json_Rseauroutier_6.features[i];
    }
    for (var j = 0; j < json_Rseauroutier_6.features.length; j++) {
      var r2 = (json_Rseauroutier_6.features[j].properties && json_Rseauroutier_6.features[j].properties.Name) || "";
      if (r2.toLowerCase().indexOf(name) !== -1 || name.indexOf(r2.toLowerCase()) !== -1) return json_Rseauroutier_6.features[j];
    }
    return null;
  }

  function getEmpriseRegion(e) {
    var route = findAssociatedRoute(e.properties.Name);
    if (route && route.properties && route.properties.REGIONS) return route.properties.REGIONS;
    return (e.properties && e.properties.REGIONS) || "";
  }

  function persistAndNotify(eventType, detail) {
    if (typeof json_Emprise_5 !== "undefined") {
      json_Emprise_5.features = state.allEmprises.map(function(e) { return { type: "Feature", properties: e.properties, geometry: e.geometry }; });
    }
    if (typeof SIGPersistence !== "undefined") SIGPersistence.saveLayer(SIGPersistence.LAYERS.EMPRISES, json_Emprise_5);
    /* Utiliser les constantes SIGEventBus.EVENTS */
    if (typeof SIGEventBus !== "undefined") {
      var evMap = {
        "sig:feature:created": SIGEventBus.EVENTS.FEATURE_CREATED,
        "sig:feature:updated": SIGEventBus.EVENTS.FEATURE_UPDATED,
        "sig:feature:deleted": SIGEventBus.EVENTS.FEATURE_DELETED,
        "sig:stats:changed": SIGEventBus.EVENTS.STATS_CHANGED,
        "sig:dashboard:refresh": SIGEventBus.EVENTS.DASHBOARD_REFRESH
      };
      var ev = evMap[eventType] || eventType;
      SIGEventBus.emit(ev, { featureId: (detail && detail.id) || null, layer: 'emprises', name: detail && detail.name });
      if (SIGEventBus.EVENTS.STATS_CHANGED) SIGEventBus.emit(SIGEventBus.EVENTS.STATS_CHANGED, { source: 'emprises' });
      if (SIGEventBus.EVENTS.DASHBOARD_REFRESH) SIGEventBus.emit(SIGEventBus.EVENTS.DASHBOARD_REFRESH, {});
    }
    /* Audit avec signature correcte log(action, options) */
    if (typeof SIGAuditTrail !== "undefined") {
      try {
        var a = (eventType === "sig:feature:created" ? "CREATE" : (eventType === "sig:feature:deleted" ? "DELETE" : "UPDATE"));
        var actionConst;
        if (a === "CREATE") actionConst = SIGAuditTrail.ACTIONS.CREATE_ROUTE;
        else if (a === "DELETE") actionConst = SIGAuditTrail.ACTIONS.DELETE_ROUTE;
        else actionConst = SIGAuditTrail.ACTIONS.UPDATE_ROUTE;
        SIGAuditTrail.log(actionConst, {
          featureId: (detail && detail.id) ? String(detail.id) : null,
          featureName: (detail && detail.name) || 'Emprise',
          user: getSessionName(),
          details: 'Emprise ' + ((detail && detail.name) || '') + ' — action ' + a + ' (couche Emprises)',
          before: null,
          after: null
        });
      } catch(e) {}
    }
  }

  /* ===== STATS ===== */
  function computeStats() {
    var total = state.allEmprises.length, te = 0, ts = 0;
    state.allEmprises.forEach(function(e) {
      var ev = parseFloat(e.properties.EMPRISE) || 0;
      te += ev;
      var route = findAssociatedRoute(e.properties.Name);
      if (route && route.properties && route.properties.LONGEUR) { ts += (ev * parseFloat(route.properties.LONGEUR)) / 10000; }
    });
    return { total: total, avgEmprise: total > 0 ? (te / total) : 0, totalSurfaceHa: ts };
  }

  /* ===== FILTRES ===== */
  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;
    state.filtered = state.allEmprises.filter(function(e) {
      var p = e.properties;
      if (s) { var r = getEmpriseRegion(e); var h = ((p.Name || "") + " " + (p.CLASSE || "") + " " + (p.EMPRISE || "") + " " + r).toLowerCase(); if (h.indexOf(s) === -1) return false; }
      if (f.classe && p.CLASSE !== f.classe) return false;
      if (f.region) { var er = getEmpriseRegion(e); if (er !== f.region) return false; }
      if (f.empriseMin !== "" && f.empriseMin !== undefined) { var ev = parseFloat(p.EMPRISE) || 0; var mv = parseFloat(f.empriseMin); if (!isNaN(mv) && ev < mv) return false; }
      if (f.empriseMax !== "" && f.empriseMax !== undefined) { var ev2 = parseFloat(p.EMPRISE) || 0; var xv = parseFloat(f.empriseMax); if (!isNaN(xv) && ev2 > xv) return false; }
      return true;
    });
    if (state.page > totalPages()) state.page = 1;
  }
  function totalPages() { return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE)); }
  function getPageData() { var s = (state.page - 1) * PER_PAGE; return state.filtered.slice(s, s + PER_PAGE); }
  function getUniqueRegions() {
    var v = {};
    state.allEmprises.forEach(function(e) { var r = getEmpriseRegion(e); if (r && r.trim()) v[r.trim()] = true; });
    if (typeof json_Rseauroutier_6 !== "undefined" && json_Rseauroutier_6.features)
      json_Rseauroutier_6.features.forEach(function(r) { var reg = (r.properties && r.properties.REGIONS) || ""; if (reg && reg.trim()) v[reg.trim()] = true; });
    return Object.keys(v).sort();
  }

  /* ===== TOAST ===== */
  function notify(msg, type) {
    type = type || "success";
    var ex = document.getElementById("emprise-toast");
    if (ex) ex.remove();
    var t = document.createElement("div");
    t.id = "emprise-toast";
    t.className = "route-toast " + type;
    var ic = type === "success" ? "fa-check-circle" : (type === "error" ? "fa-exclamation-circle" : "fa-info-circle");
    t.innerHTML = '<i class="fas ' + ic + '"></i> ' + esc(msg);
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add("show"); }, 10);
    setTimeout(function() { t.classList.remove("show"); setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 3000);
  }

  /* ===== RENDER ===== */
  function render() { loadData(); return buildPage(); }

  function buildPage() {
    var stats = computeStats();
    var html = '<div class="page-header"><h1>Gestion des emprises</h1>'
      + '<p>Consultation et gestion des ' + stats.total + " zones d\u2019emprise \u2014 "
      + stats.totalSurfaceHa.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
      + " ha estim\u00e9s</p></div>";

    html += '<div class="stats-row">';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-vector-square"></i></div><div class="sc-value">' + stats.total + '</div><div class="sc-label">Emprises</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-ruler-horizontal"></i></div><div class="sc-value">' + stats.avgEmprise.toFixed(1) + ' m</div><div class="sc-label">Emprise moyenne</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon green"><i class="fas fa-expand"></i></div><div class="sc-value">' + stats.totalSurfaceHa.toFixed(1) + ' ha</div><div class="sc-label">Surface totale</div></div>';
    html += "</div>";

    html += '<div class="routes-toolbar"><div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="emprise-search-input" placeholder="Rechercher..." value="' + ea(state.search) + '" oninput="EmpriseModule.onSearch(this.value)"></div>';
    html += '<div class="routes-actions">';
    if (canEdit()) html += '<button class="btn-sm primary" onclick="EmpriseModule.openAddModal()"><i class="fas fa-plus"></i> Ajouter une emprise</button>';
    html += "</div></div>";

    html += buildFilters();

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-draw-polygon"></i> Zones d\u2019emprise <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ")</span></h3></div>";
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Nom</th><th>Cat\u00e9gorie</th><th>Emprise (m)</th><th>Route associ\u00e9e</th><th style="text-align:right">Actions</th>';
    html += "</tr></thead><tbody>";

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-4)"><div class="empty-state"><i class="fas fa-vector-square"></i><h3>Aucune emprise</h3></div></td></tr>';
    } else { rows.forEach(function(e) { html += buildRow(e); }); }

    html += "</tbody></table></div>";
    html += buildPagination();
    html += "</div>";
    return html;
  }

  function buildFilters() {
    var regions = getUniqueRegions();
    var classes = ["CU", "RN", "RR", "RC", "RL"];
    var f = state.filters;
    var html = '<div class="routes-filters">';
    html += fSel("classe", "Cat\u00e9gorie", classes, f.classe, "-- Toutes --", CAT_LABELS);
    html += fSel("region", "R\u00e9gion", regions, f.region, "-- Toutes --");
    html += '<div class="filter-group"><label>Min (m)</label><input type="number" placeholder="Min" value="' + ea(f.empriseMin) + '" onchange="EmpriseModule.onFilter(&#39;empriseMin&#39;, this.value)" style="min-width:90px"></div>';
    html += '<div class="filter-group"><label>Max (m)</label><input type="number" placeholder="Max" value="' + ea(f.empriseMax) + '" onchange="EmpriseModule.onFilter(&#39;empriseMax&#39;, this.value)" style="min-width:90px"></div>';
    html += '<button class="btn-sm ghost" onclick="EmpriseModule.resetFilters()" style="white-space:nowrap"><i class="fas fa-rotate-left"></i> R\u00e9initialiser</button>';
    html += "</div>";
    return html;
  }

  function fSel(key, label, opts, cur, ph, lm) {
    var html = '<div class="filter-group"><label>' + label + '</label>';
    html += '<select onchange="EmpriseModule.onFilter(&#39;' + key + '&#39;, this.value)"><option value="">' + ph + "</option>";
    opts.forEach(function(o) {
      var s = o === cur ? " selected" : "";
      var d = lm ? (lm[o] || o) : o;
      html += '<option value="' + ea(o) + '"' + s + ">" + esc(d) + "</option>";
    });
    html += "</select></div>";
    return html;
  }

  function buildRow(e) {
    var p = e.properties;
    var catLabel = CAT_LABELS[p.CLASSE] || p.CLASSE || "\u2014";
    var ev = parseFloat(p.EMPRISE) || 0;
    var route = findAssociatedRoute(p.Name);
    var rl = route ? (route.properties.Name || "\u2014") : '<span style="color:var(--text-4)">Non associ\u00e9e</span>';
    var html = "<tr>";
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="EmpriseModule.viewEmprise(' + e.id + ')">' + esc(p.Name || "\u2014") + "</strong></td>";
    html += '<td><span class="cat-dot cat-' + (CAT_CSS[p.CLASSE] || "") + '"></span> ' + esc(catLabel) + "</td>";
    html += "<td>" + ev.toLocaleString("fr-FR") + "</td><td>" + rl + "</td>";
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="EmpriseModule.viewEmprise(' + e.id + ')"><i class="fas fa-eye"></i></button>';
    if (canEdit()) html += '<button class="btn-icon" title="Modifier" onclick="EmpriseModule.openEditModal(' + e.id + ')"><i class="fas fa-pen"></i></button>';
    if (isAdmin()) html += '<button class="btn-icon danger" title="Supprimer" onclick="EmpriseModule.confirmDelete(' + e.id + ')"><i class="fas fa-trash"></i></button>';
    html += "</td></tr>";
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return "";
    var html = '<div class="routes-pagination"><span class="pag-info">Page ' + state.page + "/" + tp + " (" + state.filtered.length + ")</span><div class=\"pag-buttons\">";
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? "disabled" : "") + " onclick=\"EmpriseModule.goPage(" + (state.page - 1) + ")\"><i class=\"fas fa-chevron-left\"></i></button>";
    var pgs = pagR(state.page, tp);
    pgs.forEach(function(pg) {
      if (pg === "...") { html += '<span class="pag-dots">...</span>'; }
      else { var c = pg === state.page ? "primary" : "ghost"; html += '<button class="btn-sm ' + c + '" onclick="EmpriseModule.goPage(' + pg + ')">' + pg + "</button>"; }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? "disabled" : "") + " onclick=\"EmpriseModule.goPage(" + (state.page + 1) + ")\"><i class=\"fas fa-chevron-right\"></i></button>";
    html += "</div></div>";
    return html;
  }

  function pagR(c, t) {
    if (t <= 7) { var a = []; for (var i = 1; i <= t; i++) a.push(i); return a; }
    if (c <= 4) return [1, 2, 3, 4, 5, "...", t];
    if (c >= t - 3) return [1, "...", t - 4, t - 3, t - 2, t - 1, t];
    return [1, "...", c - 1, c, c + 1, "...", t];
  }

  /* ===== MODALS ===== */

  function viewEmprise(id) {
    var e = findEmprise(id);
    if (!e) return;
    var p = e.properties;
    var ev = parseFloat(p.EMPRISE) || 0;
    var cl = CAT_LABELS[p.CLASSE] || p.CLASSE || "\u2014";
    var route = findAssociatedRoute(p.Name);
    var rn = route ? (route.properties.Name || "\u2014") : "Non associ\u00e9e";
    var rl = route ? (parseFloat(route.properties.LONGEUR) || 0) : 0;
    var reg = getEmpriseRegion(e);
    var sh = (ev * rl) / 10000;

    var html = '<div class="modal-admin-overlay" id="modal-emprise-view" onclick="EmpriseModule.closeModalOnOverlay(event, &#39;modal-emprise-view&#39;)">';
    html += '<div class="modal-admin" style="max-width:560px"><div class="modal-admin-header"><h2><i class="fas fa-vector-square" style="color:var(--gold);margin-right:8px"></i> Fiche emprise</h2><button class="modal-admin-close" onclick="EmpriseModule.closeModal(&#39;modal-emprise-view&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><div class="detail-grid">';
    html += df("Nom", p.Name);
    html += df("Cat\u00e9gorie", cl);
    html += df("Emprise", ev.toLocaleString("fr-FR") + " m");
    html += df("Route", rn);
    html += df("R\u00e9gion", reg || "\u2014");
    html += df("Longueur route", rl > 0 ? (rl / 1000).toFixed(2) + " km" : "\u2014");
    html += df("Surface estim\u00e9e", sh > 0 ? sh.toFixed(2) + " ha" : "\u2014");
    html += "</div></div>";
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="EmpriseModule.closeModal(&#39;modal-emprise-view&#39;)">Fermer</button>';
    if (canEdit()) html += '<button class="btn-sm primary" onclick="EmpriseModule.closeModal(&#39;modal-emprise-view&#39;);EmpriseModule.openEditModal(' + id + ')"><i class="fas fa-pen"></i> Modifier</button>';
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function openAddModal() { openFormModal(null); }
  function openEditModal(id) { var e = findEmprise(id); if (e) openFormModal(e); }

  function openFormModal(emprise) {
    var isEdit = !!emprise;
    var p = emprise ? emprise.properties : {};
    var title = isEdit ? "Modifier l\u2019emprise" : "Ajouter une emprise";
    var routes = getRouteList();

    var html = '<div class="modal-admin-overlay" id="modal-emprise-form" onclick="EmpriseModule.closeModalOnOverlay(event, &#39;modal-emprise-form&#39;)">';
    html += '<div class="modal-admin" style="max-width:560px"><div class="modal-admin-header"><h2><i class="fas fa-' + (isEdit ? "pen" : "plus") + '" style="color:var(--gold);margin-right:8px"></i> ' + title + '</h2><button class="modal-admin-close" onclick="EmpriseModule.closeModal(&#39;modal-emprise-form&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><form id="emprise-form" onsubmit="return EmpriseModule.saveEmprise(event, ' + (isEdit ? emprise.id : "null") + ')">';

    /* Route selector */
    html += '<div class="form-row-single"><div class="fm-group"><label>Route associ\u00e9e *</label>';
    html += '<select name="route" required id="emprise-form-route" onchange="EmpriseModule.onRouteSelect(this.value)">';
    html += '<option value="">-- S\u00e9lectionner une route --</option>';
    routes.forEach(function(r) {
      var sel = isEdit && p.route_associee === r.name ? " selected" : "";
      html += '<option value="' + ea(r.name) + '" data-classe="' + ea(r.classe) + '" data-emprise="' + r.emprise + '" data-longueur="' + r.longueur + '" data-region="' + ea(r.region) + '"' + sel + ">" + esc(r.name) + " (" + (CAT_LABELS[r.classe] || r.classe) + ")</option>";
    });
    html += "</select></div></div>";

    /* Nom + CLASSE */
    html += '<div class="form-row"><div class="fm-group"><label>Nom de l\u2019emprise *</label>';
    html += '<input type="text" name="Name" required id="emprise-form-name" value="' + ea(p.Name || "") + '" placeholder="Ex: Lom\u00e9-Sokod\u00e9"></div>';

    html += '<div class="fm-group"><label>Cat\u00e9gorie (CLASSE) *</label>';
    html += '<select name="CLASSE" required id="emprise-form-classe">';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    [["CU", "Route Communautaire"], ["RN", "Route Nationale"], ["RR", "Route R\u00e9gionale"], ["RC", "Route Communale"], ["RL", "Route Locale"]].forEach(function(o) {
      var sel = String(o[0]) === String(p.CLASSE) ? " selected" : "";
      html += '<option value="' + ea(o[0]) + '"' + sel + ">" + esc(o[1]) + "</option>";
    });
    html += "</select></div></div>";

    /* EMPRISE + Info route */
    html += '<div class="form-row"><div class="fm-group"><label>Emprise (m) *</label>';
    html += '<input type="number" name="EMPRISE" step="1" min="0" required id="emprise-form-emp" value="' + (p.EMPRISE || "") + '" placeholder="Ex: 70"></div>';

    html += '<div class="fm-group"><label>Info route</label>';
    html += '<div id="emprise-route-info" style="padding:8px 10px;background:var(--bg-2);border-radius:6px;font-size:.82rem;color:var(--text-3);min-height:38px;display:flex;align-items:center">';
    html += '<span style="color:var(--text-4)">S\u00e9lectionnez une route ci-dessus</span></div></div></div>';

    /* Info box */
    html += '<div style="padding:10px 12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-4);margin-top:4px">';
    html += '<i class="fas fa-info-circle" style="margin-right:6px;color:var(--blue)"></i>';
    html += "S\u00e9lectionnez une route pour remplir automatiquement le nom, la cat\u00e9gorie et l\u2019emprise. Apr\u00e8s enregistrement, la base se met \u00e0 jour.";
    html += "</div>";

    html += '</form></div><div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="EmpriseModule.closeModal(&#39;modal-emprise-form&#39;)">Annuler</button>';
    html += '<button class="btn-sm primary" onclick="document.getElementById(&#39;emprise-form&#39;).dispatchEvent(new Event(&#39;submit&#39;,{cancelable:true}))"><i class="fas fa-save"></i> ' + (isEdit ? "Enregistrer" : "Ajouter") + "</button>";
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);

    if (isEdit && p.route_associee) {
      setTimeout(function() { onRouteSelect(p.route_associee); }, 50);
    }
  }

  function confirmDelete(id) {
    if (!isAdmin()) { notify("Permissions insuffisantes.", "error"); return; }
    var e = findEmprise(id);
    if (!e) return;
    var name = e.properties.Name || "cette emprise";
    var html = '<div class="modal-admin-overlay" id="modal-emprise-delete"><div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--red);margin-right:8px"></i> Confirmer</h2><button class="modal-admin-close" onclick="EmpriseModule.closeModal(&#39;modal-emprise-delete&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><p>Supprimer <strong style="color:var(--red)">' + esc(name) + "</strong> ?</p></div>";
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="EmpriseModule.closeModal(&#39;modal-emprise-delete&#39;)">Annuler</button>';
    html += '<button class="btn-sm" style="background:var(--red);color:#fff" onclick="EmpriseModule.deleteEmprise(' + id + ')"><i class="fas fa-trash"></i> Supprimer</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* ===== CRUD ===== */
  function saveEmprise(event, id) {
    if (event) event.preventDefault();
    var form = document.getElementById("emprise-form");
    if (!form) return false;
    if (!canEdit()) { notify("Permissions insuffisantes.", "error"); return false; }

    var data = {};
    form.querySelectorAll("input,select,textarea").forEach(function(el) {
      var v = el.value;
      if (el.type === "number" && v !== "") v = parseFloat(v);
      data[el.name] = v;
    });

    if (!data.Name || !data.Name.trim()) { notify("Le nom est obligatoire.", "error"); return false; }
    if (!data.CLASSE) { notify("La cat\u00e9gorie est obligatoire.", "error"); return false; }
    if (!data.EMPRISE || parseFloat(data.EMPRISE) <= 0) { notify("L\u2019emprise doit \u00eatre positive.", "error"); return false; }

    var now = new Date().toISOString();
    var userName = getSessionName();

    if (id !== null && id !== undefined) {
      var e = findEmprise(id);
      if (e) {
        e.properties.Name = data.Name.trim();
        e.properties.CLASSE = data.CLASSE;
        e.properties.EMPRISE = parseFloat(data.EMPRISE);
        e.properties.route_associee = data.route || "";
        /* Conservation de l'identifiant unique de la route (PHASE 4) */
        var routeObj = findAssociatedRoute(data.Name);
        e.properties.route_id = routeObj && routeObj.id ? String(routeObj.id) : '';
        e.properties.lastModified = now;
        e.properties.modifiedBy = userName;
        persistAndNotify("sig:feature:updated", { id: id, name: data.Name, type: "emprise", action: "update" });
        closeModal("modal-emprise-form");
        notify('"' + data.Name + '" modifi\u00e9e.', "success");
      }
    } else {
      var newId = state.allEmprises.length > 0 ? Math.max.apply(null, state.allEmprises.map(function(e) { return e.id; })) + 1 : 0;
      var newE = {
        id: newId,
        properties: (function() {
          var r = findAssociatedRoute(data.Name.trim());
          return {
            Name: data.Name.trim(), CLASSE: data.CLASSE, EMPRISE: parseFloat(data.EMPRISE),
            route_associee: data.route || "",
            /* Conservation de l'identifiant unique de la route (PHASE 4) */
            route_id: r && r.id ? String(r.id) : '',
            status: "active",
            createdAt: now, lastModified: now, modifiedBy: userName
          };
        })(),
        geometry: null
      };
      state.allEmprises.push(newE);
      persistAndNotify("sig:feature:created", { id: newId, name: data.Name, type: "emprise", action: "create" });
      closeModal("modal-emprise-form");
      notify('"' + data.Name + '" ajout\u00e9e.', "success");
    }
    refresh();
    return false;
  }

  function deleteEmprise(id) {
    if (!isAdmin()) { notify("Permissions insuffisantes.", "error"); return; }
    var e = findEmprise(id);
    var name = e ? (e.properties.Name || "Emprise") : "Emprise";
    state.allEmprises = state.allEmprises.filter(function(e) { return e.id !== id; });
    persistAndNotify("sig:feature:deleted", { id: id, name: name, type: "emprise", action: "delete" });
    closeModal("modal-emprise-delete");
    notify('"' + name + '" supprim\u00e9e.', "success");
    refresh();
  }

  /* ===== EVENT HANDLERS ===== */
  function onRouteSelect(routeName) {
    var sel = document.getElementById("emprise-form-route");
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return;

    var nameInput = document.getElementById("emprise-form-name");
    var classeSelect = document.getElementById("emprise-form-classe");
    var empInput = document.getElementById("emprise-form-emp");
    var infoDiv = document.getElementById("emprise-route-info");

    if (nameInput) nameInput.value = routeName;
    if (classeSelect) classeSelect.value = opt.getAttribute("data-classe") || "";
    var defEmp = opt.getAttribute("data-emprise") || "";
    if (empInput && defEmp) empInput.value = defEmp;

    if (infoDiv) {
      var lg = opt.getAttribute("data-longueur") || 0;
      var rg = opt.getAttribute("data-region") || "";
      var cl = opt.getAttribute("data-classe") || "";
      var clLabel = CAT_LABELS[cl] || cl;
      var lenKm = parseFloat(lg) > 0 ? (parseFloat(lg) / 1000).toFixed(2) + " km" : "\u2014";
      infoDiv.innerHTML = "<div><strong>" + esc(routeName) + "</strong><br><span style=\"color:var(--text-4)\">" + esc(clLabel) + " \u00b7 " + esc(rg) + " \u00b7 " + lenKm + "</span></div>";
    }
  }

  function onSearch(val) { state.search = val; state.page = 1; applyFilters(); refresh(); }
  function onFilter(key, val) { state.filters[key] = val; state.page = 1; applyFilters(); refresh(); }
  function resetFilters() { state.search = ""; state.filters = { region: "", classe: "", empriseMin: "", empriseMax: "" }; state.page = 1; applyFilters(); refresh(); }
  function goPage(p) { state.page = p; refresh(); }
  function closeModal(id) { var el = document.getElementById(id); if (el) el.remove(); }
  function closeModalOnOverlay(event, id) { if (event.target.id === id) closeModal(id); }
  function refresh() {
    applyFilters();
    var el = document.getElementById("adminContent");
    if (el) { el.innerHTML = buildPage(); el.scrollTop = 0; }
    var badge = document.querySelector('.nav-item[data-page="emprises"] .nav-badge');
    if (badge) badge.textContent = state.allEmprises.length;
  }

  function df(l, v) { return '<div class="detail-item"><div class="detail-label">' + esc(l) + "</div><div class=\"detail-value\">" + esc(v || "\u2014") + "</div></div>"; }

  /**
   * Calcule la surface réelle d'une emprise si elle possède une géométrie polygonale.
   * Sinon, fallback estimation : largeur (EMPRISE) × longueur route (LONGEUR).
   * @returns {Object} { surface_m2, surface_ha, source } ou null si impossible
   */
  function computeEmpriseSurface(e) {
    if (!e) return null;
    var p = e.properties || {};
    /* Si l'emprise a une géométrie polygonale, calculer la surface réelle */
    if (e.geometry && (e.geometry.type === 'Polygon' || e.geometry.type === 'MultiPolygon')) {
      if (typeof ol !== 'undefined' && ol.sphere && ol.sphere.getArea) {
        try {
          var fmt = new ol.format.GeoJSON();
          var g = fmt.readGeometry(e.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
          var areaM2 = ol.sphere.getArea(g);
          if (areaM2 > 0) {
            return { surface_m2: areaM2, surface_ha: areaM2 / 10000, source: 'polygone' };
          }
        } catch(err) {}
      }
    }
    /* Fallback : estimation largeur × longueur route */
    var ev = parseFloat(p.EMPRISE) || 0;
    if (ev > 0) {
      var route = findAssociatedRoute(p.Name);
      var rl = route && route.properties ? (parseFloat(route.properties.LONGEUR) || 0) : 0;
      if (rl > 0) {
        var surf = ev * rl;
        return { surface_m2: surf, surface_ha: surf / 10000, source: 'estimation (largeur × longueur route)' };
      }
    }
    return null;
  }

  /**
   * Calcule la largeur moyenne d'une emprise.
   * Si polygone : surface / longueur concernée.
   * Sinon : valeur EMPRISE stockée.
   */
  function computeEmpriseLargeurMoyenne(e) {
    if (!e) return 0;
    var p = e.properties || {};
    var surf = computeEmpriseSurface(e);
    if (surf && surf.source === 'polygone') {
      var route = findAssociatedRoute(p.Name);
      var rl = route && route.properties ? (parseFloat(route.properties.LONGEUR) || 0) : 0;
      if (rl > 0) return surf.surface_m2 / rl;
    }
    return parseFloat(p.EMPRISE) || 0;
  }

  /* ===== ÉCOUTE SIGEventBus : supprimer les emprises orphelines quand une route est supprimée ===== */
  if (typeof SIGEventBus !== "undefined") {
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (!data) return;
      if (data.layer === 'routes' || data.layer === 'Rseauroutier_6') {
        var routeName = data.featureName;
        if (!routeName) return;
        var before = state.allEmprises.length;
        /* On ne supprime pas les emprises (elles peuvent concerner d'autres routes)
           mais on marque route_associee = null pour signaler l'orphelinat */
        state.allEmprises.forEach(function(e) {
          if ((e.properties || {}).Name === routeName) {
            e.properties.route_associee_orpheline = true;
          }
        });
        if (state.allEmprises.length !== before) {
          persistAndNotify("sig:feature:updated", { id: null, name: routeName });
        }
      }
    });
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render, onSearch: onSearch, onFilter: onFilter, resetFilters: resetFilters, goPage: goPage,
    viewEmprise: viewEmprise, openAddModal: openAddModal, openEditModal: openEditModal,
    saveEmprise: saveEmprise, confirmDelete: confirmDelete, deleteEmprise: deleteEmprise,
    closeModal: closeModal, closeModalOnOverlay: closeModalOnOverlay, onRouteSelect: onRouteSelect,
    /* Nouvelles fonctions PHASE 4 */
    computeEmpriseSurface: computeEmpriseSurface,
    computeEmpriseLargeurMoyenne: computeEmpriseLargeurMoyenne
  };
})();