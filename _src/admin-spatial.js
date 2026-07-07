/* ===================================================================
 * GeoROAD TOGO — Module Gestion des Données Spatiales
 *
 * Import : GeoJSON, CSV (avec détection automatique des colonnes de coordonnées)
 * Export : GeoJSON, CSV, PDF (fiche), Excel
 *
 * L'import affiche un aperçu complet avant validation :
 *   - Nombre d'entités
 *   - Projection détectée
 *   - Types de géométrie
 *   - Étendue (bbox)
 *   - Erreurs éventuelles
 *   - Choix de la couche de destination
 *   - Annuler / Confirmer
 *
 * Après validation :
 *   - Import via SIGDataEngine
 *   - Déclenche EventBus
 *   - Met à jour carte, statistiques, dashboard, journal d'audit
 *
 * Dépend : SIGEventBus, SIGAuditTrail, SIGPersistence, AdminAuth
 * =================================================================== */
var SpatialModule = (function() {
  'use strict';

  /* ===== COUCHES DE DESTINATION ===== */
  var DESTINATION_LAYERS = [
    { key: 'routes', label: 'Réseau routier', icon: 'fa-road', geomTypes: ['LineString', 'MultiLineString'] },
    { key: 'emprises', label: 'Emprises', icon: 'fa-vector-square', geomTypes: ['Polygon', 'MultiPolygon'] },
    { key: 'pk', label: 'Points kilométriques', icon: 'fa-map-pin', geomTypes: ['Point'] }
  ];

  /* ===== COORDINATE COLUMN PATTERNS ===== */
  var COORD_PATTERNS = [
    { lat: ['latitude', 'lat'], lon: ['longitude', 'lon', 'lng'], crs: 'EPSG:4326' },
    { lat: ['lat'], lon: ['lon'], crs: 'EPSG:4326' },
    { lat: ['y'], lon: ['x'], crs: 'EPSG:4326' },
    { lat: ['northing'], lon: ['easting'], crs: 'EPSG:32631' },
    { lat: ['nord'], lon: ['est'], crs: 'EPSG:32631' },
    { lat: ['coord_y'], lon: ['coord_x'], crs: 'EPSG:4326' },
    { lat: ['utm_n', 'utm_y', 'y_utm'], lon: ['utm_e', 'utm_x', 'x_utm'], crs: 'EPSG:32631' },
    { lat: ['pk_deb_y'], lon: ['pk_deb_x'], crs: 'EPSG:4326' }
  ];

  function detectCoordColumns(headers) {
    var lowerHeaders = headers.map(function(h) { return h.toLowerCase().trim(); });
    for (var p = 0; p < COORD_PATTERNS.length; p++) {
      var pat = COORD_PATTERNS[p];
      var latIdx = -1, lonIdx = -1;
      for (var i = 0; i < lowerHeaders.length; i++) {
        if (latIdx === -1) {
          for (var li = 0; li < pat.lat.length; li++) {
            if (lowerHeaders[i] === pat.lat[li]) { latIdx = i; break; }
          }
        }
        if (lonIdx === -1) {
          for (var lo = 0; lo < pat.lon.length; lo++) {
            if (lowerHeaders[i] === pat.lon[lo]) { lonIdx = i; break; }
          }
        }
      }
      if (latIdx !== -1 && lonIdx !== -1) {
        return { latIdx: latIdx, lonIdx: lonIdx, crs: pat.crs, latHeader: headers[latIdx], lonHeader: headers[lonIdx] };
      }
    }
    return null;
  }

  /* ===== CRS HELPERS ===== */
  var CRS_LABELS = {
    'EPSG:4326': 'WGS 84 (géographique)',
    'EPSG:32630': 'UTM Zone 30N',
    'EPSG:32631': 'UTM Zone 31N',
    'EPSG:32632': 'UTM Zone 32N'
  };

  function reprojectToWGS84(x, y, fromCRS) {
    if (fromCRS === 'EPSG:4326') return [x, y];
    if (typeof SIGSpatialCalculator !== 'undefined' && typeof SIGSpatialCalculator.reproject === 'function') {
      return SIGSpatialCalculator.reproject([x, y], fromCRS, 'EPSG:4326');
    }
    if (typeof ol !== 'undefined' && ol.proj && ol.proj.transform) {
      return ol.proj.transform([x, y], fromCRS, 'EPSG:4326');
    }
    /* Fallback: simple approximation (less accurate) */
    var lon = (x - 500000) / 111319.488 + 0;
    var lat = y / 110546.466;
    return [lon, lat];
  }

  function isUTMCoord(x, y) {
    /* UTM coordinates: Easting ~100k-900k, Northing ~0-10M for zone 31N (Togo) */
    return x > 100000 && x < 900000 && y > 0 && y < 10000000;
  }

  function detectCRSFromBBox(bbox) {
    /* If all X coords are in UTM range, likely UTM */
    if (isUTMCoord(bbox.minX, bbox.minY) && isUTMCoord(bbox.maxX, bbox.maxY)) {
      return 'EPSG:32631';
    }
    /* If coords look like geographic (lon/lat in reasonable ranges) */
    if (bbox.minX >= -180 && bbox.maxX <= 180 && bbox.minY >= -90 && bbox.maxY <= 90) {
      return 'EPSG:4326';
    }
    return 'EPSG:4326'; /* default */
  }

  /* ===== HELPER ===== */
  function esc(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  /* ===== RENDER ===== */
  function render() {
    var html = '<div class="page-header"><h1>Gestion des données spatiales</h1>'
      + '<p>Importez et exportez vos données géographiques — GeoJSON, CSV</p></div>';

    /* Import / Export cards */
    html += '<div class="grid-2">';
    html += '<div class="admin-panel"><div class="panel-body" style="text-align:center;padding:40px 24px">'
      + '<div class="sc-icon gold" style="margin:0 auto 14px"><i class="fas fa-file-import"></i></div>'
      + '<h3 style="font-size:1rem;font-weight:600;margin-bottom:4px">Importer des données</h3>'
      + '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:16px">GeoJSON (.geojson, .json) et CSV (.csv)</p>'
      + '<button class="btn-sm primary" onclick="SpatialModule.openImportDialog()"><i class="fas fa-upload"></i> Importer</button>'
      + '</div></div>';

    html += '<div class="admin-panel"><div class="panel-body" style="text-align:center;padding:40px 24px">'
      + '<div class="sc-icon blue" style="margin:0 auto 14px"><i class="fas fa-file-export"></i></div>'
      + '<h3 style="font-size:1rem;font-weight:600;margin-bottom:4px">Exporter des données</h3>'
      + '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:16px">GeoJSON, CSV, PDF, Excel</p>'
      + '<button class="btn-sm primary" onclick="SpatialModule.openExportDialog()"><i class="fas fa-download"></i> Exporter</button>'
      + '</div></div>';
    html += '</div>';

    /* Layers table — vue enrichie PHASE 6 */
    html += '<div class="admin-panel" style="margin-top:20px"><div class="panel-header"><h3><i class="fas fa-layer-group"></i> Couches disponibles</h3>'
      + '<button class="btn-sm ghost" style="margin-left:auto" onclick="SpatialModule.refreshLayers()"><i class="fas fa-rotate"></i> Rafraîchir</button></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Couche</th><th>Type géom.</th><th>Entités</th><th>Projection</th><th>Date mise à jour</th><th>État</th><th>Santé</th><th style="text-align:right">Actions</th>'
      + '</tr></thead><tbody>';

    var layers = getLayerInfo();
    layers.forEach(function(l) {
      var sante = l.health;
      var santeBadge = sante.errors === 0
        ? '<span class="status-badge active" title="' + sante.errors + ' erreur(s), ' + sante.warnings + ' avertissement(s)"><i class="fas fa-circle-check"></i> OK</span>'
        : '<span class="status-badge inactive" title="' + sante.errors + ' erreur(s), ' + sante.warnings + ' avertissement(s)"><i class="fas fa-circle-exclamation"></i> ' + sante.errors + ' erreur(s)</span>';
      html += '<tr>'
        + '<td><strong><i class="fas ' + l.icon + '" style="margin-right:6px;color:var(--gold)"></i>' + l.name + '</strong></td>'
        + '<td>' + l.geomType + '</td>'
        + '<td>' + l.count + '</td>'
        + '<td style="font-family:monospace;font-size:.8rem">' + l.projection + '</td>'
        + '<td style="font-size:.8rem">' + l.lastModified + '</td>'
        + '<td><span class="status-badge ' + l.status + '">' + l.statusLabel + '</span></td>'
        + '<td>' + santeBadge + '</td>'
        + '<td style="text-align:right;white-space:nowrap">'
        + '<button class="btn-icon" title="Exporter" onclick="SpatialModule.exportLayer(\'' + l.key + '\')"><i class="fas fa-download"></i></button>'
        + '<button class="btn-icon" title="Informations" onclick="SpatialModule.showLayerInfo(\'' + l.key + '\')"><i class="fas fa-circle-info"></i></button>'
        + '<button class="btn-icon" title="Vérification géométrique" onclick="SpatialModule.validateLayerGeometry(\'' + l.key + '\')"><i class="fas fa-clipboard-check"></i></button>'
        + '<a class="btn-icon" title="Voir sur le géoportail" href="geoportail.html" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:inherit"><i class="fas fa-external-link-alt"></i></a>'
        + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';

    /* Storage info */
    if (typeof SIGPersistence !== 'undefined') {
      var size = SIGPersistence.getStorageSize();
      var sizeStr = size > 1048576 ? (size / 1048576).toFixed(2) + ' Mo' : (size / 1024).toFixed(1) + ' Ko';
      html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-body" style="display:flex;align-items:center;gap:14px">'
        + '<div class="sc-icon green"><i class="fas fa-database"></i></div>'
        + '<div><div style="font-weight:600;font-size:.92rem">Stockage local</div>'
        + '<div style="font-size:.82rem;color:var(--text-3)">' + sizeStr + ' utilisés — Dernière synchro : '
        + (SIGPersistence.getMeta('lastSync') ? new Date(SIGPersistence.getMeta('lastSync')).toLocaleString('fr-FR') : 'Jamais')
        + '</div></div></div></div>';
    }

    return html;
  }

  function getLayerInfo() {
    var info = [
      { name: 'Réseau routier', varName: 'json_Rseauroutier_6', icon: 'fa-road', geomType: 'Ligne', key: 'routes', storageKey: 'routes' },
      { name: 'Emprises', varName: 'json_Emprise_5', icon: 'fa-vector-square', geomType: 'Polygone', key: 'emprises', storageKey: 'emprises' },
      { name: 'Régions', varName: 'json_Rgion_2', icon: 'fa-map', geomType: 'Polygone', key: 'regions', storageKey: null },
      { name: 'Préfectures', varName: 'json_Prfecture_3', icon: 'fa-map-marker-alt', geomType: 'Polygone', key: 'prefectures', storageKey: null },
      { name: 'Cantons', varName: 'json_Canton_4', icon: 'fa-location-dot', geomType: 'Polygone', key: 'cantons', storageKey: null }
    ];
    info.forEach(function(l) {
      var data = window[l.varName];
      l.count = (data && data.features) ? data.features.length : 0;
      l.status = l.count > 0 ? 'active' : 'inactive';
      l.statusLabel = l.count > 0 ? 'Active' : 'Vide';
      /* Projection — déduite du CRS de la couche */
      l.projection = 'EPSG:4326';
      if (data && data.crs && data.crs.properties && data.crs.properties.name) {
        var n = data.crs.properties.name;
        if (n.indexOf('CRS84') !== -1 || n.indexOf('4326') !== -1) l.projection = 'EPSG:4326';
        else if (n.indexOf('32630') !== -1) l.projection = 'EPSG:32630';
        else if (n.indexOf('32631') !== -1) l.projection = 'EPSG:32631';
        else if (n.indexOf('32632') !== -1) l.projection = 'EPSG:32632';
        else if (n.indexOf('3857') !== -1) l.projection = 'EPSG:3857';
      }
      /* Date mise à jour — depuis les propriétés lastModified des features, ou meta SIGPersistence */
      l.lastModified = '—';
      if (data && data.features) {
        var latest = null;
        data.features.forEach(function(f) {
          var lm = f.properties && (f.properties.lastModified || f.properties.createdAt);
          if (lm && (!latest || new Date(lm) > new Date(latest))) latest = lm;
        });
        if (latest) {
          try { l.lastModified = new Date(latest).toLocaleDateString('fr-FR'); } catch(e) {}
        }
      }
      if (l.lastModified === '—' && l.storageKey && typeof SIGPersistence !== 'undefined') {
        try {
          var ls = SIGPersistence.getMeta('lastSync_' + l.storageKey);
          if (ls) l.lastModified = new Date(ls).toLocaleDateString('fr-FR');
        } catch(e) {}
      }
      /* Indicateur de santé — validité géométrique + doublons */
      l.health = computeLayerHealth(data, l.key);
    });
    /* PK depuis localStorage */
    if (typeof SIGPersistence !== 'undefined') {
      var pkData = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
      if (pkData && pkData.features && pkData.features.length > 0) {
        info.push({
          name: 'Points kilométriques', varName: null, icon: 'fa-map-pin', geomType: 'Point', key: 'pk',
          count: pkData.features.length, status: 'active', statusLabel: 'Active',
          projection: 'EPSG:4326',
          lastModified: (function() {
            var latest = null;
            pkData.features.forEach(function(f) {
              var lm = f.properties && (f.properties.lastModified || f.properties.createdAt);
              if (lm && (!latest || new Date(lm) > new Date(latest))) latest = lm;
            });
            return latest ? new Date(latest).toLocaleDateString('fr-FR') : '—';
          })(),
          health: computeLayerHealth(pkData, 'pk')
        });
      }
    }
    return info;
  }

  /**
   * Calcule l'indicateur de santé d'une couche : { errors, warnings, details }
   * - errors : géométries invalides (null, type inconnu, self-intersections)
   * - warnings : doublons potentiels (même Name), features sans géométrie
   */
  function computeLayerHealth(data, layerKey) {
    var result = { errors: 0, warnings: 0, details: [] };
    if (!data || !data.features) return result;
    var seen = {};
    data.features.forEach(function(f, idx) {
      /* Vérifier que la feature a une géométrie */
      if (!f.geometry) {
        result.warnings++;
        return;
      }
      /* Vérifier le type de géométrie */
      var validTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];
      if (validTypes.indexOf(f.geometry.type) === -1) {
        result.errors++;
        result.details.push('Feature ' + idx + ' : type géométrique inconnu ' + f.geometry.type);
        return;
      }
      /* Vérifier les coordonnées */
      if (!f.geometry.coordinates && f.geometry.type !== 'GeometryCollection') {
        result.errors++;
        result.details.push('Feature ' + idx + ' : coordonnées manquantes');
        return;
      }
      /* Si SIGSpatialCalculator est disponible, valider la géométrie */
      if (typeof SIGSpatialCalculator !== 'undefined' && typeof SIGSpatialCalculator.validateGeometry === 'function') {
        try {
          var v = SIGSpatialCalculator.validateGeometry(f.geometry);
          if (v && v.errors && v.errors.length > 0) {
            result.errors += v.errors.length;
            v.errors.forEach(function(err) { result.details.push('Feature ' + idx + ' : ' + err); });
          }
          if (v && v.warnings && v.warnings.length > 0) {
            result.warnings += v.warnings.length;
          }
        } catch(e) {}
      }
      /* Détecter doublons potentiels (même Name) */
      var name = f.properties && f.properties.Name;
      if (name) {
        if (seen[name]) result.warnings++;
        else seen[name] = true;
      }
    });
    return result;
  }

  /** Rafraîchit l'affichage des couches. */
  function refreshLayers() {
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('spatial');
  }

  /** Affiche les informations détaillées d'une couche dans un modal. */
  function showLayerInfo(layerKey) {
    var layers = getLayerInfo();
    var l = null;
    for (var i = 0; i < layers.length; i++) { if (layers[i].key === layerKey) { l = layers[i]; break; } }
    if (!l) return;
    var html = '<div class="modal-admin-overlay" id="modal-layer-info" onclick="if(event.target.id===\'modal-layer-info\')SpatialModule.closeModal(\'modal-layer-info\')">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h2><i class="fas ' + l.icon + '" style="color:var(--gold);margin-right:8px"></i>' + l.name + '</h2>'
      + '<button class="modal-admin-close" onclick="SpatialModule.closeModal(\'modal-layer-info\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">'
      + '<div class="detail-grid">'
      + '<div class="detail-item"><div class="detail-label">Type géométrique</div><div class="detail-value">' + l.geomType + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Nombre d\'entités</div><div class="detail-value">' + l.count + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Projection</div><div class="detail-value" style="font-family:monospace">' + l.projection + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Date de mise à jour</div><div class="detail-value">' + l.lastModified + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">État</div><div class="detail-value"><span class="status-badge ' + l.status + '">' + l.statusLabel + '</span></div></div>'
      + '<div class="detail-item"><div class="detail-label">Santé géométrique</div><div class="detail-value">' + l.health.errors + ' erreur(s), ' + l.health.warnings + ' avertissement(s)</div></div>'
      + '</div>';
    if (l.health.details.length > 0) {
      html += '<div style="margin-top:14px;padding:12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-3);max-height:160px;overflow-y:auto">'
        + '<strong>Détails :</strong><ul style="margin:6px 0 0 18px;padding:0">';
      l.health.details.slice(0, 20).forEach(function(d) { html += '<li>' + esc(d) + '</li>'; });
      if (l.health.details.length > 20) html += '<li>... et ' + (l.health.details.length - 20) + ' autre(s)</li>';
      html += '</ul></div>';
    }
    html += '</div><div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'modal-layer-info\')">Fermer</button>'
      + '<button class="btn-sm primary" onclick="SpatialModule.closeModal(\'modal-layer-info\');SpatialModule.validateLayerGeometry(\'' + l.key + '\')"><i class="fas fa-clipboard-check"></i> Vérification géométrique</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Lance une vérification géométrique complète et affiche le rapport. */
  function validateLayerGeometry(layerKey) {
    var layers = getLayerInfo();
    var l = null;
    for (var i = 0; i < layers.length; i++) { if (layers[i].key === layerKey) { l = layers[i]; break; } }
    if (!l) return;
    /* Recalculer la santé en temps réel */
    var data = l.varName ? window[l.varName] : (function() {
      if (typeof SIGPersistence !== 'undefined' && layerKey === 'pk') {
        return SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
      }
      return null;
    })();
    var health = computeLayerHealth(data, layerKey);
    var html = '<div class="modal-admin-overlay" id="modal-layer-validate" onclick="if(event.target.id===\'modal-layer-validate\')SpatialModule.closeModal(\'modal-layer-validate\')">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h2><i class="fas fa-clipboard-check" style="color:var(--gold);margin-right:8px"></i> Vérification géométrique — ' + l.name + '</h2>'
      + '<button class="modal-admin-close" onclick="SpatialModule.closeModal(\'modal-layer-validate\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">'
      + '<div style="text-align:center;padding:20px 0">'
      + '<div style="font-size:2.5rem;font-weight:700;color:' + (health.errors === 0 ? 'var(--green)' : 'var(--red)') + '">' + health.errors + '</div>'
      + '<div style="font-size:.85rem;color:var(--text-3)">erreur(s) géométrique(s)</div>'
      + '<div style="font-size:1.5rem;font-weight:600;color:var(--gold);margin-top:8px">' + health.warnings + '</div>'
      + '<div style="font-size:.85rem;color:var(--text-3)">avertissement(s)</div>'
      + '</div>';
    if (health.details.length === 0) {
      html += '<div style="padding:14px;background:var(--cream);border-radius:8px;text-align:center;color:var(--green)"><i class="fas fa-circle-check"></i> Aucun problème détecté sur les ' + l.count + ' entités.</div>';
    } else {
      html += '<div style="margin-top:14px;padding:12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-3);max-height:200px;overflow-y:auto"><strong>Détails :</strong><ul style="margin:6px 0 0 18px;padding:0">';
      health.details.forEach(function(d) { html += '<li>' + esc(d) + '</li>'; });
      html += '</ul></div>';
    }
    html += '</div><div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'modal-layer-validate\')">Fermer</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Export rapide d'une couche individuelle en GeoJSON. */
  function exportLayer(layerKey) {
    var layers = getLayerInfo();
    var l = null;
    for (var i = 0; i < layers.length; i++) { if (layers[i].key === layerKey) { l = layers[i]; break; } }
    if (!l) return;
    var data = l.varName ? window[l.varName] : null;
    if (!data && layerKey === 'pk' && typeof SIGPersistence !== 'undefined') {
      data = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
    }
    if (!data) { alert('Couche introuvable'); return; }
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/geo+json' });
    downloadBlob(blob, l.name.replace(/\s/g, '_') + '.geojson');
  }

  /* ===================================================================
   * IMPORT SYSTEM
   * =================================================================== */

  var _pendingImport = null; /* { fileName, features, errors, warnings } */

  function openImportDialog() {
    var html = '<div class="modal-header"><h2><i class="fas fa-file-import"></i> Importer des données spatiales</h2>'
      + '<button class="modal-close" onclick="SpatialModule.closeModal(\'spatial-import-modal\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-body">'
      + '<div style="border:2px dashed var(--cream-border);border-radius:16px;padding:40px;text-align:center;margin-bottom:20px;transition:all .3s;cursor:pointer" '
      + 'id="import-drop-zone" onclick="document.getElementById(\'import-file-input\').click()" '
      + 'ondragover="event.preventDefault();this.style.borderColor=\'var(--gold)\';this.style.background=\'var(--gold-pale)\'" '
      + 'ondragleave="this.style.borderColor=\'var(--cream-border)\';this.style.background=\'transparent\'" '
      + 'ondrop="event.preventDefault();this.style.borderColor=\'var(--cream-border)\';this.style.background=\'transparent\';SpatialModule.handleFileDrop(event)">'
      + '<i class="fas fa-cloud-arrow-up" style="font-size:2.5rem;color:var(--gold);margin-bottom:12px"></i>'
      + '<p style="font-weight:600;margin-bottom:4px">Glissez un fichier ici ou cliquez pour parcourir</p>'
      + '<p style="font-size:.82rem;color:var(--text-3)">Formats acceptés : .geojson, .json, .csv</p>'
      + '<input type="file" id="import-file-input" accept=".geojson,.json,.csv" style="display:none" onchange="SpatialModule.handleFileSelect(event)">'
      + '</div>'
      + '<div id="import-preview-area"></div>'
      + '</div>';
    showModal('spatial-import-modal', html, 'max-width:760px');
  }

  function handleFileDrop(e) {
    var files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
  }

  function handleFileSelect(e) {
    var files = e.target.files;
    if (files.length > 0) processFile(files[0]);
  }

  function processFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var previewArea = document.getElementById('import-preview-area');
    if (!previewArea) return;

    previewArea.innerHTML = '<div style="text-align:center;padding:30px"><div class="gp-spinner" style="margin:0 auto 14px"></div><p>Analyse du fichier...</p></div>';

    var reader = new FileReader();

    if (ext === 'geojson' || ext === 'json') {
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          var fc = normalizeToFeatureCollection(data);
          showImportPreview(fc, file.name, ext);
        } catch (err) {
          showImportError('Fichier GeoJSON invalide : ' + err.message);
        }
      };
      reader.readAsText(file);
    } else if (ext === 'csv') {
      reader.onload = function(e) {
        parseCSV(e.target.result, file.name);
      };
      reader.readAsText(file);
    } else {
      showImportError('Format non supporté : .' + ext + '. Formats acceptés : GeoJSON (.geojson, .json) et CSV (.csv)');
    }
  }

  /* ===== REPROJECT FEATURE COLLECTION ===== */
  function reprojectFeatures(fc, fromCRS, toCRS) {
    if (typeof ol === 'undefined' || !ol.proj || !ol.proj.transform) return;
    (fc.features || []).forEach(function(f) {
      if (!f.geometry || !f.geometry.coordinates) return;
      reprojectCoords(f.geometry.coordinates, f.geometry.type, fromCRS, toCRS);
    });
  }

  function reprojectCoords(coords, geomType, fromCRS, toCRS) {
    if (geomType === 'Point') {
      var reproj = ol.proj.transform(coords, fromCRS, toCRS);
      coords[0] = reproj[0];
      coords[1] = reproj[1];
    } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
      coords.forEach(function(c) {
        var r = ol.proj.transform(c, fromCRS, toCRS);
        c[0] = r[0]; c[1] = r[1];
      });
    } else if (geomType === 'Polygon' || geomType === 'MultiLineString') {
      coords.forEach(function(ring) {
        ring.forEach(function(c) {
          var r = ol.proj.transform(c, fromCRS, toCRS);
          c[0] = r[0]; c[1] = r[1];
        });
      });
    } else if (geomType === 'MultiPolygon') {
      coords.forEach(function(poly) {
        poly.forEach(function(ring) {
          ring.forEach(function(c) {
            var r = ol.proj.transform(c, fromCRS, toCRS);
            c[0] = r[0]; c[1] = r[1];
          });
        });
      });
    }
  }

  function parseCSV(text, fileName) {
    var lines = text.trim().split('\n');
    if (lines.length < 2) {
      showImportError('Le fichier CSV est vide ou ne contient pas assez de lignes.');
      return;
    }

    var headers = lines[0].split(/[,;\t]/).map(function(h) { return h.trim().replace(/^"|"$/g, ''); });

    /* Auto-detect coordinate columns using pattern matching */
    var detected = detectCoordColumns(headers);

    if (!detected) {
      /* Show manual column mapping assistant */
      showCSVColumnMapper(headers, text, fileName);
      return;
    }

    buildCSVFeatures(headers, lines, detected, fileName);
  }

  /* ===== CSV MANUAL COLUMN MAPPER ===== */
  function showCSVColumnMapper(headers, csvText, fileName) {
    var area = document.getElementById('import-preview-area');
    if (!area) return;

    var h = '<div style="background:rgba(184,92,56,.08);border:1px solid rgba(184,92,56,.2);border-radius:12px;padding:16px;margin-bottom:16px">'
      + '<h4 style="color:var(--gold-dark);margin-bottom:8px"><i class="fas fa-columns"></i> Colonnes de coordonnées non détectées automatiquement</h4>'
      + '<p style="font-size:.82rem;color:var(--text-2);margin-bottom:12px">Sélectionnez manuellement les colonnes contenant la latitude (Y) et la longitude (X) :</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '<div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Latitude / Y / Northing</label>'
      + '<select id="csv-map-lat" style="width:100%;padding:8px 10px;border:1.5px solid var(--cream-border);border-radius:8px;font-family:Outfit,sans-serif;font-size:.85rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="-1">— Choisir —</option>';
    headers.forEach(function(hdr, idx) {
      h += '<option value="' + idx + '">' + esc(hdr) + '</option>';
    });
    h += '</select></div>'
      + '<div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Longitude / X / Easting</label>'
      + '<select id="csv-map-lon" style="width:100%;padding:8px 10px;border:1.5px solid var(--cream-border);border-radius:8px;font-family:Outfit,sans-serif;font-size:.85rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="-1">— Choisir —</option>';
    headers.forEach(function(hdr, idx) {
      h += '<option value="' + idx + '">' + esc(hdr) + '</option>';
    });
    h += '</select></div></div>'
      + '<div style="margin-top:12px"><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Système de coordonnées (CRS)</label>'
      + '<select id="csv-map-crs" style="width:100%;padding:8px 10px;border:1.5px solid var(--cream-border);border-radius:8px;font-family:Outfit,sans-serif;font-size:.85rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="EPSG:4326">WGS 84 (lat/lon géographiques)</option>'
      + '<option value="EPSG:32630">UTM Zone 30N</option>'
      + '<option value="EPSG:32631">UTM Zone 31N (Togo)</option>'
      + '<option value="EPSG:32632">UTM Zone 32N</option>'
      + '</select></div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'spatial-import-modal\')"><i class="fas fa-times"></i> Annuler</button>'
      + '<button class="btn-sm primary" onclick="SpatialModule.confirmCSVMapping()"><i class="fas fa-check"></i> Appliquer et continuer</button>'
      + '</div></div>';

    area.innerHTML = h;

    /* Store the CSV data for later use when user confirms mapping */
    _pendingCSVData = { headers: headers, lines: csvText.trim().split('\n'), fileName: fileName };
  }

  var _pendingCSVData = null;

  function confirmCSVMapping() {
    if (!_pendingCSVData) return;

    var latIdx = parseInt(document.getElementById('csv-map-lat').value);
    var lonIdx = parseInt(document.getElementById('csv-map-lon').value);
    var crs = document.getElementById('csv-map-crs').value;

    if (latIdx < 0 || lonIdx < 0 || latIdx === lonIdx) {
      showImportError('Veuillez sélectionner deux colonnes différentes pour la latitude et la longitude.');
      return;
    }

    var detected = {
      latIdx: latIdx,
      lonIdx: lonIdx,
      crs: crs,
      latHeader: _pendingCSVData.headers[latIdx],
      lonHeader: _pendingCSVData.headers[lonIdx]
    };

    buildCSVFeatures(_pendingCSVData.headers, _pendingCSVData.lines, detected, _pendingCSVData.fileName);
    _pendingCSVData = null;
  }

  /* ===== BUILD CSV FEATURES (shared by auto-detect and manual mapping) ===== */
  function buildCSVFeatures(headers, lines, detected, fileName) {
    var latIdx = detected.latIdx;
    var lonIdx = detected.lonIdx;
    var srcCRS = detected.crs;
    var needReproject = (srcCRS !== 'EPSG:4326');
    var errors = [];
    var warnings = [];
    var features = [];

    if (needReproject) {
      warnings.push('Données en ' + (CRS_LABELS[srcCRS] || srcCRS) + ' — reprojection automatique vers WGS 84 (EPSG:4326).');
    }

    for (var i = 1; i < lines.length; i++) {
      var vals = lines[i].split(/[,;\t]/).map(function(v) { return v.trim().replace(/^"|"$/g, ''); });
      var latVal = parseFloat(vals[latIdx]);
      var lonVal = parseFloat(vals[lonIdx]);

      if (isNaN(latVal) || isNaN(lonVal)) {
        errors.push('Ligne ' + (i + 1) + ' : coordonnées invalides (' + vals[latIdx] + ', ' + vals[lonIdx] + ')');
        continue;
      }

      var lon, lat;
      if (needReproject) {
        /* Use universal reprojection engine */
        var reproj = reprojectToWGS84(lonVal, latVal, srcCRS);
        lon = reproj[0];
        lat = reproj[1];
      } else {
        lon = lonVal;
        lat = latVal;
        /* Validate geographic ranges */
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          /* Possibly UTM data mis-detected as WGS84 — try UTM reproj */
          if (isUTMCoord(lonVal, latVal)) {
            var reproj2 = reprojectToWGS84(lonVal, latVal, 'EPSG:32631');
            lon = reproj2[0];
            lat = reproj2[1];
            warnings.push('Ligne ' + (i + 1) + ' : coordonnées hors plage géographique, reprojection UTM 31N appliquée.');
            srcCRS = 'EPSG:32631';
          } else {
            errors.push('Ligne ' + (i + 1) + ' : coordonnées hors plage (' + vals[latIdx] + ', ' + vals[lonIdx] + ')');
            continue;
          }
        }
      }

      var props = {};
      headers.forEach(function(h, j) {
        if (j !== latIdx && j !== lonIdx) props[h] = vals[j] || '';
      });

      features.push({
        type: 'Feature',
        id: 'import_' + i,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: props
      });
    }

    /* If we have enough points and destination supports lines, also create a LineString */
    var allErrors = errors.concat(warnings);
    var fc = { type: 'FeatureCollection', features: features };

    showImportPreview(fc, fileName, 'csv', allErrors, srcCRS);
  }

  function normalizeToFeatureCollection(data) {
    if (data.type === 'FeatureCollection') return data;
    if (data.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
    if (data.type && data.coordinates) {
      return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: data, properties: {} }] };
    }
    if (Array.isArray(data)) {
      return { type: 'FeatureCollection', features: data.map(function(f, i) {
        if (f.type === 'Feature') return f;
        if (f.type && f.coordinates) return { type: 'Feature', id: 'import_' + i, geometry: f, properties: {} };
        return null;
      }).filter(Boolean) };
    }
    return { type: 'FeatureCollection', features: [] };
  }

  /* ===== IMPORT PREVIEW ===== */
  function showImportPreview(fc, fileName, format, parseErrors, sourceCRS) {
    parseErrors = parseErrors || [];
    sourceCRS = sourceCRS || 'EPSG:4326';
    var features = fc.features || [];
    var geomTypes = {};
    var bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

    features.forEach(function(f) {
      if (!f.geometry) return;
      var gt = f.geometry.type;
      geomTypes[gt] = (geomTypes[gt] || 0) + 1;
      extractBBox(f.geometry, bbox);
    });

    if (bbox.minX === Infinity) bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    /* Determine compatible destination layers */
    var primaryGeomType = Object.keys(geomTypes).sort(function(a, b) { return geomTypes[b] - geomTypes[a]; })[0] || '';
    var compatibleLayers = DESTINATION_LAYERS.filter(function(l) {
      return l.geomTypes.some(function(g) { return primaryGeomType.indexOf(g) >= 0 || g.indexOf(primaryGeomType) >= 0; });
    });
    if (compatibleLayers.length === 0) compatibleLayers = DESTINATION_LAYERS; /* Allow all as fallback */

    _pendingImport = { fileName: fileName, features: features, format: format, errors: parseErrors };

    /* Build CRS display string */
    var crsDisplay = (CRS_LABELS[sourceCRS] || sourceCRS);
    if (sourceCRS !== 'EPSG:4326') {
      crsDisplay += ' <i class="fas fa-arrow-right" style="font-size:.7rem;margin:0 4px;color:var(--text-3)"></i> WGS 84 (EPSG:4326)';
    } else {
      crsDisplay += ' (WGS 84)';
    }

    var html = '<div style="background:var(--gold-pale);border:1px solid var(--gold);border-radius:12px;padding:16px;margin-bottom:20px">'
      + '<h4 style="margin-bottom:10px;color:var(--gold-dark)"><i class="fas fa-eye"></i> Aperçu de l\'import</h4>'
      + '<div class="grid-2" style="gap:8px">'
      + previewStat('Fichier', esc(fileName))
      + previewStat('Format', format.toUpperCase())
      + previewStat('Entités', features.length + '')
      + previewStat('Géométries', Object.keys(geomTypes).map(function(g) { return g + ' (' + geomTypes[g] + ')'; }).join(', ') || 'Aucune')
      + previewStat('Projection détectée', crsDisplay)
      + previewStat('Étendue', bbox.minX.toFixed(4) + ', ' + bbox.minY.toFixed(4) + ' → ' + bbox.maxX.toFixed(4) + ', ' + bbox.maxY.toFixed(4))
      + '</div></div>';

    /* Errors */
    if (parseErrors.length > 0) {
      html += '<div style="background:var(--red-light,#f8f0eb);border:1px solid rgba(184,92,56,.2);border-radius:12px;padding:16px;margin-bottom:20px">'
        + '<h4 style="color:var(--red);margin-bottom:8px"><i class="fas fa-exclamation-triangle"></i> ' + parseErrors.length + ' avertissement(s)</h4>'
        + '<ul style="max-height:120px;overflow-y:auto;font-size:.82rem;color:var(--text-2)">';
      parseErrors.forEach(function(e) { html += '<li>' + esc(e) + '</li>'; });
      html += '</ul></div>';
    }

    /* Destination layer selection */
    html += '<div style="margin-bottom:20px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:8px">Couche de destination</label>'
      + '<select id="import-destination" style="width:100%;padding:10px 14px;border:1.5px solid var(--cream-border);border-radius:10px;font-family:Outfit,sans-serif;font-size:.9rem;background:var(--white);color:var(--text);outline:none">';
    compatibleLayers.forEach(function(l) {
      html += '<option value="' + l.key + '">' + l.label + ' (' + l.geomTypes.join(', ') + ')</option>';
    });
    html += '</select></div>';

    /* Action buttons */
    html += '<div style="display:flex;gap:10px;justify-content:flex-end">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'spatial-import-modal\')"><i class="fas fa-times"></i> Annuler</button>'
      + '<button class="btn-sm primary" onclick="SpatialModule.confirmImport()"><i class="fas fa-check"></i> Confirmer l\'import (' + features.length + ' entités)</button>'
      + '</div>';

    var area = document.getElementById('import-preview-area');
    if (area) area.innerHTML = html;
  }

  function previewStat(label, value) {
    return '<div style="padding:6px 0"><div style="font-size:.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px">' + label + '</div>'
      + '<div style="font-weight:600;font-size:.88rem">' + value + '</div></div>';
  }

  function showImportError(msg) {
    var area = document.getElementById('import-preview-area');
    if (area) {
      area.innerHTML = '<div style="background:rgba(184,92,56,.08);border:1px solid rgba(184,92,56,.2);border-radius:12px;padding:20px;text-align:center">'
        + '<i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--red);margin-bottom:8px"></i>'
        + '<p style="color:var(--red);font-weight:500">' + esc(msg) + '</p></div>';
    }
  }

  function normalizePKImportFeature(feature, idx, timestamp) {
    var geom = feature.geometry || {};
    var start = [0, 0];
    var end = [0, 0];

    if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      start = [parseFloat(geom.coordinates[0]) || 0, parseFloat(geom.coordinates[1]) || 0];
      end = start.slice();
    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
      start = [parseFloat(geom.coordinates[0][0]) || 0, parseFloat(geom.coordinates[0][1]) || 0];
      end = [parseFloat(geom.coordinates[geom.coordinates.length - 1][0]) || 0, parseFloat(geom.coordinates[geom.coordinates.length - 1][1]) || 0];
    }

    var props = Object.assign({}, feature.properties || {});
    return {
      type: 'Feature',
      id: feature.id || ('pk_import_' + Date.now() + '_' + idx),
      geometry: { type: 'LineString', coordinates: [start, end] },
      properties: Object.assign({}, props, {
        numero: props.numero || props.Numero || props.Name || ('PK import ' + (idx + 1)),
        route: props.route || props.Route || props.Name || 'Non associée',
        PK_DEB_X: start[0],
        PK_DEB_Y: start[1],
        PK_FIN_X: end[0],
        PK_FIN_Y: end[1],
        source: 'import',
        createdAt: timestamp,
        lastModified: timestamp,
        modifiedBy: 'Import spatial'
      })
    };
  }

  function confirmImport() {
    if (!_pendingImport || !_pendingImport.features.length) return;

    var destKey = document.getElementById('import-destination');
    if (!destKey) return;
    var destination = destKey.value;

    var imported = 0;
    var now = new Date().toISOString();
    var pkCollection = null;

    _pendingImport.features.forEach(function(f, idx) {
      if (!f.properties) f.properties = {};
      f.properties.importedAt = now;
      f.properties.importSource = _pendingImport.fileName;
      f.id = f.id || ('import_' + Date.now() + '_' + idx);

      if (destination === 'routes' && typeof SIGDataEngine !== 'undefined') {
        try {
          SIGDataEngine.addFeature({
            geometry: f.geometry,
            properties: f.properties
          });
          imported++;
        } catch (err) {}
      } else if (destination === 'routes' && typeof json_Rseauroutier_6 !== 'undefined') {
        json_Rseauroutier_6.features.push(f);
        imported++;
      } else if (destination === 'emprises' && typeof json_Emprise_5 !== 'undefined') {
        json_Emprise_5.features.push(f);
        imported++;
      } else if (destination === 'pk' && typeof SIGPersistence !== 'undefined') {
        if (!pkCollection) {
          pkCollection = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK) || { type: 'FeatureCollection', features: [] };
        }
        pkCollection.features.push(normalizePKImportFeature(f, idx, now));
        imported++;
      } else if (typeof SIGPersistence !== 'undefined') {
        var existing = SIGPersistence.loadLayer('layers.' + destination);
        if (!existing) existing = { type: 'FeatureCollection', features: [] };
        existing.features.push(f);
        SIGPersistence.saveLayer('layers.' + destination, existing);
        imported++;
      }
    });

    if (pkCollection && typeof SIGPersistence !== 'undefined') {
      SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, pkCollection);
      window.json_PK = pkCollection;
    }

    /* Refresh OL layer on map */
    if (destination === 'routes' && typeof lyr_Rseauroutier_6 !== 'undefined') {
      var fmt = new ol.format.GeoJSON();
      var newFeatures = fmt.readFeatures(json_Rseauroutier_6, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      lyr_Rseauroutier_6.getSource().clear();
      lyr_Rseauroutier_6.getSource().addFeatures(newFeatures);
    } else if (destination === 'emprises' && typeof lyr_Emprise_5 !== 'undefined') {
      var fmt2 = new ol.format.GeoJSON();
      var newFeatures2 = fmt2.readFeatures(json_Emprise_5, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      lyr_Emprise_5.getSource().clear();
      lyr_Emprise_5.getSource().addFeatures(newFeatures2);
    }

    /* Refresh pk layers if imported via persistence */
    if (destination === 'pk' && typeof SIGMapLayers !== 'undefined' && typeof SIGMapLayers.reloadPK === 'function') {
      SIGMapLayers.reloadPK();
    }
    if (destination === 'routes' && typeof RoadSync !== 'undefined') {
      RoadSync.propagate('created', { fullReload: true, featureId: null });
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.IMPORT, {
        details: 'Import de ' + imported + ' entités depuis ' + _pendingImport.fileName + ' vers ' + destination,
        after: { format: _pendingImport.format, destination: destination, count: imported },
        result: imported > 0 ? 'SUCCESS' : 'FAILURE'
      });
    }

    /* EventBus */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_CREATED, {
        source: 'import',
        fileName: _pendingImport.fileName,
        destination: destination,
        layer: destination,
        count: imported
      });
      SIGEventBus.emit(SIGEventBus.EVENTS.DASHBOARD_REFRESH, {});
    }

    /* Persistence sync */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.syncFromMemory();
    }

    closeModal('spatial-import-modal');
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.add('import', 'Import terminÃ©', imported + ' entitÃ©(s) importÃ©e(s) vers ' + destination);
    }
    _pendingImport = null;

    /* Refresh the spatial page */
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('spatial');
  }

  /* ===================================================================
   * EXPORT SYSTEM
   * =================================================================== */

  function openExportDialog() {
    var html = '<div class="modal-header"><h2><i class="fas fa-file-export"></i> Exporter les données</h2>'
      + '<button class="modal-close" onclick="SpatialModule.closeModal(\'spatial-export-modal\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-body">';

    /* Layer selection */
    html += '<div style="margin-bottom:20px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:8px">Couche à exporter</label>'
      + '<select id="export-layer-select" style="width:100%;padding:10px 14px;border:1.5px solid var(--cream-border);border-radius:10px;font-family:Outfit,sans-serif;font-size:.9rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="Rseauroutier_6">Réseau routier</option>'
      + '<option value="Emprise_5">Emprises</option>'
      + '<option value="Rgion_2">Régions</option>'
      + '<option value="Prfecture_3">Préfectures</option>'
      + '<option value="Canton_4">Cantons</option>';

    /* Add PK from persistence if available */
    if (typeof SIGPersistence !== 'undefined') {
      if (SIGPersistence.loadLayer('layers.pk')) html += '<option value="pk_persistence">Points kilométriques</option>';
    }
    html += '</select></div>';

    /* Export format options */
    html += '<div style="margin-bottom:20px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:10px">Format d\'export</label>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">';

    html += exportFormatCard('geojson', 'fa-code', 'GeoJSON', 'Format standard SIG');
    html += exportFormatCard('csv', 'fa-table', 'CSV', 'Tableur');
    html += exportFormatCard('pdf', 'fa-file-pdf', 'PDF', 'Fiche récapitulative');
    html += exportFormatCard('excel', 'fa-file-excel', 'Excel', 'Classeur .xlsx');

    html += '</div></div>';
    html += '</div>';
    showModal('spatial-export-modal', html, 'max-width:640px');
  }

  function exportFormatCard(format, icon, title, desc) {
    return '<div class="export-card" onclick="SpatialModule.executeExport(\'' + format + '\')" style="padding:16px;border:1.5px solid var(--cream-border);border-radius:12px;cursor:pointer;text-align:center;transition:all .3s">'
      + '<i class="fas ' + icon + '" style="font-size:1.3rem;color:var(--gold);margin-bottom:8px"></i>'
      + '<div style="font-weight:600;font-size:.85rem;margin-bottom:2px">' + title + '</div>'
      + '<div style="font-size:.75rem;color:var(--text-3)">' + desc + '</div></div>';
  }

  function getExportData() {
    var select = document.getElementById('export-layer-select');
    if (!select) return null;
    var val = select.value;

    if (val === 'pk_persistence' && typeof SIGPersistence !== 'undefined') {
      return { data: SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK), name: 'points_kilometriques' };
    }
    var varMap = {
      'Rseauroutier_6': { varName: 'json_Rseauroutier_6', name: 'reseau_routier' },
      'Emprise_5': { varName: 'json_Emprise_5', name: 'emprises' },
      'Rgion_2': { varName: 'json_Rgion_2', name: 'regions' },
      'Prfecture_3': { varName: 'json_Prfecture_3', name: 'prefectures' },
      'Canton_4': { varName: 'json_Canton_4', name: 'cantons' }
    };
    var cfg = varMap[val];
    if (!cfg) return null;
    return { data: window[cfg.varName], name: cfg.name };
  }

  function executeExport(format) {
    var exportInfo = getExportData();
    if (!exportInfo || !exportInfo.data) {
      alert('Aucune donnée à exporter pour cette couche.');
      return;
    }

    switch (format) {
      case 'geojson': exportGeoJSON(exportInfo); break;
      case 'csv': exportCSV(exportInfo); break;
      case 'pdf': exportPDF(exportInfo); break;
      case 'excel': exportExcel(exportInfo); break;
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.EXPORT, {
        details: 'Export ' + format.toUpperCase() + ' — ' + exportInfo.name + ' (' + (exportInfo.data.features || []).length + ' entités)',
        after: { format: format, layer: exportInfo.name }
      });
    }
  }

  function downloadBlob(blob, filename) {
    if (typeof GeoROADDownload !== 'undefined' && typeof GeoROADDownload.downloadBlob === 'function') {
      GeoROADDownload.downloadBlob(blob, filename);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function() {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }

  function exportGeoJSON(info) {
    var json = JSON.stringify(info.data, null, 2);
    var blob = new Blob([json], { type: 'application/geo+json' });
    downloadBlob(blob, info.name + '.geojson');
    closeModal('spatial-export-modal');
    if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'Données exportées en GeoJSON', info.name + ' (' + (info.data.features || []).length + ' entités)');
  }

  function exportCSV(info) {
    var features = info.data.features || [];
    if (features.length === 0) { alert('Aucune donnée à exporter.'); return; }

    /* Collect all property keys */
    var allKeys = [];
    features.forEach(function(f) {
      if (f.properties) {
        Object.keys(f.properties).forEach(function(k) {
          if (allKeys.indexOf(k) === -1) allKeys.push(k);
        });
      }
    });

    var lines = [allKeys.join(',')];
    features.forEach(function(f) {
      var row = allKeys.map(function(k) {
        var v = (f.properties && f.properties[k]) || '';
        v = String(v).replace(/"/g, '""');
        return '"' + v + '"';
      });
      lines.push(row.join(','));
    });

    /* Add geometry column */
    lines[0] += ',geometry_wkt';
    for (var i = 1; i < lines.length; i++) {
      var f = features[i - 1];
      lines[i] += ',"' + (f.geometry ? geometryToWKT(f.geometry) : '') + '"';
    }

    var csv = lines.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, info.name + '.csv');
    closeModal('spatial-export-modal');
    if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'Données exportées en CSV', info.name + ' (' + features.length + ' entités)');
  }

  function geometryToWKT(geom) {
    if (!geom) return '';
    switch (geom.type) {
      case 'Point': return 'POINT(' + geom.coordinates[0] + ' ' + geom.coordinates[1] + ')';
      case 'LineString': return 'LINESTRING(' + geom.coordinates.map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + ')';
      case 'Polygon': return 'POLYGON((' + geom.coordinates[0].map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + '))';
      case 'MultiLineString':
        return 'MULTILINESTRING(' + geom.coordinates.map(function(ring) { return '(' + ring.map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + ')'; }).join(',') + ')';
      case 'MultiPolygon':
        return 'MULTIPOLYGON(' + geom.coordinates.map(function(poly) { return '((' + poly[0].map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + '))'; }).join(',') + ')';
      default: return geom.type;
    }
  }

  function exportShapefile(info) {
    /* Convert GeoJSON to ESRI Shapefile format using shp.js write */
    if (typeof shp !== 'undefined' && shp.writeFile) {
      try {
        var geojson = info.data;
        /* shp.writeFile returns a ZIP blob */
        shp.writeFile(geojson).then(function(blob) {
          downloadBlob(blob, info.name + '.zip');
          closeModal('spatial-export-modal');
          if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'Données exportées en Shapefile', info.name + '.zip');
        }).catch(function(err) {
          alert('Erreur lors de la génération du Shapefile : ' + (err.message || err));
        });
      } catch (e) {
        /* Fallback: export as GeoJSON and notify */
        alert('Export Shapefile non disponible. Un fichier GeoJSON sera exporté à la place.');
        exportGeoJSON(info);
      }
    } else {
      alert('La bibliothèque shp.js n\'est pas chargée. Export en GeoJSON à la place.');
      exportGeoJSON(info);
    }
  }

  function exportPDF(info) {
    if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
      try {
        var doc = new jspdf.jsPDF('landscape', 'mm', 'a4');
        var features = info.data.features || [];

        /* Header */
        doc.setFontSize(18);
        doc.text('GeoROAD TOGO — Export de données', 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Couche : ' + info.name + ' | ' + features.length + ' entités | ' + new Date().toLocaleString('fr-FR'), 14, 28);
        doc.setTextColor(0);

        /* Collect property keys */
        var allKeys = [];
        features.forEach(function(f) {
          if (f.properties) Object.keys(f.properties).forEach(function(k) {
            if (allKeys.indexOf(k) === -1) allKeys.push(k);
          });
        });
        /* Limit to 12 columns for readability */
        var cols = allKeys.slice(0, 12);

        if (typeof doc.autoTable !== 'undefined') {
          var body = features.slice(0, 100).map(function(f) {
            return cols.map(function(k) {
              var v = (f.properties && f.properties[k]) || '—';
              return String(v).substring(0, 40);
            });
          });

          doc.autoTable({
            head: [cols],
            body: body,
            startY: 34,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [200, 166, 75] },
            alternateRowStyles: { fillColor: [248, 246, 240] }
          });
        } else {
          /* Fallback: simple text table */
          doc.setFontSize(8);
          var y = 38;
          cols.forEach(function(k) { doc.text(k.substring(0, 15), 14 + cols.indexOf(k) * 22, y); });
          y += 5;
          features.slice(0, 50).forEach(function(f) {
            if (y > 190) { doc.addPage(); y = 20; }
            cols.forEach(function(k, i) {
              var v = String((f.properties && f.properties[k]) || '—').substring(0, 15);
              doc.text(v, 14 + i * 22, y);
            });
            y += 5;
          });
        }

        /* Footer */
        var pageCount = doc.internal.getNumberOfPages();
        for (var p = 1; p <= pageCount; p++) {
          doc.setPage(p);
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text('GeoROAD TOGO — Ministère des Travaux Publics — Page ' + p + '/' + pageCount, 14, 200);
        }

        doc.save(info.name + '.pdf');
        closeModal('spatial-export-modal');
        if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'Données exportées en PDF', info.name + ' (' + features.length + ' entités)');
      } catch (e) {
        alert('Erreur lors de la génération du PDF : ' + e.message);
      }
    } else {
      alert('La bibliothèque jsPDF n\'est pas chargée.');
    }
  }

  function exportExcel(info) {
    if (typeof XLSX !== 'undefined') {
      try {
        var features = info.data.features || [];
        if (features.length === 0) { alert('Aucune donnée à exporter.'); return; }

        /* Build worksheet data */
        var allKeys = [];
        features.forEach(function(f) {
          if (f.properties) Object.keys(f.properties).forEach(function(k) {
            if (allKeys.indexOf(k) === -1) allKeys.push(k);
          });
        });

        var wsData = [allKeys];
        features.forEach(function(f) {
          var row = allKeys.map(function(k) { return (f.properties && f.properties[k]) || ''; });
          wsData.push(row);
        });

        var ws = XLSX.utils.aoa_to_sheet(wsData);

        /* Column widths */
        ws['!cols'] = allKeys.map(function(k) { return { wch: Math.max(k.length + 2, 12) }; });

        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, info.name.substring(0, 31));
        XLSX.writeFile(wb, info.name + '.xlsx');
        closeModal('spatial-export-modal');
        if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'Données exportées en Excel', info.name + ' (' + features.length + ' entités)');
      } catch (e) {
        alert('Erreur lors de la génération Excel : ' + e.message);
      }
    } else {
      alert('La bibliothèque XLSX n\'est pas chargée.');
    }
  }

  /* ===== BBOX EXTRACTION ===== */
  function extractBBox(geom, bbox) {
    if (!geom || !geom.coordinates) return;
    function processCoord(c) {
      if (c[0] < bbox.minX) bbox.minX = c[0];
      if (c[1] < bbox.minY) bbox.minY = c[1];
      if (c[0] > bbox.maxX) bbox.maxX = c[0];
      if (c[1] > bbox.maxY) bbox.maxY = c[1];
    }
    switch (geom.type) {
      case 'Point': processCoord(geom.coordinates); break;
      case 'LineString': case 'MultiPoint':
        geom.coordinates.forEach(processCoord); break;
      case 'Polygon': case 'MultiLineString':
        geom.coordinates.forEach(function(ring) { ring.forEach(processCoord); }); break;
      case 'MultiPolygon':
        geom.coordinates.forEach(function(poly) { poly.forEach(function(ring) { ring.forEach(processCoord); }); }); break;
    }
  }

  /* ===== MODAL HELPERS ===== */
  function showModal(id, content, style) {
    /* Remove existing if any */
    var existing = document.getElementById(id);
    if (existing) existing.parentNode.removeChild(existing);

    var div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = id;
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:20px;';
    div.innerHTML = '<div class="modal-content" style="background:var(--white);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);width:100%;max-height:90vh;overflow-y:auto;' + (style || '') + '">'
      + content + '</div>';
    div.addEventListener('click', function(e) { if (e.target === div) closeModal(id); });
    document.body.appendChild(div);
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render,
    openImportDialog: openImportDialog,
    openExportDialog: openExportDialog,
    handleFileDrop: handleFileDrop,
    handleFileSelect: handleFileSelect,
    confirmImport: confirmImport,
    confirmCSVMapping: confirmCSVMapping,
    executeExport: executeExport,
    closeModal: closeModal,
    /* Nouvelles fonctions PHASE 6 */
    refreshLayers: refreshLayers,
    showLayerInfo: showLayerInfo,
    validateLayerGeometry: validateLayerGeometry,
    exportLayer: exportLayer
  };
})();
