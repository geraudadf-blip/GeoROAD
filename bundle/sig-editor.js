/* ===================================================================
 * GeoROAD TOGO — Bundle sig-editor
 * Auto-généré par build_bundles.py — NE PAS ÉDITER MANUELLEMENT
 * Source : sig-map-layers.js, admin-hierarchy.js, road-validator.js, road-attributes.js, road-sync.js, road-drawing.js, road-geometry-editor-pro.js, geoportail-sig.js
 * ===================================================================
 */


/* ===== sig-map-layers.js ===== */

/* ===================================================================
 * GeoROAD TOGO — SIG Map Layers (V5.0)
 *
 * Affiche la couche PK sur la carte géoportail.
 * Se charge après geoportail.js et les modules SIG Core.
 *
 * Dépend : OpenLayers (ol), map (geoportail.js),
 *           SIGPersistence, json_Rseauroutier_6
 * =================================================================== */
var SIGMapLayers = (function() {
  'use strict';

  /* ===== COUCHES OL ===== */
  var pkSource = null;
  var pkLayer = null;

  /* ===== STYLES ===== */
  var PK_STYLE = new ol.style.Style({
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({ color: '#2ed573' }),
      stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
    }),
    text: new ol.style.Text({
      font: '11px Outfit, sans-serif',
      fill: new ol.style.Fill({ color: '#fff' }),
      stroke: new ol.style.Stroke({ color: '#000', width: 3 }),
      offsetY: -16
    })
  });

  /* ===== INITIALISATION ===== */

  function init() {
    if (typeof map === 'undefined') return;

    /* En mode public (pas de mode édition), ne pas afficher la couche PK */
    var isEditMode = false;
    if (typeof SIGModule !== 'undefined') {
      try { isEditMode = SIGModule.getState() && SIGModule.getState().editMode; } catch(e) {}
    }
    if (!isEditMode) return;

    /* Créer la couche PK */
    pkSource = new ol.source.Vector();
    pkLayer = new ol.layer.Vector({
      source: pkSource,
      style: function(feature) {
        var numero = feature.get('numero') || 'PK';
        var clone = PK_STYLE.clone();
        clone.getText().setText(numero);
        return clone;
      },
      visible: true,
      zIndex: 150
    });
    map.addLayer(pkLayer);

    /* Charger les données depuis la persistance */
    loadPKData();

    /* Ajouter les couches au sidebar toggle */
    addLayerToggles();

    /* Popup au clic sur PK */
    map.on('singleclick', onMapClick);
  }

  function loadPKData() {
    if (typeof SIGPersistence === 'undefined') return;
    var pkFC = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
    if (!pkFC || !pkFC.features) return;

    var format = new ol.format.GeoJSON();
    var features = format.readFeatures(pkFC, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326'
    });
    /* Copier les propriétés pour le style */
    features.forEach(function(f) {
      var props = f.getProperties();
      f.set('numero', props.numero || '');
    });
    pkSource.addFeatures(features);
  }

  /* Ajouter des toggles dans le sidebar pour PK */
  function addLayerToggles() {
    /* (fonction conservée pour compatibilité future — le toggle est inséré
       dynamiquement quand init() est appelé en mode édition) */
    var sigGroup = document.createElement('div');
    sigGroup.className = 'layer-group';
    sigGroup.innerHTML =
      '<div class="layer-group-title"><i class="fas fa-map-location-dot"></i> Données SIG</div>' +
      '<div class="layer-toggle">' +
        '<label class="lt-switch"><input type="checkbox" checked id="toggle-pk-layer"><span class="lt-slider"></span></label>' +
        '<span class="lt-name">Points kilométriques</span>' +
      '</div>';

    /* Insérer avant le dernier groupe (administratif) */
    var groups = document.querySelectorAll('#sidebar .layer-group');
    if (groups.length > 0) {
      groups[groups.length - 1].parentNode.insertBefore(sigGroup, groups[groups.length - 1]);
    }

    /* Event listeners */
    var pkToggle = document.getElementById('toggle-pk-layer');
    if (pkToggle) {
      pkToggle.addEventListener('change', function() {
        if (pkLayer) pkLayer.setVisible(this.checked);
      });
    }
  }

  /* Popup au clic */
  function onMapClick(evt) {
    /* En mode édition SIG, on laisse l'outil SIG gérer le clic — sauf si l'outil
       actif est 'select' auquel cas on autorise aussi le popup PK. */
    if (typeof SIGModule !== 'undefined') {
      var sigState = SIGModule.getState();
      if (sigState.editMode && sigState.activeTool && sigState.activeTool !== 'select') return;
    }

    var pixel = evt.pixel;
    var pkFeat = map.getFeaturesAtPixel(pixel, { layerFilter: function(l) { return l === pkLayer; } });

    if (pkFeat && pkFeat.length > 0) {
      showPKPopup(pkFeat[0], evt.coordinate);
    }
  }

  function showPKPopup(feature, coord) {
    var props = feature.getProperties();
    var html = '<div style="padding:12px;min-width:200px">' +
      '<h4 style="margin:0 0 8px;color:var(--gold-dark);font-size:.95rem"><i class="fas fa-map-pin" style="color:#2ed573;margin-right:6px"></i>' + escHtml(props.numero || 'PK') + '</h4>' +
      '<div style="font-size:.82rem;color:var(--text-2)">' +
      '<div><strong>Route :</strong> ' + escHtml(props.route || '—') + '</div>' +
      '<div><strong>Coordonnées :</strong> ' + (typeof props.coordX === 'number' ? props.coordX.toFixed(5) : (props.coordX || '—')) + ', ' + (typeof props.coordY === 'number' ? props.coordY.toFixed(5) : (props.coordY || '—')) + '</div>' +
      (props.altitude ? '<div><strong>Altitude :</strong> ' + props.altitude + ' m</div>' : '') +
      (props.pkDebut ? '<div><strong>PK Début :</strong> ' + escHtml(props.pkDebut) + '</div>' : '') +
      (props.pkFin ? '<div><strong>PK Fin :</strong> ' + escHtml(props.pkFin) + '</div>' : '') +
      (props.observations ? '<div style="margin-top:6px;color:var(--text-3)">' + escHtml(props.observations) + '</div>' : '') +
      '</div></div>';

    showMapPopup(html, coord);
  }

  /* Popup OL réutilisable */
  var _popupOverlay = null;
  var _popupEl = null;

  function showMapPopup(html, coord) {
    if (!_popupEl) {
      _popupEl = document.createElement('div');
      _popupEl.className = 'sig-map-popup';
      _popupEl.style.cssText = 'background:var(--bg-1,#0f0f0f);border:1px solid var(--border,#2a2a2a);border-radius:10px;color:var(--text,#e0e0e0);box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:320px;position:relative;z-index:500;pointer-events:auto';
      _popupEl.innerHTML = '<button onclick="SIGMapLayers.closePopup()" style="position:absolute;top:8px;right:10px;background:none;border:none;color:var(--text-3);cursor:pointer;font-size:1rem"><i class="fas fa-times"></i></button><div id="sig-map-popup-content"></div>';
      document.getElementById('map-container').appendChild(_popupEl);

      _popupOverlay = new ol.Overlay({
        element: _popupEl,
        offset: [0, -12],
        positioning: 'bottom-center',
        stopEvent: true
      });
      map.addOverlay(_popupOverlay);
    }

    document.getElementById('sig-map-popup-content').innerHTML = html;
    _popupOverlay.setPosition(coord);
  }

  function closePopup() {
    if (_popupOverlay) _popupOverlay.setPosition(undefined);
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ===== RECHARGEMENT DES COUCHES ===== */

  function reloadPK() {
    if (!pkSource) return;
    pkSource.clear();
    loadPKData();
  }

  /* ===== ZOOM VERS UN PK ===== */

  function zoomToPK(pkId) {
    if (!pkSource) return;
    var features = pkSource.getFeatures();
    for (var i = 0; i < features.length; i++) {
      if (String(features[i].getId()) === String(pkId) ||
          features[i].get('id') === pkId) {
        var coords = features[i].getGeometry().getCoordinates();
        map.getView().animate({
          center: coords,
          zoom: 17,
          duration: 600
        });
        showPKPopup(features[i], coords);
        return true;
      }
    }
    return false;
  }

  /* ===== INIT ===== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }

  /* Écouter les événements SIGEventBus pour recharger */
  if (typeof SIGEventBus !== 'undefined') {
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, function(data) {
      if (data && data.featureId && String(data.featureId).indexOf('pk_') === 0) reloadPK();
    });
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, function(data) {
      if (data && data.featureId && String(data.featureId).indexOf('pk_') === 0) reloadPK();
    });
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (data && data.featureId && String(data.featureId).indexOf('pk_') === 0) reloadPK();
    });
  }

  return {
    init: init,
    reloadPK: reloadPK,
    zoomToPK: zoomToPK,
    closePopup: closePopup
  };
})();

/* ===== admin-hierarchy.js ===== */

/* ===================================================================
 * GeoROAD TOGO — Hiérarchie Administrative du Togo
 *
 * Extrait les listes Région → Préfecture → Canton depuis les
 * couches GeoJSON chargées (json_Rgion_2, json_Prfecture_3, json_Canton_4).
 *
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Remplacer loadFromGeoJSON() par fetch('/api/admin/hierarchy')
 *   - Garder la même interface publique (getRegions, getPrefectures, etc.)
 *
 * Dépend : variables globales json_Rgion_2, json_Prfecture_3, json_Canton_4
 * =================================================================== */
var AdministrativeHierarchy = (function() {
  'use strict';

  /* ===== DONNÉES EN CACHE ===== */
  var _regions = [];
  var _prefectures = {};   /* { 'Centre': ['Blitta', 'Mô', ...], ... } */
  var _cantons = {};       /* { 'Blitta': ['Agbandi', 'Atchintse', ...], ... } */
  var _localites = {};     /* Réservé : futur chargement depuis PG */
  var _loaded = false;

  /* ===================================================================
   * CHARGEMENT
   * =================================================================== */

  /**
   * Extrait la hiérarchie depuis les variables GeoJSON globales.
   * Futur : remplacer par un appel fetch('/api/admin/hierarchy').
   */
  function loadFromGeoJSON() {
    if (_loaded) return;
    _regions = [];
    _prefectures = {};
    _cantons = {};

    /* Régions */
    if (typeof json_Rgion_2 !== 'undefined' && json_Rgion_2.features) {
      json_Rgion_2.features.forEach(function(f) {
        var name = (f.properties.NAME_1 || '').trim();
        if (name && _regions.indexOf(name) === -1) _regions.push(name);
      });
    }

    /* Préfectures groupées par région */
    if (typeof json_Prfecture_3 !== 'undefined' && json_Prfecture_3.features) {
      json_Prfecture_3.features.forEach(function(f) {
        var region = (f.properties.NAME_1 || '').trim();
        var pref = (f.properties.NAME_2 || '').trim();
        if (region && pref) {
          if (!_prefectures[region]) _prefectures[region] = [];
          if (_prefectures[region].indexOf(pref) === -1) _prefectures[region].push(pref);
        }
      });
    }

    /* Cantons groupés par préfecture */
    if (typeof json_Canton_4 !== 'undefined' && json_Canton_4.features) {
      json_Canton_4.features.forEach(function(f) {
        var pref = (f.properties.NAME_2 || '').trim();
        var canton = (f.properties.NAME_3 || '').trim();
        if (pref && canton) {
          if (!_cantons[pref]) _cantons[pref] = [];
          if (_cantons[pref].indexOf(canton) === -1) _cantons[pref].push(canton);
        }
      });
    }

    /* Trier alphabétiquement */
    _regions.sort();
    _regions.forEach(function(r) { if (_prefectures[r]) _prefectures[r].sort(); });
    Object.keys(_cantons).forEach(function(p) { _cantons[p].sort(); });

    _loaded = true;
  }

  /**
   * Charge la hiérarchie depuis une source distante (futur PostgreSQL).
   * @param {string} url - Endpoint API
   * @param {function} callback - function(hierarchy)
   */
  function loadFromAPI(url, callback) {
    /* Futur : fetch(url).then(r => r.json()).then(data => { ... }) */
    if (callback) callback(null);
  }

  /* ===================================================================
   * ACCESSEURS
   * =================================================================== */

  /** Retourne la liste de toutes les régions. */
  function getRegions() {
    loadFromGeoJSON();
    return _regions.slice();
  }

  /**
   * Retourne les préfectures d'une région donnée.
   * @param {string} region - Nom de la région
   * @returns {string[]} Liste des préfectures
   */
  function getPrefectures(region) {
    loadFromGeoJSON();
    return (_prefectures[region] || []).slice();
  }

  /**
   * Retourne les cantons d'une préfecture donnée.
   * @param {string} prefecture - Nom de la préfecture
   * @returns {string[]} Liste des cantons
   */
  function getCantons(prefecture) {
    loadFromGeoJSON();
    return (_cantons[prefecture] || []).slice();
  }

  /**
   * Retourne les localités d'un canton (réservé futur).
   * @param {string} canton
   * @returns {string[]}
   */
  function getLocalites(canton) {
    loadFromGeoJSON();
    return (_localites[canton] || []).slice();
  }

  /**
   * Vérifie si une préfecture appartient à une région.
   * @param {string} prefecture
   * @param {string} region
   * @returns {boolean}
   */
  function isPrefectureInRegion(prefecture, region) {
    var prefs = getPrefectures(region);
    return prefs.indexOf(prefecture) !== -1;
  }

  /**
   * Vérifie si un canton appartient à une préfecture.
   * @param {string} canton
   * @param {string} prefecture
   * @returns {boolean}
   */
  function isCantonInPrefecture(canton, prefecture) {
    var cantons = getCantons(prefecture);
    return cantons.indexOf(canton) !== -1;
  }

  /**
   * Génère un <select> HTML pour les régions.
   * @param {string} currentValue - Valeur sélectionnée
   * @param {string} nameAttr - Attribut name
   * @returns {string} HTML
   */
  function renderRegionSelect(currentValue, nameAttr) {
    nameAttr = nameAttr || 'REGIONS';
    var regions = getRegions();
    var html = '<select name="' + nameAttr + '" id="sig-hierarchy-region">';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    regions.forEach(function(r) {
      var sel = r === currentValue ? ' selected' : '';
      html += '<option value="' + esc(r) + '"' + sel + '>' + esc(r) + '</option>';
    });
    html += '</select>';
    return html;
  }

  /**
   * Génère un <select> HTML pour les préfectures filtrées par région.
   * @param {string} region - Région parente
   * @param {string} currentValue
   * @param {string} nameAttr
   * @returns {string} HTML
   */
  function renderPrefectureSelect(region, currentValue, nameAttr) {
    nameAttr = nameAttr || 'Prefecture';
    var prefs = getPrefectures(region);
    var html = '<select name="' + nameAttr + '" id="sig-hierarchy-prefecture"';
    if (!region) html += ' disabled';
    html += '>';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    prefs.forEach(function(p) {
      var sel = p === currentValue ? ' selected' : '';
      html += '<option value="' + esc(p) + '"' + sel + '>' + esc(p) + '</option>';
    });
    html += '</select>';
    return html;
  }

  /**
   * Génère un <select> HTML pour les cantons filtrés par préfecture.
   * @param {string} prefecture - Préfecture parente
   * @param {string} currentValue
   * @param {string} nameAttr
   * @returns {string} HTML
   */
  function renderCantonSelect(prefecture, currentValue, nameAttr) {
    nameAttr = nameAttr || 'Canton';
    var cantons = getCantons(prefecture);
    var html = '<select name="' + nameAttr + '" id="sig-hierarchy-canton"';
    if (!prefecture) html += ' disabled';
    html += '>';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    cantons.forEach(function(c) {
      var sel = c === currentValue ? ' selected' : '';
      html += '<option value="' + esc(c) + '"' + sel + '>' + esc(c) + '</option>';
    });
    html += '</select>';
    return html;
  }

  /* ===== HELPERS ===== */
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ===== API PUBLIQUE ===== */
  return {
    loadFromGeoJSON: loadFromGeoJSON,
    loadFromAPI: loadFromAPI,
    getRegions: getRegions,
    getPrefectures: getPrefectures,
    getCantons: getCantons,
    getLocalites: getLocalites,
    isPrefectureInRegion: isPrefectureInRegion,
    isCantonInPrefecture: isCantonInPrefecture,
    renderRegionSelect: renderRegionSelect,
    renderPrefectureSelect: renderPrefectureSelect,
    renderCantonSelect: renderCantonSelect
  };
})();

/* ===== road-validator.js ===== */

/* ===================================================================
 * GeoROAD TOGO — Module de Validation des Routes
 *
 * Vérifie les données d'une route avant enregistrement.
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Les vérifications de doublon utiliseront un futur
 *     SELECT COUNT(*) FROM routes WHERE name = $1
 *   - Les vérifications géométriques utiliseront ST_IsValid()
 *
 * Dépend : aucune (module autonome)
 * =================================================================== */
var RoadValidator = (function() {
  'use strict';

  /**
   * Valide l'ensemble des données d'une route avant enregistrement.
   * @param {Object} attrs - Propriétés de la route
   * @param {Object|null} geometry - Géométrie GeoJSON (peut être null en mode formulaire seul)
   * @param {Object} context - { allRoutes: Array, existingId: number|null }
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  function validate(attrs, geometry, context) {
    var errors = [];
    var warnings = [];

    /* --- GÉOMÉTRIE --- */
    if (geometry !== null && geometry !== undefined) {
      if (!geometry || !geometry.type) {
        errors.push('La g\u00e9om\u00e9trie est vide ou invalide.');
      } else {
        /* Vérifier les coordonnées */
        var coords = geometry.coordinates;
        if (geometry.type === 'LineString' && (!coords || coords.length < 2)) {
          errors.push('La polyligne doit contenir au moins 2 sommets.');
        } else if (geometry.type === 'MultiLineString') {
          var hasValidLine = false;
          if (coords && coords.length > 0) {
            for (var i = 0; i < coords.length; i++) {
              if (coords[i] && coords[i].length >= 2) { hasValidLine = true; break; }
            }
          }
          if (!hasValidLine) errors.push('La multiligne doit contenir au moins une ligne avec 2 sommets.');
        }

        /* Vérifier les coordonnées Togo (lon: ~0.0 à 1.8, lat: ~6.0 à 11.0) */
        var allCoords = extractAllCoords(geometry);
        for (var j = 0; j < allCoords.length; j++) {
          var c = allCoords[j];
          if (c[0] < -1 || c[0] > 3 || c[1] < 5 || c[1] > 12) {
            warnings.push('Le sommet ' + (j + 1) + ' (' + c[1].toFixed(4) + ', ' + c[0].toFixed(4) + ') semble hors du territoire togolais.');
          }
        }
      }
    }

    /* --- ATTRIBUTS OBLIGATOIRES --- */
    if (!attrs.Name || !attrs.Name.trim()) {
      errors.push('Le nom de la route est obligatoire.');
    }
    if (!attrs.CLASSE || !attrs.CLASSE.trim()) {
      errors.push('La cat\u00e9gorie de la route est obligatoire.');
    }
    if (!attrs.REGIONS || !attrs.REGIONS.trim()) {
      errors.push('La r\u00e9gion est obligatoire.');
    }
    if (!attrs.Prefecture || !attrs.Prefecture.trim()) {
      errors.push('La pr\u00e9fecture est obligatoire.');
    }

    /* --- DOUBLONS --- */
    if (context && context.allRoutes && attrs.Name) {
      var name = attrs.Name.trim().toLowerCase();
      for (var k = 0; k < context.allRoutes.length; k++) {
        var existing = context.allRoutes[k];
        /* Ignorer la route elle-même en cas de modification — comparaison par index ou Name */
        if (context.existingId !== undefined) {
          if (existing.id === context.existingId) continue;
          /* Les features GeoJSON de ce projet n'ont pas toujours de champ id ;
             fallback : comparer par nom si existingId est un nom (string) */
          if (typeof context.existingId === 'string' &&
              (existing.properties.Name || '').trim().toLowerCase() === context.existingId.trim().toLowerCase()) continue;
        }
        var existingName = (existing.properties.Name || '').trim().toLowerCase();
        if (existingName === name) {
          errors.push('Une route nommée "' + existing.properties.Name + '" existe déjà.');
          break;
        }
      }
    }

    /* --- COHÉRENCE ADMINISTRATIVE --- */
    if (typeof AdministrativeHierarchy !== 'undefined') {
      if (attrs.REGIONS && attrs.Prefecture) {
        if (!AdministrativeHierarchy.isPrefectureInRegion(attrs.Prefecture, attrs.REGIONS)) {
          warnings.push('La pr\u00e9fecture "' + attrs.Prefecture + '" ne semble pas appartenir \u00e0 la r\u00e9gion "' + attrs.REGIONS + '".');
        }
      }
      if (attrs.Prefecture && attrs.Canton) {
        if (!AdministrativeHierarchy.isCantonInPrefecture(attrs.Canton, attrs.Prefecture)) {
          warnings.push('Le canton "' + attrs.Canton + '" ne semble pas appartenir \u00e0 la pr\u00e9fecture "' + attrs.Prefecture + '".');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  /**
   * Extrait toutes les coordonnées plates d'une géométrie GeoJSON.
   * @param {Object} geom
   * @returns {Array[]} [[lon, lat], ...]
   */
  function extractAllCoords(geom) {
    var result = [];
    if (!geom || !geom.coordinates) return result;
    if (geom.type === 'Point') {
      result.push(geom.coordinates);
    } else if (geom.type === 'LineString') {
      geom.coordinates.forEach(function(c) { result.push(c); });
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach(function(line) {
        line.forEach(function(c) { result.push(c); });
      });
    } else if (geom.type === 'Polygon') {
      geom.coordinates[0].forEach(function(c) { result.push(c); });
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(function(poly) {
        poly[0].forEach(function(c) { result.push(c); });
      });
    }
    return result;
  }

  /**
   * Calcule la longueur d'une géométrie en mètres.
   * @param {Object} geom - Géométrie GeoJSON
   * @returns {number} Longueur en mètres
   */
  function computeLength(geom) {
    if (!geom || !geom.coordinates) return 0;
    if (typeof ol !== 'undefined' && ol.sphere) {
      var format = new ol.format.GeoJSON();
      var olGeom = format.readGeometry(geom, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
      return ol.sphere.getLength(olGeom);
    }
    /* Fallback : distance haversine sommaire sur LineString */
    var total = 0;
    var coords = geom.coordinates;
    if (geom.type === 'LineString' && coords.length > 1) {
      for (var i = 1; i < coords.length; i++) {
        total += haversine(coords[i - 1], coords[i]);
      }
    }
    return total;
  }

  /**
   * Compte le nombre total de sommets d'une géométrie.
   * @param {Object} geom
   * @returns {number}
   */
  function countVertices(geom) {
    return extractAllCoords(geom).length;
  }

  /* Haversine distance en mètres entre deux points [lon, lat] */
  function haversine(a, b) {
    var R = 6371000;
    var dLat = (b[1] - a[1]) * Math.PI / 180;
    var dLon = (b[0] - a[0]) * Math.PI / 180;
    var lat1 = a[1] * Math.PI / 180;
    var lat2 = b[1] * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  /* ===== API PUBLIQUE ===== */
  return {
    validate: validate,
    computeLength: computeLength,
    countVertices: countVertices,
    extractAllCoords: extractAllCoords
  };
})();

/* ===== road-attributes.js ===== */

/* ===================================================================
 * GeoROAD TOGO — Formulaire d'Attributs Routiers (étendu)
 *
 * Génère le formulaire complet avec hiérarchie administrative,
 * attributs SIG, et champs métier.
 *
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Les listes (sens, statut, type, précision) peuvent être
 *     chargées depuis des tables de référence via /api/references
 *   - Le champ "Agent" sera alimenté par la session JWT
 *
 * Dépend : AdministrativeHierarchy
 * =================================================================== */
var RoadAttributes = (function() {
  'use strict';

  /* ===== RÉFÉRENTIELS ===== */
  /* Futur : charger depuis /api/references */
  var CATEGORIES = [
    ['CU', 'Route Communautaire'],
    ['RN', 'Route Nationale'],
    ['RR', 'Route R\u00e9gionale'],
    ['RC', 'Route Communale'],
    ['RL', 'Route Locale']
  ];

  var TYPES_ROUTE = [
    ['Nationale', 'Nationale'],
    ['R\u00e9gionale', 'R\u00e9gionale'],
    ['Départementale', 'D\u00e9partementale'],
    ['Rurale', 'Rurale'],
    ['Urbaine', 'Urbaine'],
    ['Piste', 'Piste']
  ];

  var CLASSES_ADMIN = [
    ['Classe 1', 'Classe 1 (Autoroute)'],
    ['Classe 2', 'Classe 2 (Route à 2 voies)'],
    ['Classe 3', 'Classe 3 (Route bitumée)'],
    ['Classe 4', 'Classe 4 (Route en terre)'],
    ['Classe 5', 'Classe 5 (Piste)']
  ];

  var STATUTS = [
    ['En service', 'En service'],
    ['En travaux', 'En travaux'],
    ['Ferme', 'Ferm\u00e9'],
    ['Projet', 'Projet'],
    ['Abandonne', 'Abandonn\u00e9']
  ];

  var SENS_CIRCULATION = [
    ['Double sens', 'Double sens'],
    ['Sens unique', 'Sens unique'],
    ['Sens alterné', 'Sens altern\u00e9']
  ];

  var REVETEMENTS = [
    ['Bitume', 'Bitume'],
    ['Béton', 'B\u00e9ton'],
    ['Terre', 'Terre'],
    ['Gravier', 'Gravier'],
    ['Non revetu', 'Non rev\u00eatu']
  ];

  var ETATS = [
    ['Bon', 'Bon'],
    ['Moyen', 'Moyen'],
    ['Mauvais', 'Mauvais'],
    ['En travaux', 'En travaux']
  ];

  var PRECISION_GNSS = [
    ['Centimétrique', 'Centim\u00e9trique (RTK)'],
    ['Décimétrique', 'D\u00e9cim\u00e9trique'],
    ['Métrique', 'M\u00e9trique'],
    ['Décamétrique', 'D\u00e9cam\u00e9trique'],
    ['Héritage', 'H\u00e9ritage (donn\u00e9es existantes)']
  ];

  var SOURCES = [
    ['Levé GNSS', 'Lev\u00e9 GNSS terrain'],
    ['Photo-aérienne', 'Photo a\u00e9rienne / Orthophoto'],
    ['Satellite', 'Imagerie satellite'],
    ['OpenStreetMap', 'OpenStreetMap'],
    ['DGMRTP', 'DGMRTP / Ministère des Travaux Publics'],
    ['Héritage SIG', 'H\u00e9ritage SIG existant']
  ];

  /* ===== CHAMPS INFO GÉOMÉTRIE (calculés, non éditables) ===== */
  var GEO_FIELDS = ['Longueur_calculee', 'Nb_sommets'];

  /* ===================================================================
   * CONSTRUCTION DU FORMULAIRE
   * =================================================================== */

  /**
   * Génère le formulaire complet des attributs d'une route.
   * @param {Object} existingProps - Propriétés existantes (édition) ou {} (création)
   * @param {Object} geoInfo - { length: number, vertices: number } (infos calculées)
   * @returns {string} HTML du formulaire
   */
  function renderForm(existingProps, geoInfo) {
    var p = existingProps || {};
    geoInfo = geoInfo || {};

    /* Agent : futur depuis session JWT */
    var agent = p.Agent || '';
    if (!agent && typeof AdminAuth !== 'undefined') {
      var session = AdminAuth.getSession();
      if (session) agent = session.name || session.username || '';
    }

    var html = '<form id="sig-route-form" onsubmit="return false;">';

    /* --- Section 1 : Identification --- */
    html += sectionTitle('Identification de la route');
    html += formRow(
      formGroup('Nom de la route *', '<input type="text" name="Name" required value="' + ea(p.Name) + '" placeholder="Ex: Lom\u00e9-Sokod\u00e9">'),
      formGroup('Code officiel', '<input type="text" name="Code" value="' + ea(p.Code) + '" placeholder="Ex: RN1">')
    );
    html += formRow(
      formGroup('Origine', '<input type="text" name="Origine" value="' + ea(p.Origine) + '" placeholder="Ex: Lom\u00e9">'),
      formGroup('Destination', '<input type="text" name="Destination" value="' + ea(p.Destination) + '" placeholder="Ex: Sokod\u00e9">')
    );

    /* --- Section 2 : Classification --- */
    html += sectionTitle('Classification');
    html += formRow(
      formGroup('Cat\u00e9gorie (CLASSE) *', buildSelect('CLASSE', CATEGORIES, p.CLASSE)),
      formGroup('Type de route', buildSelect('Type_route', TYPES_ROUTE, p.Type_route))
    );
    html += formRow(
      formGroup('Classe administrative', buildSelect('Classe_admin', CLASSES_ADMIN, p.Classe_admin)),
      formGroup('Statut', buildSelect('Statut', STATUTS, p.Statut))
    );

    /* --- Section 3 : Localisation administrative --- */
    html += sectionTitle('Localisation administrative');
    if (typeof AdministrativeHierarchy !== 'undefined') {
      html += formRow(
        formGroup('R\u00e9gion *', AdministrativeHierarchy.renderRegionSelect(p.REGIONS)),
        formGroup('Pr\u00e9fecture *', AdministrativeHierarchy.renderPrefectureSelect(p.REGIONS, p.Prefecture))
      );
      html += formRow(
        formGroup('Canton', AdministrativeHierarchy.renderCantonSelect(p.Prefecture, p.Canton)),
        formGroup('Localit\u00e9(s) desservie(s)', '<input type="text" name="Localites" value="' + ea(p.Localites) + '" placeholder="Ex: Agbandi, Blitta-Gare">')
      );
    } else {
      html += formRow(
        formGroup('R\u00e9gion *', '<input type="text" name="REGIONS" required value="' + ea(p.REGIONS) + '">'),
        formGroup('Pr\u00e9fecture *', '<input type="text" name="Prefecture" required value="' + ea(p.Prefecture) + '">')
      );
    }

    /* --- Section 4 : Caractéristiques physiques --- */
    html += sectionTitle('Caract\u00e9ristiques physiques');
    html += formRow(
      formGroup('Longueur (m)', '<input type="number" name="LONGEUR" step="0.01" value="' + (geoInfo.length ? (geoInfo.length).toFixed(1) : (p.LONGEUR || '')) + '" ' + (geoInfo.length ? 'readonly style="background:var(--cream-2)"' : '') + ' id="sig-field-longueur">'),
      formGroup('Largeur de chauss\u00e9e (m)', '<input type="number" name="Largeur" step="0.1" value="' + ea(p.Largeur) + '" placeholder="Ex: 7">')
    );
    html += formRow(
      formGroup('Emprise r\u00e9glementaire (m)', '<input type="number" name="EMPRISE" step="1" value="' + (p.EMPRISE || '') + '" placeholder="Ex: 70">'),
      formGroup('Nombre de sommets', '<input type="number" name="Nb_sommets" value="' + (geoInfo.vertices || p.Nb_sommets || '') + '" readonly style="background:var(--cream-2)">')
    );
    html += formRow(
      formGroup('Type de rev\u00eatement', buildSelect('Revetement', REVETEMENTS, p.Revetement)),
      formGroup('\u00c9tat', buildSelect('Etat', ETATS, p.Etat))
    );
    html += formRow(
      formGroup('Sens de circulation', buildSelect('Sens_circulation', SENS_CIRCULATION, p.Sens_circulation)),
      formGroup('Population desservie', '<input type="number" name="Pop_Dessertie" value="' + ea(p.Pop_Dessertie) + '" placeholder="Ex: 15000">')
    );

    /* --- Section 5 : PK et coordonnées --- */
    html += sectionTitle('Points kilom\u00e9triques');
    html += formRow(
      formGroup('PK D\u00e9but X', '<input type="number" name="PK_DEB_X" step="0.001" value="' + (p.PK_DEB_X || '') + '">'),
      formGroup('PK D\u00e9but Y', '<input type="number" name="PK_DEB_Y" step="0.001" value="' + (p.PK_DEB_Y || '') + '">')
    );
    html += formRow(
      formGroup('PK Fin X', '<input type="number" name="PK_FIN_X" step="0.001" value="' + (p.PK_FIN_X || '') + '">'),
      formGroup('PK Fin Y', '<input type="number" name="PK_FIN_Y" step="0.001" value="' + (p.PK_FIN_Y || '') + '">')
    );

    /* --- Section 6 : Métadonnées --- */
    html += sectionTitle('M\u00e9tadonn\u00e9es');
    html += formRow(
      formGroup('Source des donn\u00e9es', buildSelect('Source', SOURCES, p.Source)),
      formGroup('Pr\u00e9cision GNSS', buildSelect('Precision_GNSS', PRECISION_GNSS, p.Precision_GNSS))
    );
    html += formRow(
      formGroup('Agent (modificateur)', '<input type="text" name="Agent" value="' + ea(agent) + '" placeholder="Nom de l\'agent">'),
      formGroup('Date de cr\u00e9ation', '<input type="date" name="Date_creation" value="' + (p.Date_creation || new Date().toISOString().slice(0, 10)) + '">')
    );
    html += formRow(
      formGroup('Derni\u00e8re MAJ', '<input type="date" name="Date_maj" value="' + (p.Date_maj || new Date().toISOString().slice(0, 10)) + '" readonly style="background:var(--cream-2)">'),
      formGroup('', '')
    );

    /* --- Section 7 : Commentaires --- */
    html += sectionTitle('Commentaires');
    html += '<div class="sig-form-row-single">';
    html += formGroup('Commentaires', '<textarea name="Observations" rows="3" placeholder="Remarques, notes techniques...">' + eh(p.Observations) + '</textarea>');
    html += '</div>';

    html += '</form>';
    return html;
  }

  /**
   * Extrait les données du formulaire DOM.
   * @returns {Object} Propriétés prêtes à enregistrer
   */
  function getFormData() {
    var form = document.getElementById('sig-route-form');
    if (!form) return {};
    var data = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(function(el) {
      var v = el.value;
      if (el.type === 'number' && v !== '') v = parseFloat(v);
      if (GEO_FIELDS.indexOf(el.name) !== -1) return; /* Champs calculés, on les garde read-only */
      data[el.name] = v;
    });
    /* Auto-fill Origine/Destination depuis le nom si vides */
    if (data.Name && !data.Origine) {
      var parts = data.Name.split('-');
      data.Origine = parts[0] ? parts[0].trim() : '';
      data.Destination = parts[1] ? parts[1].trim() : '';
    }
    /* Date de MAJ auto */
    data.Date_maj = new Date().toISOString().slice(0, 10);
    return data;
  }

  /**
   * Met en place les événements de cascade sur les selects hiérarchiques.
   * Doit être appelé après renderForm() et insertion dans le DOM.
   */
  function initHierarchyEvents() {
    if (typeof AdministrativeHierarchy === 'undefined') return;

    var regionSelect = document.getElementById('sig-hierarchy-region');
    var prefSelect = document.getElementById('sig-hierarchy-prefecture');
    var cantonSelect = document.getElementById('sig-hierarchy-canton');

    if (regionSelect) {
      regionSelect.addEventListener('change', function() {
        var region = this.value;
        /* Mettre à jour les préfectures */
        if (prefSelect) {
          prefSelect.outerHTML = AdministrativeHierarchy.renderPrefectureSelect(region, '', 'Prefecture');
          var newPref = document.getElementById('sig-hierarchy-prefecture');
          if (newPref) newPref.addEventListener('change', onPrefectureChange);
        }
        /* Vider les cantons */
        if (cantonSelect) {
          cantonSelect.outerHTML = AdministrativeHierarchy.renderCantonSelect('', '', 'Canton');
        }
      });
    }

    if (prefSelect) {
      prefSelect.addEventListener('change', onPrefectureChange);
    }
  }

  function onPrefectureChange() {
    var prefSelect = document.getElementById('sig-hierarchy-prefecture');
    var cantonSelect = document.getElementById('sig-hierarchy-canton');
    if (prefSelect && cantonSelect) {
      var pref = prefSelect.value;
      cantonSelect.outerHTML = AdministrativeHierarchy.renderCantonSelect(pref, '', 'Canton');
    }
  }

  /* ===== HELPERS HTML ===== */

  function sectionTitle(title) {
    return '<div class="sig-form-section-title"><i class="fas fa-chevron-right"></i> ' + title + '</div>';
  }

  function formGroup(label, inputHtml) {
    return '<div class="sig-fm-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function formRow(left, right) {
    return '<div class="sig-form-row">' + left + right + '</div>';
  }

  function buildSelect(name, options, current) {
    var html = '<select name="' + name + '">';
    html += '<option value="">-- Non d\u00e9fini --</option>';
    options.forEach(function(o) {
      var val = o[0], label = o[1];
      var sel = String(val) === String(current) ? ' selected' : '';
      html += '<option value="' + ea(val) + '"' + sel + '>' + eh(label) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function ea(s) { return escAttr(s); }
  function eh(s) { return escHtml(s); }
  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ===== API PUBLIQUE ===== */
  return {
    renderForm: renderForm,
    getFormData: getFormData,
    initHierarchyEvents: initHierarchyEvents,
    CATEGORIES: CATEGORIES,
    ETATS: ETATS,
    REVETEMENTS: REVETEMENTS,
    STATUTS: STATUTS
  };
})();

/* ===== road-sync.js ===== */

/* ===================================================================
 * GeoROAD TOGO — Module de Synchronisation Temps Réel
 *
 * Propage toute modification (création, édition, suppression)
 * immédiatement vers :
 *   - Carte OL (mise à jour de couche optimisée)
 *   - Tableau des routes (admin)
 *   - Dashboard KPI (admin)
 *   - Statistiques globales
 *
 * Pas de refresh nécessaire.
 *
 * Architecture PostGIS :
 *   - Remplacer les appels locaux par des WebSocket events
 *     ou des appels REST synchrones.
 *
 * Dépend : geoportail.js (lyr_Rseauroutier_6), AdminData
 * =================================================================== */
var RoadSync = (function() {
  'use strict';

  /* ===== ÉTAT ===== */
  var _listeners = [];  /* Callbacks enregistrés pour les événements de modification */

  /* Types d'événements */
  var EVENTS = {
    FEATURE_CREATED: 'feature:created',
    FEATURE_UPDATED: 'feature:updated',
    FEATURE_DELETED: 'feature:deleted',
    GEOMETRY_CHANGED: 'geometry:changed',
    FULL_REFRESH: 'full:refresh'
  };

  /* ===================================================================
   * PROPAGATION CARTOGRAPHIQUE
   * =================================================================== */

  /**
   * Met à jour la couche routière OL de manière optimisée.
   * Ne fait PAS un re-render complet de la carte.
   * Utilise le rafraîchissement de source uniquement.
   *
   * @param {boolean} fullReload - Si true, recharge toute la source
   *                               (utile après ajout/suppression).
   *                               Si false, ne fait que changed() sur
   *                               la feature (optimisé pour les modifs géométriques).
   * @param {number|null} featureId - Index de la feature modifiée (si fullReload=false)
   * @param {ol.Feature|null} olFeature - Feature OL à rafraîchir
   */
  function syncMap(fullReload, featureId, olFeature) {
    if (typeof lyr_Rseauroutier_6 === 'undefined') return;

    if (fullReload || featureId === null) {
      /* Recharger toute la source à partir du GeoJSON global */
      var format = new ol.format.GeoJSON();
      var features = format.readFeatures(json_Rseauroutier_6, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      var source = lyr_Rseauroutier_6.getSource();
      source.clear();
      source.addFeatures(features);
    } else {
      /* Mise à jour ciblée : signaler que la feature a changé */
      if (olFeature) {
        olFeature.changed();
      }
    }

    /* Mettre à jour le badge de compteur dans la sidebar */
    var countBadge = document.querySelector('[data-layer="Rseauroutier_6"]');
    /* Si un compteur existe dans la sidebar */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      var allCountEls = document.querySelectorAll('.road-count-badge, .lt-count');
      allCountEls.forEach(function(el) {
        el.textContent = json_Rseauroutier_6.features.length;
      });
    }
  }

  /* ===================================================================
   * PROPAGATION ADMIN (Dashboard + Table)
   * =================================================================== */

  /**
   * Met à jour le dashboard si la page admin est ouverte.
   * Détecte automatiquement si les éléments DOM existent.
   */
  function syncDashboard() {
    /* Vérifier si on est sur la page admin et si le dashboard est visible */
    var contentEl = document.getElementById('adminContent');
    if (!contentEl) return;

    /* Vérifier si la page courante est le dashboard */
    var activePage = document.querySelector('.nav-item.active');
    if (activePage && activePage.dataset.page === 'dashboard') {
      /* Re-render uniquement les stats */
      if (typeof AdminData !== 'undefined' && typeof AdminPages !== 'undefined') {
        contentEl.innerHTML = AdminPages.render('dashboard');
      }
    }

    /* Mettre à jour les KPI en temps réel si les éléments existent */
    updateKPIElements();
  }

  /**
   * Met à jour les éléments KPI visibles sur la page.
   */
  function updateKPIElements() {
    if (typeof json_Rseauroutier_6 === 'undefined') return;

    var stats = computeQuickStats();
    var kpiEls = document.querySelectorAll('[data-kpi]');
    kpiEls.forEach(function(el) {
      var key = el.dataset.kpi;
      if (key === 'totalRoutes') el.textContent = stats.totalRoutes;
      if (key === 'totalKm') el.textContent = stats.totalKmStr;
    });
  }

  /**
   * Met à jour le tableau des routes si visible dans l'admin.
   */
  function syncRouteTable() {
    var contentEl = document.getElementById('adminContent');
    if (!contentEl) return;

    /* Si RouteModule est chargé et le tableau est affiché */
    if (typeof RouteModule !== 'undefined') {
      RouteModule.reload();
    }
  }

  /**
   * Met à jour les statistiques globales (modals).
   */
  function syncGlobalStats() {
    /* Mettre à jour le contenu des modals si ouverts */
    var statsModal = document.getElementById('stats-modal');
    if (statsModal && statsModal.classList.contains('active')) {
      if (typeof renderStatsContent === 'function') renderStatsContent();
    }
  }

  /* ===================================================================
   * STATISTIQUES RAPIDES
   * =================================================================== */

  function computeQuickStats() {
    var totalRoutes = 0;
    var totalKm = 0;

    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      totalRoutes = json_Rseauroutier_6.features.length;
      json_Rseauroutier_6.features.forEach(function(f) {
        var len = (f.properties && f.properties.LONGEUR) || 0;
        /* Fallback : calculer via ol.sphere si LONGEUR est 0 */
        if (!len && f.geometry && typeof ol !== 'undefined' && ol.sphere) {
          try {
            var fmt = new ol.format.GeoJSON();
            var g = fmt.readGeometry(f.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
            len = ol.sphere.getLength(g);
          } catch(e) {}
        }
        totalKm += len / 1000;
      });
    }

    return {
      totalRoutes: totalRoutes,
      totalKm: totalKm,
      totalKmStr: totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km'
    };
  }

  /* ===================================================================
   * VERSIONNING — Ajoute les métadonnées de version à une route
   * =================================================================== */

  /**
   * Initialise le versionning sur une feature existante.
   * @param {number} featureIdx - Index dans json_Rseauroutier_6
   */
  function initVersioning(featureIdx) {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var feat = json_Rseauroutier_6.features[featureIdx];
    if (!feat || !feat.properties) return;

    var now = new Date().toISOString();
    if (!feat.properties.createdAt) {
      feat.properties.createdAt = now;
      feat.properties.status = feat.properties.status || 'validated';
    }
    feat.properties.lastModified = now;

    var session = null;
    if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
    feat.properties.modifiedBy = session ? (session.name || session.username) : 'Utilisateur';
  }

  /**
   * Met à jour le versionning après modification.
   * @param {number} featureIdx
   * @param {string} newStatus - Optionnel : 'draft' | 'validated' | 'published'
   */
  function touchVersion(featureIdx, newStatus) {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var feat = json_Rseauroutier_6.features[featureIdx];
    if (!feat || !feat.properties) return;

    feat.properties.lastModified = new Date().toISOString();

    var session = null;
    if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
    feat.properties.modifiedBy = session ? (session.name || session.username) : 'Utilisateur';

    if (newStatus) {
      feat.properties.status = newStatus;
    }
  }

  /* ===================================================================
   * ÉVÉNEMENTS (pub/sub pour les modules externes)
   * =================================================================== */

  /**
   * Enregistre un listener pour un événement.
   * @param {string} eventType - Type d'événement (voir EVENTS)
   * @param {function} callback - function(data)
   */
  function on(eventType, callback) {
    _listeners.push({ type: eventType, fn: callback });
  }

  /**
   * Supprime un listener.
   */
  function off(eventType, callback) {
    _listeners = _listeners.filter(function(l) {
      return !(l.type === eventType && l.fn === callback);
    });
  }

  /**
   * Émet un événement.
   * @param {string} eventType
   * @param {Object} data
   */
  function emit(eventType, data) {
    _listeners.forEach(function(l) {
      if (l.type === eventType) {
        try { l.fn(data); } catch(e) { /* RoadSync listener error: silenced */; }
      }
    });
  }

  /* ===================================================================
   * MÉTHODE PRINCIPALE : PROPAGER UNE MODIFICATION
   * =================================================================== */

  /**
   * Propage une modification complète sur toutes les vues.
   *
   * @param {string} action - 'created' | 'updated' | 'deleted' | 'geometry'
   * @param {Object} options
   * @param {number} options.featureId - Index de la feature
   * @param {ol.Feature} [options.olFeature] - Feature OL (pour update ciblé)
   * @param {boolean} [options.fullReload=true] - Rechargement complet de la couche
   */
  function propagate(action, options) {
    options = options || {};
    var featureId = options.featureId;
    var olFeature = options.olFeature;
    var fullReload = options.fullReload !== undefined ? options.fullReload : true;

    /* 1. Versionning */
    if (featureId !== null && featureId !== undefined) {
      if (action === 'created') {
        initVersioning(featureId);
      } else if (action === 'updated' || action === 'geometry') {
        touchVersion(featureId);
      }
    }

    /* 2. Synchroniser la carte */
    syncMap(fullReload, featureId, olFeature);

    /* 3. Émettre l'événement */
    var eventType = EVENTS.FEATURE_UPDATED;
    if (action === 'created') eventType = EVENTS.FEATURE_CREATED;
    else if (action === 'deleted') eventType = EVENTS.FEATURE_DELETED;
    else if (action === 'geometry') eventType = EVENTS.GEOMETRY_CHANGED;
    emit(eventType, { featureId: featureId, olFeature: olFeature });

    /* 4. Synchroniser le dashboard */
    syncDashboard();

    /* 5. Synchroniser le tableau (si visible) */
    syncRouteTable();

    /* 6. Synchroniser les statistiques */
    syncGlobalStats();
  }

  /* ===== INITIALISATION DU VERSIONNING SUR LES ROUTES EXISTANTES ===== */
  function initExistingRoutesVersioning() {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var now = new Date().toISOString();
    json_Rseauroutier_6.features.forEach(function(f) {
      if (!f.properties) f.properties = {};
      if (!f.properties.createdAt) {
        f.properties.createdAt = now;
      }
      if (!f.properties.lastModified) {
        f.properties.lastModified = now;
      }
      if (!f.properties.status) {
        f.properties.status = 'published';
      }
      if (!f.properties.modifiedBy) {
        f.properties.modifiedBy = 'Système';
      }
    });
  }

  /* Auto-init au chargement */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExistingRoutesVersioning);
  } else {
    initExistingRoutesVersioning();
  }

  /* ===== API PUBLIQUE ===== */
  return {
    propagate: propagate,
    syncMap: syncMap,
    syncDashboard: syncDashboard,
    syncRouteTable: syncRouteTable,
    syncGlobalStats: syncGlobalStats,
    initVersioning: initVersioning,
    touchVersion: touchVersion,
    computeQuickStats: computeQuickStats,
    on: on,
    off: off,
    emit: emit,
    EVENTS: EVENTS
  };
})();

/* ===== road-drawing.js ===== */

/* ===================================================================
 * GeoROAD TOGO — Gestionnaire de Dessin Cartographique
 *
 * Permet de dessiner des routes (polylignes) directement sur la carte
 * avec un comportement comparable à QGIS / ArcGIS / OSM.
 *
 * Flux : Dessin → Validation géométrie → Formulaire attributs →
 *         Validation attributs → Enregistrement
 *
 * Dépend : OpenLayers (ol), RoadValidator, RoadAttributes,
 *           AdministrativeHierarchy, showToast (geoportail.js)
 * =================================================================== */
var RoadDrawingManager = (function() {
  'use strict';

  /* ===== ÉTAT DU DESSIN ===== */
  var _active = false;
  var _drawInteraction = null;
  var _drawSource = null;
  var _drawLayer = null;
  var _currentSketch = null;
  var _drawTooltipEl = null;
  var _drawTooltipOverlay = null;
  var _onComplete = null;       /* Callback appelé après validation du dessin */
  var _lastCoordCount = 0;
  var _drawStartCoords = null;
  var _finishing = false;       /* Drapeau anti-course : empêche singleclick de fermer le drawer */

  /* ===== COUCHE DE DESSIN ===== */
  function ensureDrawLayer() {
    if (_drawLayer) return;
    _drawSource = new ol.source.Vector();
    _drawLayer = new ol.layer.Vector({
      source: _drawSource,
      style: new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.15)' }),
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 4, lineDash: [10, 6] }),
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: '#C8A64B' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 2.5 })
        })
      }),
      zIndex: 300
    });
    map.addLayer(_drawLayer);
  }

  function removeDrawLayer() {
    if (_drawLayer) {
      map.removeLayer(_drawLayer);
      _drawLayer = null;
      _drawSource = null;
    }
  }

  /* ===== TOOLTIP DESSIN ===== */
  function ensureTooltip() {
    if (_drawTooltipEl) return;
    _drawTooltipEl = document.createElement('div');
    _drawTooltipEl.className = 'sig-draw-tooltip';
    document.getElementById('map-container').appendChild(_drawTooltipEl);
    _drawTooltipOverlay = new ol.Overlay({
      element: _drawTooltipEl,
      offset: [0, -15],
      positioning: 'bottom-center'
    });
    map.addOverlay(_drawTooltipOverlay);
  }

  function removeTooltip() {
    if (_drawTooltipOverlay) { map.removeOverlay(_drawTooltipOverlay); _drawTooltipOverlay = null; }
    if (_drawTooltipEl) { if (_drawTooltipEl.parentNode) _drawTooltipEl.parentNode.removeChild(_drawTooltipEl); _drawTooltipEl = null; }
  }

  function showDrawTooltip(coord, text) {
    if (_drawTooltipOverlay && _drawTooltipEl) {
      _drawTooltipEl.innerHTML = text;
      _drawTooltipEl.style.display = '';
      _drawTooltipOverlay.setPosition(coord);
    }
  }

  function hideDrawTooltip() {
    if (_drawTooltipEl) _drawTooltipEl.style.display = 'none';
  }

  /* ===================================================================
   * DÉMARRER / ARRÊTER LE DESSIN
   * =================================================================== */

  function startDrawing(onComplete) {
    if (_active) return;
    _active = true;
    _finishing = false;
    _onComplete = onComplete;
    _lastCoordCount = 0;
    _drawStartCoords = null;

    ensureDrawLayer();
    ensureTooltip();
    showDrawBar();

    _drawInteraction = new ol.interaction.Draw({
      source: _drawSource,
      type: 'LineString',
      style: new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.2)' }),
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 4, lineDash: [10, 6] }),
        image: new ol.style.Circle({
          radius: 7,
          fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.6)' }),
          stroke: new ol.style.Stroke({ color: '#C8A64B', width: 3 })
        })
      }),
      minPoints: 2,
      clickTolerance: 5
    });

    _drawInteraction.on('drawstart', onDrawStart);
    _drawInteraction.on('drawabort', onDrawAbort);
    _drawInteraction.on('drawend', onDrawEnd);

    map.addInteraction(_drawInteraction);

    map.getTargetElement().style.cursor = 'crosshair';
    showToast('Mode dessin activ\u00e9 \u2014 Cliquez sur la carte pour tracer la route', 'draw-polygon');
  }

  function onDrawStart(evt) {
    _currentSketch = evt.feature;
    _drawStartCoords = evt.coordinate;
    _finishing = false;

    _currentSketch.getGeometry().on('change', function() {
      var geom = _currentSketch.getGeometry();
      var coords = geom.getCoordinates();
      var len = ol.sphere.getLength(geom);
      var lenStr = len > 1000 ? (len / 1000).toFixed(2) + ' km' : len.toFixed(1) + ' m';
      var vertInfo = coords.length + ' sommet' + (coords.length > 1 ? 's' : '');
      showDrawTooltip(coords[coords.length - 1], '<strong>' + vertInfo + '</strong> | ' + lenStr);
      _lastCoordCount = coords.length;
      updateDrawBar(coords.length, lenStr);
    });
  }

  function onDrawAbort() {
    _currentSketch = null;
    _finishing = false;
    hideDrawTooltip();
    removeDrawBar();
    showToast('Dessin annul\u00e9', 'undo');
  }

  function onDrawEnd(evt) {
    /* Le double-clic ou le bouton Terminer déclenche drawend.
       On utilise le flag _finishing pour éviter que finishDrawing
       soit appelé deux fois (une fois par drawend, une fois par le bouton). */
    var feature = evt.feature;
    if (!feature || !feature.getGeometry()) return;

    /* Extraire la géométrie AVANT de retirer l'interaction */
    var geom = feature.getGeometry();
    var coords = geom.getCoordinates();

    if (coords.length < 2) {
      showToast('Ajoutez au moins 2 points', 'info-circle');
      return;
    }

    /* Marquer qu'on est en train de finaliser pour bloquer le singleclick */
    _finishing = true;

    /* Retirer l'interaction immédiatement */
    if (_drawInteraction) {
      map.removeInteraction(_drawInteraction);
      _drawInteraction = null;
    }
    _active = false;

    /* Convertir en GeoJSON */
    var geoJSON = convertToGeoJSON(geom);

    hideDrawTooltip();
    removeDrawBar();

    /* Vérification minimale */
    if (typeof RoadValidator !== 'undefined') {
      var result = RoadValidator.validate({}, geoJSON, null);
      if (!result.valid) {
        showToast('G\u00e9om\u00e9trie invalide : ' + result.errors[0], 'exclamation-triangle');
        _drawSource.clear();
        removeDrawLayer();
        removeTooltip();
        _finishing = false;
        map.getTargetElement().style.cursor = '';
        return;
      }
    }

    /* Nettoyer la couche de dessin */
    _drawSource.clear();

    /* Zoomer sur la géométrie */
    var ext = geom.getExtent();
    map.getView().fit(ext, { size: map.getSize(), maxZoom: 14, padding: [80, 80, 80, 80], duration: 500 });

    /* Calculer les infos géo */
    var length = ol.sphere.getLength(geom);
    var vertices = coords.length;

    /* Réinitialiser le curseur */
    map.getTargetElement().style.cursor = '';

    /* Appeler le callback avec la géométrie validée */
    if (_onComplete) {
      _onComplete(geoJSON, geom, { length: length, vertices: vertices });
    }

    /* Libérer le flag après un délai suffisant pour que le singleclick soit ignoré */
    setTimeout(function() { _finishing = false; }, 600);
  }

  /**
   * Termine le dessin manuellement (bouton "Terminer" ou touche Entrée).
   * Si un dessin est en cours, on finalise la géométrie actuelle.
   */
  function finishDrawing() {
    if (_finishing) return; /* Déjà en cours de finalisation */
    if (!_active) return;

    if (_currentSketch && _currentSketch.getGeometry()) {
      var coords = _currentSketch.getGeometry().getCoordinates();
      if (coords.length >= 2) {
        _finishing = true;

        /* Retirer l'interaction */
        if (_drawInteraction) {
          map.removeInteraction(_drawInteraction);
          _drawInteraction = null;
        }
        _active = false;

        var geom = _currentSketch.getGeometry();
        var geoJSON = convertToGeoJSON(geom);

        hideDrawTooltip();
        removeDrawBar();

        /* Vérification minimale */
        if (typeof RoadValidator !== 'undefined') {
          var result = RoadValidator.validate({}, geoJSON, null);
          if (!result.valid) {
            showToast('G\u00e9om\u00e9trie invalide : ' + result.errors[0], 'exclamation-triangle');
            _drawSource.clear();
            removeDrawLayer();
            removeTooltip();
            _finishing = false;
            map.getTargetElement().style.cursor = '';
            return;
          }
        }

        /* Nettoyer la couche de dessin */
        _drawSource.clear();

        /* Zoomer sur la géométrie */
        var ext = geom.getExtent();
        map.getView().fit(ext, { size: map.getSize(), maxZoom: 14, padding: [80, 80, 80, 80], duration: 500 });

        /* Calculer les infos géo */
        var length = ol.sphere.getLength(geom);
        var vertices = coords.length;

        map.getTargetElement().style.cursor = '';

        /* Appeler le callback */
        if (_onComplete) {
          _onComplete(geoJSON, geom, { length: length, vertices: vertices });
        }

        setTimeout(function() { _finishing = false; }, 600);
      } else {
        showToast('Ajoutez au moins 2 points avant de terminer', 'info-circle');
      }
    } else {
      showToast('Aucun trac\u00e9 en cours', 'info-circle');
    }
  }

  function cancelDrawing() {
    if (_drawInteraction) {
      map.removeInteraction(_drawInteraction);
      _drawInteraction = null;
    }
    _active = false;
    _finishing = false;
    _currentSketch = null;
    _drawSource.clear();
    hideDrawTooltip();
    removeDrawBar();
    removeDrawLayer();
    removeTooltip();
    map.getTargetElement().style.cursor = '';
    showToast('Dessin annul\u00e9', 'undo');
  }

  function undoLastVertex() {
    if (!_currentSketch || !_active) return;
    var geom = _currentSketch.getGeometry();
    if (!(geom instanceof ol.geom.LineString)) return;
    var coords = geom.getCoordinates();
    if (coords.length <= 2) {
      showToast('Impossible de supprimer : minimum 2 sommets requis', 'info-circle');
      return;
    }
    coords.pop();
    geom.setCoordinates(coords);
    showToast('Dernier sommet supprim\u00e9', 'undo');
  }

  /* ===== DRAPEAU PUBLIC (pour que SIGModule puisse vérifier) ===== */
  function isFinishing() { return _finishing; }

  /* ===================================================================
   * BARRE DE DESSIN
   * =================================================================== */

  var _drawBarEl = null;

  function showDrawBar() {
    if (_drawBarEl) return;
    _drawBarEl = document.createElement('div');
    _drawBarEl.id = 'sig-draw-bar';
    _drawBarEl.innerHTML =
      '<div class="sig-draw-bar-content">' +
        '<div class="sig-draw-bar-info" id="sig-draw-bar-info">' +
          '<i class="fas fa-draw-polygon"></i> <strong>Mode Dessin</strong> \u2014 Cliquez pour ajouter des points' +
        '</div>' +
        '<div class="sig-draw-bar-actions">' +
          '<button class="sig-draw-bar-btn" id="sig-draw-undo-btn" title="Annuler le dernier sommet (Ctrl+Z)"><i class="fas fa-undo"></i> <span class="btn-text">Annuler sommet</span></button>' +
          '<button class="sig-draw-bar-btn primary" id="sig-draw-finish-btn" title="Terminer le dessin (Entr\u00e9e)"><i class="fas fa-check"></i> <span class="btn-text">Terminer</span></button>' +
          '<button class="sig-draw-bar-btn danger" id="sig-draw-cancel-btn" title="Annuler compl\u00e8tement (\u00c9chap)"><i class="fas fa-times"></i> <span class="btn-text">Annuler</span></button>' +
        '</div>' +
      '</div>';
    document.getElementById('map-container').appendChild(_drawBarEl);

    /* Attacher les événements par ID (plus fiable que inline onclick) */
    document.getElementById('sig-draw-undo-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      undoLastVertex();
    });
    document.getElementById('sig-draw-finish-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      finishDrawing();
    });
    document.getElementById('sig-draw-cancel-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      cancelDrawing();
    });
  }

  function removeDrawBar() {
    if (_drawBarEl) {
      if (_drawBarEl.parentNode) _drawBarEl.parentNode.removeChild(_drawBarEl);
      _drawBarEl = null;
    }
  }

  function updateDrawBar(vertexCount, lengthStr) {
    var info = document.getElementById('sig-draw-bar-info');
    if (info) {
      info.innerHTML = '<i class="fas fa-draw-polygon"></i> <strong>Mode Dessin</strong> \u2014 ' +
        vertexCount + ' sommet' + (vertexCount > 1 ? 's' : '') + ' | ' + lengthStr +
        ' | <small>Double-clic ou bouton Terminer pour valider</small>';
    }
  }

  /* ===================================================================
   * CONVERSION
   * =================================================================== */

  function convertToGeoJSON(olGeom) {
    var format = new ol.format.GeoJSON();
    return format.writeGeometryObject(olGeom, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326'
    });
  }

  function computePK(geom) {
    var coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return {};
    return {
      PK_DEB_X: Math.round(coords[0][0] * 1000000) / 1000000,
      PK_DEB_Y: Math.round(coords[0][1] * 1000000) / 1000000,
      PK_FIN_X: Math.round(coords[coords.length - 1][0] * 1000000) / 1000000,
      PK_FIN_Y: Math.round(coords[coords.length - 1][1] * 1000000) / 1000000
    };
  }

  /* ===== HELPERS ===== */
  function isActive() { return _active; }

  /* ===== RACCOURCIS CLAVIER ===== */
  function initKeyboard() {
    document.addEventListener('keydown', function(e) {
      if (!isActive()) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        cancelDrawing();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoLastVertex();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        finishDrawing();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKeyboard);
  } else {
    initKeyboard();
  }

  /* ===== API PUBLIQUE ===== */
  return {
    startDrawing: startDrawing,
    finishDrawing: finishDrawing,
    cancelDrawing: cancelDrawing,
    undoLastVertex: undoLastVertex,
    isActive: isActive,
    isFinishing: isFinishing,
    computePK: computePK,
    convertToGeoJSON: convertToGeoJSON
  };
})();

/* ===== road-geometry-editor-pro.js ===== */

/* ===================================================================
 * GeoROAD TOGO — RoadGeometryEditorPro
 *
 * Module d'édition géométrique avancée pour les routes.
 * Permet la manipulation continue des sommets :
 *   - Sélection et déplacement de sommets existants
 *   - Ajout de sommets en milieu de segment (clic sur le segment)
 *   - Suppression de sommets (clic droit ou bouton dédié)
 *   - Recalcul automatique de la géométrie et de la longueur
 *   - Sauvegarde sans recréer la route
 *
 * Compatibilité : ne casse pas RoadDrawingManager, RoadValidator.
 * Architecture PostGIS : updateGeometry → PUT /api/routes/:id/geometry
 *
 * Dépend : OpenLayers (ol), geoportail.js (map, lyr_Rseauroutier_6, showToast)
 * =================================================================== */
var RoadGeometryEditorPro = (function() {
  'use strict';

  /* ===== ÉTAT ===== */
  var _active = false;
  var _featureId = null;           /* Index dans json_Rseauroutier_6 */
  var _olFeature = null;           /* Référence OL Feature sur la couche routière */
  var _modifyInteraction = null;
  var _snapInteraction = null;
  var _vertexLayer = null;         /* Couche vectorielle pour afficher les sommets */
  var _vertexSource = null;
  var _selectedVertexIdx = null;   /* Index du sommet sélectionné */
  var _hoverSegmentIdx = null;     /* Index du segment survolé */
  var _hoverCoord = null;
  var _snapTolerance = 10;         /* Tolérance snap en pixels (configurable 5-10) */
  var _history = [];               /* Pile undo */
  var _maxHistory = 50;
  var _pointerMoveKey = null;
  var _contextMenuEl = null;
  var _tempOverlay = null;

  /* Callbacks externes */
  var _onGeometryChange = null;    /* Appelé à chaque modification de géométrie */
  var _onVertexSelect = null;      /* Appelé quand un sommet est sélectionné */

  /* ===== COUCHE DE SOMMETS ===== */
  function ensureVertexLayer() {
    if (_vertexLayer) return;
    _vertexSource = new ol.source.Vector();
    _vertexLayer = new ol.layer.Vector({
      source: _vertexSource,
      style: function(feature) {
        var isSelected = feature.get('vertexSelected') === true;
        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: isSelected ? 8 : 6,
            fill: new ol.style.Fill({
              color: isSelected ? '#B85C38' : 'rgba(200,166,75,0.9)'
            }),
            stroke: new ol.style.Stroke({
              color: '#fff',
              width: isSelected ? 3 : 2
            })
          })
        });
      },
      zIndex: 350
    });
    map.addLayer(_vertexLayer);
  }

  function removeVertexLayer() {
    if (_vertexLayer) {
      map.removeLayer(_vertexLayer);
      _vertexLayer = null;
      _vertexSource = null;
    }
  }

  /* ===== AFFICHAGE DES SOMMETS ===== */
  function renderVertices() {
    if (!_vertexSource || !_olFeature) return;
    _vertexSource.clear();
    _selectedVertexIdx = null;

    var geom = _olFeature.getGeometry();
    var coords = getFlatCoords(geom);

    for (var i = 0; i < coords.length; i++) {
      var vf = new ol.Feature({
        geometry: new ol.geom.Point(coords[i]),
        vertexIndex: i
      });
      _vertexSource.addFeature(vf);
    }
  }

  /**
   * Aplatit les coordonnées d'une géométrie OL en un tableau 2D.
   * Gère LineString et MultiLineString.
   */
  function getFlatCoords(geom) {
    if (!geom) return [];
    var type = geom.getType();
    if (type === 'LineString') {
      return geom.getCoordinates().slice();
    } else if (type === 'MultiLineString') {
      /* Utiliser la première LineString pour l'édition */
      var lines = geom.getLineStrings();
      if (lines.length > 0) return lines[0].getCoordinates().slice();
    }
    return [];
  }

  /* ===================================================================
   * ACTIVATION / DÉSACTIVATION
   * =================================================================== */

  /**
   * Active l'éditeur géométrique pro sur une route existante.
   * @param {number} featureId - Index dans json_Rseauroutier_6
   * @param {ol.Feature} olFeature - Feature OL correspondante
   * @param {function} onGeometryChange - Callback(olFeature, newLength, newVertexCount)
   */
  function activate(featureId, olFeature, onGeometryChange) {
    if (_active) deactivate();

    _active = true;
    _featureId = featureId;
    _olFeature = olFeature;
    _onGeometryChange = onGeometryChange;
    _history = [];

    ensureVertexLayer();
    pushHistory();
    renderVertices();

    /* Créer l'interaction Modify sur la feature */
    var features = new ol.Collection([_olFeature]);
    _modifyInteraction = new ol.interaction.Modify({
      features: features,
      style: new ol.style.Style({
        image: new ol.style.Circle({
          radius: 7,
          fill: new ol.style.Fill({ color: '#C8A64B' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
        }),
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 3 })
      }),
      deleteCondition: function(evt) {
        /* Suppression via la touche Suppr ou Backspace */
        return evt.type === 'keydown' && (evt.keyCode === 46 || evt.keyCode === 8);
      }
    });

    _modifyInteraction.on('modifyend', onModifyEnd);
    _modifyInteraction.on('modifystart', onModifyStart);

    /* Snap sur le réseau routier */
    _snapInteraction = new ol.interaction.Snap({
      source: lyr_Rseauroutier_6.getSource(),
      pixelTolerance: _snapTolerance
    });

    map.addInteraction(_modifyInteraction);
    map.addInteraction(_snapInteraction);

    /* Événement de survol pour détecter les segments */
    _pointerMoveKey = map.on('pointermove', onPointerMove);

    /* Menu contextuel (clic droit pour supprimer un sommet) */
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('click', onDocumentClick);

    /* Raccourcis clavier */
    document.addEventListener('keydown', onKeyDown);

    map.getTargetElement().style.cursor = 'cell';
    showToast('Mode \u00e9dition g\u00e9om\u00e9trique \u2014 Clic droit pour supprimer un sommet', 'draw-polygon');
  }

  function deactivate() {
    _active = false;
    _featureId = null;
    _olFeature = null;
    _selectedVertexIdx = null;
    _hoverSegmentIdx = null;
    _onGeometryChange = null;
    _history = [];

    if (_modifyInteraction) { map.removeInteraction(_modifyInteraction); _modifyInteraction = null; }
    if (_snapInteraction) { map.removeInteraction(_snapInteraction); _snapInteraction = null; }

    removeVertexLayer();
    removeContextMenu();
    removeTempOverlay();

    if (_pointerMoveKey) { ol.Observable.unByKey(_pointerMoveKey); _pointerMoveKey = null; }

    document.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeyDown);

    map.getTargetElement().style.cursor = '';
  }

  /* ===================================================================
   * ÉVÉNEMENTS
   * =================================================================== */

  function onModifyStart() {
    /* Sauvegarder l'état avant modification */
    pushHistory();
  }

  var _modifyNotifyTimer = null;

  function onModifyEnd(evt) {
    /* Recalculer la géométrie */
    syncToGeoJSON();
    renderVertices();

    /* Debounce les notifications pour éviter les doubles appels */
    if (_modifyNotifyTimer) clearTimeout(_modifyNotifyTimer);
    _modifyNotifyTimer = setTimeout(function() {
      _modifyNotifyTimer = null;
      notifyGeometryChange();
      showToast('Géométrie modifiée', 'draw-polygon');
    }, 100);
  }
  function onPointerMove(evt) {
    if (!_active || !_olFeature) return;

    var pixel = evt.pixel;
    var coords = getFlatCoords(_olFeature.getGeometry());

    /* Vérifier si on est sur un sommet */
    var vertexHit = null;
    if (_vertexSource) {
      var vertexFeatures = _vertexSource.getFeaturesAtCoordinate(evt.coordinate, 8);
      if (vertexFeatures.length > 0) {
        vertexHit = vertexFeatures[0].get('vertexIndex');
      }
    }

    /* Vérifier si on est sur un segment (pour ajout de sommet) */
    _hoverSegmentIdx = null;
    _hoverCoord = null;

    if (vertexHit === null && coords.length >= 2) {
      var closest = findClosestSegment(evt.coordinate, coords);
      if (closest && closest.distance < getSnapToleranceMeters()) {
        _hoverSegmentIdx = closest.segmentIndex;
        _hoverCoord = closest.point;
        map.getTargetElement().style.cursor = 'copy';
        showTempOverlay(_hoverCoord, '+');
      } else {
        map.getTargetElement().style.cursor = 'cell';
        removeTempOverlay();
      }
    } else {
      removeTempOverlay();
      if (vertexHit !== null) {
        map.getTargetElement().style.cursor = 'grab';
      }
    }

    /* Sélection visuelle du sommet */
    _selectedVertexIdx = vertexHit;
    updateVertexStyles();
  }

  function onContextMenu(evt) {
    if (!_active) return;

    /* Vérifier qu'on n'est pas dans un input/textarea */
    if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA' || evt.target.tagName === 'SELECT') return;

    evt.preventDefault();

    /* Vérifier si on est sur un sommet */
    var pixel = map.getEventPixel(evt);
    var coord = map.getCoordinateFromPixel(pixel);

    if (_vertexSource) {
      var vertexFeatures = _vertexSource.getFeaturesAtCoordinate(coord, 8);
      if (vertexFeatures.length > 0) {
        var idx = vertexFeatures[0].get('vertexIndex');
        showContextMenu(evt.clientX, evt.clientY, idx);
      } else {
        removeContextMenu();
      }
    }
  }

  function onDocumentClick(evt) {
    if (!_active) return;
    /* Fermer le menu contextuel */
    if (!evt.target.closest('#pro-vertex-context-menu')) {
      removeContextMenu();
    }
  }

  function onKeyDown(evt) {
    if (!_active) return;
    if (evt.target.tagName === 'INPUT' || evt.target.tagName === 'TEXTAREA' || evt.target.tagName === 'SELECT') return;

    /* Ctrl+Z = Undo */
    if ((evt.ctrlKey || evt.metaKey) && evt.key === 'z') {
      evt.preventDefault();
      undo();
    }

    /* Suppr = Supprimer le sommet sélectionné */
    if ((evt.keyCode === 46 || evt.keyCode === 8) && _selectedVertexIdx !== null) {
      evt.preventDefault();
      deleteVertex(_selectedVertexIdx);
    }

    /* Escape = Désactiver l'éditeur */
    if (evt.key === 'Escape') {
      deactivate();
    }
  }

  /* ===================================================================
   * MANIPULATION DES SOMMETS
   * =================================================================== */

  /**
   * Ajoute un sommet sur le segment survolé.
   */
  function addVertexOnSegment() {
    if (_hoverSegmentIdx === null || !_hoverCoord || !_olFeature) return;

    var geom = _olFeature.getGeometry();
    var coords = getFlatCoords(geom);

    /* Vérifier que le nouveau point n'est pas trop proche d'un sommet existant */
    var MIN_DIST_METERS = 1;
    for (var i = 0; i < coords.length; i++) {
      if (haversine(_hoverCoord, coords[i]) < MIN_DIST_METERS) {
        showToast('Trop proche du sommet ' + i + ' (' + MIN_DIST_METERS + 'm minimum)', 'exclamation-triangle');
        return;
      }
    }

    pushHistory();

    var segIdx = _hoverSegmentIdx;

    /* Insérer le nouveau point après le sommet segIdx */
    coords.splice(segIdx + 1, 0, _hoverCoord.slice());

    /* Mettre à jour la géométrie */
    setCoords(geom, coords);

    /* Rafraîchir */
    renderVertices();
    syncToGeoJSON();
    notifyGeometryChange();
    removeTempOverlay();
    _hoverSegmentIdx = null;

    showToast('Sommet ajout\u00e9 au segment ' + segIdx + '-' + (segIdx + 1), 'plus-circle');
  }

  /**
   * Supprime un sommet à l'index donné.
   * @param {number} idx - Index du sommet
   */
  function deleteVertex(idx) {
    if (!_olFeature) return;

    var geom = _olFeature.getGeometry();
    var coords = getFlatCoords(geom);

    /* Minimum 2 sommets pour une polyligne */
    if (coords.length <= 2) {
      showToast('Impossible de supprimer : minimum 2 sommets requis', 'exclamation-triangle');
      return;
    }

    pushHistory();
    coords.splice(idx, 1);
    setCoords(geom, coords);

    renderVertices();
    syncToGeoJSON();
    notifyGeometryChange();
    _selectedVertexIdx = null;

    showToast('Sommet ' + idx + ' supprim\u00e9', 'minus-circle');
  }

  /**
   * Déplace un sommet à de nouvelles coordonnées.
   * @param {number} idx - Index du sommet
   * @param {Array} newCoord - [lon, lat]
   */
  function moveVertex(idx, newCoord) {
    if (!_olFeature) return;
    pushHistory();

    var geom = _olFeature.getGeometry();
    var coords = getFlatCoords(geom);
    coords[idx] = newCoord.slice();
    setCoords(geom, coords);

    renderVertices();
    syncToGeoJSON();
    notifyGeometryChange();
  }

  /* ===================================================================
   * HISTORIQUE (UNDO)
   * =================================================================== */

  function pushHistory() {
    if (!_olFeature) return;
    var geom = _olFeature.getGeometry();
    if (geom) {
      _history.push(geom.clone());
      if (_history.length > _maxHistory) _history.shift();
    }
  }

  function undo() {
    if (_history.length === 0) {
      showToast('Aucune modification \u00e0 annuler', 'info-circle');
      return;
    }
    var prev = _history.pop();
    if (_olFeature && prev) {
      _olFeature.setGeometry(prev);
      renderVertices();
      syncToGeoJSON();
      notifyGeometryChange();
      showToast('Annul\u00e9', 'undo');
    }
  }

  function resetToOriginal() {
    if (_history.length === 0) {
      showToast('Aucun \u00e9tat ant\u00e9rieur', 'info-circle');
      return;
    }
    var original = _history[0];
    if (_olFeature && original) {
      _olFeature.setGeometry(original.clone());
      _history = [];
      renderVertices();
      syncToGeoJSON();
      notifyGeometryChange();
      showToast('G\u00e9om\u00e9trie r\u00e9initialis\u00e9e', 'rotate-left');
    }
  }

  /* ===================================================================
   * SYNCHRONISATION
   * =================================================================== */

  /**
   * Synchronise la géométrie OL vers le GeoJSON global.
   */
  function syncToGeoJSON() {
    if (!_olFeature || _featureId === null) return;
    if (typeof json_Rseauroutier_6 === 'undefined') return;

    var format = new ol.format.GeoJSON();
    var geomJson = format.writeGeometryObject(_olFeature.getGeometry(), {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326'
    });

    /* V3.0 SIG Core : passer par le SIGDataEngine pour la mise à jour géométrique */
    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.updateGeometry(_featureId, geomJson);
    } else {
      /* Fallback : mise à jour directe */
      json_Rseauroutier_6.features[_featureId].geometry = geomJson;

      /* Recalculer la longueur et le nombre de sommets dans les propriétés */
      var length = ol.sphere.getLength(_olFeature.getGeometry());
      var vertices = getFlatCoords(_olFeature.getGeometry()).length;
      json_Rseauroutier_6.features[_featureId].properties.LONGEUR = Math.round(length);
      json_Rseauroutier_6.features[_featureId].properties.Nb_sommets = vertices;

      /* Versioning */
      json_Rseauroutier_6.features[_featureId].properties.lastModified = new Date().toISOString();
      var session = null;
      if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
      json_Rseauroutier_6.features[_featureId].properties.modifiedBy = session ? (session.name || session.username) : 'Utilisateur';
    }
  }

  /**
   * Notifie les callbacks qu'une modification a eu lieu.
   */
  function notifyGeometryChange() {
    if (_onGeometryChange && _olFeature) {
      var length = ol.sphere.getLength(_olFeature.getGeometry());
      var vertices = getFlatCoords(_olFeature.getGeometry()).length;
      _onGeometryChange(_olFeature, length, vertices);
    }
  }

  /**
   * Met à jour la couche OL sans re-render complet.
   * Utilise le refresh du feature seulement.
   */
  function updateFeatureOnMap() {
    if (!_olFeature) return;
    _olFeature.changed();
  }

  /* ===================================================================
   * SNAP INTELLIGENT
   * =================================================================== */

  /**
   * Trouve le segment le plus proche d'un point.
   * @param {Array} point - [lon, lat]
   * @param {Array[]} coords - Coordonnées de la ligne
   * @returns {{ segmentIndex: number, distance: number, point: Array }}
   */
  function findClosestSegment(point, coords) {
    if (coords.length < 2) return null;

    var minDist = Infinity;
    var closestIdx = 0;
    var closestPoint = null;

    for (var i = 0; i < coords.length - 1; i++) {
      var result = closestPointOnSegment(point, coords[i], coords[i + 1]);
      if (result.distance < minDist) {
        minDist = result.distance;
        closestIdx = i;
        closestPoint = result.point;
      }
    }

    return {
      segmentIndex: closestIdx,
      distance: minDist,
      point: closestPoint
    };
  }

  /**
   * Calcule le point le plus proche sur un segment.
   * @param {Array} p - Point de référence [lon, lat]
   * @param {Array} a - Début du segment [lon, lat]
   * @param {Array} b - Fin du segment [lon, lat]
   * @returns {{ distance: number, point: Array }}
   */
  function closestPointOnSegment(p, a, b) {
    var dx = b[0] - a[0];
    var dy = b[1] - a[1];
    var lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      var d = haversine(p, a);
      return { distance: d, point: a.slice() };
    }

    /* Projection du point p sur le segment [a, b] */
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    var projX = a[0] + t * dx;
    var projY = a[1] + t * dy;
    var projPoint = [projX, projY];
    var dist = haversine(p, projPoint);

    return { distance: dist, point: projPoint };
  }

  /**
   * Convertit la tolérance snap en mètres selon le zoom actuel.
   * @returns {number} Distance en mètres
   */
  function getSnapToleranceMeters() {
    /* Approximation : à l'équateur, 1 degré ≈ 111 km */
    var zoom = map.getView().getZoom();
    /* Pixels par degré à ce zoom */
    var resolution = map.getView().getResolution(); /* degrés/pixel */
    return resolution * _snapTolerance * 111320; /* mètres */
  }

  /**
   * Configure la tolérance de snap.
   * @param {number} pixels - Tolérance en pixels (5-20 recommandé)
   */
  function setSnapTolerance(pixels) {
    _snapTolerance = Math.max(1, Math.min(50, pixels));
  }

  /* ===================================================================
   * GÉOMÉTRIE : UTILITAIRES
   * =================================================================== */

  /**
   * Met à jour les coordonnées d'une géométrie OL.
   * Gère LineString et MultiLineString.
   */
  function setCoords(geom, coords) {
    var type = geom.getType();
    if (type === 'LineString') {
      geom.setCoordinates(coords);
    } else if (type === 'MultiLineString') {
      geom.setCoordinates([coords]);
    }
  }

  /* Haversine distance */
  function haversine(a, b) {
    var R = 6371000;
    var dLat = (b[1] - a[1]) * Math.PI / 180;
    var dLon = (b[0] - a[0]) * Math.PI / 180;
    var lat1 = a[1] * Math.PI / 180;
    var lat2 = b[1] * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  /* ===================================================================
   * UI : MENU CONTEXTUEL
   * =================================================================== */

  function showContextMenu(x, y, vertexIdx) {
    removeContextMenu();
    _contextMenuEl = document.createElement('div');
    _contextMenuEl.id = 'pro-vertex-context-menu';
    _contextMenuEl.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:99999;';
    _contextMenuEl.innerHTML =
      '<div class="pro-ctx-item" data-action="delete" data-idx="' + vertexIdx + '">' +
        '<i class="fas fa-trash"></i> Supprimer ce sommet (' + vertexIdx + ')' +
      '</div>' +
      '<div class="pro-ctx-item" data-action="add-before" data-idx="' + vertexIdx + '">' +
        '<i class="fas fa-plus"></i> Ajouter un sommet avant' +
      '</div>' +
      '<div class="pro-ctx-item" data-action="add-after" data-idx="' + vertexIdx + '">' +
        '<i class="fas fa-plus"></i> Ajouter un sommet apr\u00e8s' +
      '</div>';

    document.body.appendChild(_contextMenuEl);

    /* Événements */
    _contextMenuEl.querySelectorAll('.pro-ctx-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var action = this.dataset.action;
        var idx = parseInt(this.dataset.idx, 10);
        removeContextMenu();

        if (action === 'delete') {
          deleteVertex(idx);
        } else if (action === 'add-before' || action === 'add-after') {
          addVertexRelativeTo(idx, action === 'add-after');
        }
      });
    });
  }

  function removeContextMenu() {
    if (_contextMenuEl) {
      if (_contextMenuEl.parentNode) _contextMenuEl.parentNode.removeChild(_contextMenuEl);
      _contextMenuEl = null;
    }
  }

  /**
   * Ajoute un sommet avant ou après un sommet existant.
   */
  function addVertexRelativeTo(refIdx, after) {
    if (!_olFeature) return;

    var geom = _olFeature.getGeometry();
    var coords = getFlatCoords(geom);
    var refCoord = coords[refIdx];
    var nextIdx = after ? Math.min(refIdx + 1, coords.length - 1) : Math.max(refIdx - 1, 0);
    var nextCoord = coords[nextIdx];

    /* Point milieu */
    var midCoord = [
      (refCoord[0] + nextCoord[0]) / 2,
      (refCoord[1] + nextCoord[1]) / 2
    ];

    pushHistory();
    var insertIdx = after ? refIdx + 1 : refIdx;
    coords.splice(insertIdx, 0, midCoord);
    setCoords(geom, coords);

    renderVertices();
    syncToGeoJSON();
    notifyGeometryChange();
    showToast('Sommet ajout\u00e9', 'plus-circle');
  }

  /* ===================================================================
   * UI : OVERLAY TEMPORAIRE (indicateur + sur segment)
   * =================================================================== */

  function showTempOverlay(coord, text) {
    removeTempOverlay();
    var el = document.createElement('div');
    el.className = 'pro-vertex-overlay';
    el.textContent = text || '+';
    _tempOverlay = new ol.Overlay({
      element: el,
      offset: [0, -10],
      positioning: 'bottom-center'
    });
    map.addOverlay(_tempOverlay);
    _tempOverlay.setPosition(coord);
  }

  function removeTempOverlay() {
    if (_tempOverlay) {
      map.removeOverlay(_tempOverlay);
      _tempOverlay = null;
    }
  }

  /* ===================================================================
   * UI : MISE À JOUR DES STYLES DES SOMMETS
   * =================================================================== */

  function updateVertexStyles() {
    if (!_vertexSource) return;
    _vertexSource.getFeatures().forEach(function(vf) {
      vf.set('vertexSelected', vf.get('vertexIndex') === _selectedVertexIdx);
    });
    _vertexSource.changed();
  }

  /* ===================================================================
   * INFO GÉOMÉTRIQUE
   * =================================================================== */

  function getGeometryInfo() {
    if (!_olFeature) return null;
    var geom = _olFeature.getGeometry();
    var length = ol.sphere.getLength(geom);
    var vertices = getFlatCoords(geom).length;
    var ext = geom.getExtent();
    return {
      length: length,
      lengthStr: length > 1000 ? (length / 1000).toFixed(3) + ' km' : length.toFixed(1) + ' m',
      vertices: vertices,
      bbox: ext,
      type: geom.getType()
    };
  }

  /* ===== API PUBLIQUE ===== */
  return {
    activate: activate,
    deactivate: deactivate,
    addVertexOnSegment: addVertexOnSegment,
    deleteVertex: deleteVertex,
    moveVertex: moveVertex,
    undo: undo,
    resetToOriginal: resetToOriginal,
    syncToGeoJSON: syncToGeoJSON,
    updateFeatureOnMap: updateFeatureOnMap,
    getGeometryInfo: getGeometryInfo,
    setSnapTolerance: setSnapTolerance,
    getSnapTolerance: function() { return _snapTolerance; },
    isActive: function() { return _active; },
    getSelectedVertex: function() { return _selectedVertexIdx; }
  };
})();

/* ===== geoportail-sig.js ===== */

/* ===================================================================
 * GeoROAD TOGO — Module SIG (Système d'Information Géographique)
 *
 * Mode Édition cartographique, Drawer latéral, GeometryEditor,
 * Barre d'outils SIG avancée.
 *
 * Intègre : RoadGeometryEditorPro, RoadSync, RoadDrawingManager,
 *           RoadValidator, RoadAttributes, AdministrativeHierarchy.
 *
 * Dépend : OpenLayers (ol), geoportail.js (map, lyr_Rseauroutier_6, showToast)
 * =================================================================== */
var SIGModule = (function() {
  'use strict';

  /* ===== ÉTAT GLOBAL ===== */
  var state = {
    editMode: false,
    activeTool: null,
    selectedFeatureId: null,
    selectedOlFeature: null,
    measureActive: false,
    measureDraw: null,
    measureLayer: null,
    editHistory: [],
    drawerOpen: false,
    drawerDirty: false,
    proEditorActive: false,
    _drawingJustFinished: false   /* Anti-course : bloque singleclick après dessin */
  };

  /* ===== CONFIGURATION ===== */
  var CAT_LABELS = {
    'RN': 'Route Nationale',
    'RR': 'Route R\u00e9gionale',
    'RL': 'Route Locale',
    'RC': 'Route Communale',
    'CU': 'Route Communautaire'
  };

  var CAT_HIGHLIGHT = {
    'CU': '#8B8578',
    'RN': '#ff6011',
    'RR': '#838383',
    'RC': '#c60603',
    'RL': '#da00d2'
  };

  var ETAT_OPTIONS = ['Bon', 'Moyen', 'Mauvais', 'En travaux'];
  var REVET_OPTIONS = ['Bitume', 'Terre', 'Gravier', 'Non revêtu'];
  /* Paires [valeur, libellé] pour sigFormSelect — évite le bug d'affichage des <option> */
  var ETAT_OPTIONS_PAIRS = ETAT_OPTIONS.map(function(v){ return [v, v]; }).concat([['', 'Non défini']]);
  var REVET_OPTIONS_PAIRS = REVET_OPTIONS.map(function(v){ return [v, v]; }).concat([['', 'Non défini']]);

  /* ===== COUCHES OL SUPPLÉMENTAIRES ===== */

  var highlightSource = new ol.source.Vector();
  var highlightLayer = new ol.layer.Vector({
    source: highlightSource,
    style: function(feature) {
      var cls = feature.get('CLASSE') || 'CU';
      var color = CAT_HIGHLIGHT[cls] || '#C8A64B';
      return [
        new ol.style.Style({
          stroke: new ol.style.Stroke({ color: color, width: 8 }),
          image: new ol.style.Circle({
            radius: 7,
            fill: new ol.style.Fill({ color: color }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
          })
        })
      ];
    },
    zIndex: 100
  });
  map.addLayer(highlightLayer);

  var snapIndicatorSource = new ol.source.Vector();
  var snapIndicatorLayer = new ol.layer.Vector({
    source: snapIndicatorSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: 'rgba(200,166,75,0.4)', width: 12, lineCap: 'round' }),
      image: new ol.style.Circle({
        radius: 10,
        fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.25)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(200,166,75,0.6)', width: 2, lineDash: [4, 4] })
      })
    }),
    zIndex: 95
  });
  map.addLayer(snapIndicatorLayer);

  /* Couche de mesure */
  var measureSource = new ol.source.Vector();
  state.measureLayer = new ol.layer.Vector({
    source: measureSource,
    style: new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.15)' }),
      stroke: new ol.style.Stroke({ color: '#C8A64B', width: 2, lineDash: [8, 6] }),
      image: new ol.style.Circle({
        radius: 5,
        fill: new ol.style.Fill({ color: '#C8A64B' }),
        stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
      })
    }),
    zIndex: 200
  });
  map.addLayer(state.measureLayer);

  /* ===== INTERACTIONS OL ===== */
  var modifyInteraction = null;
  var snapInteraction = null;
  var dragPanInteraction = null;
  var proEditorCleanup = null;

  /* ===== RÉFÉRENCES DOM ===== */
  var dom = {};

  function cacheDom() {
    dom.sigToolbar = document.getElementById('sig-toolbar');
    dom.drawer = document.getElementById('sig-drawer');
    dom.drawerBody = document.getElementById('sig-drawer-body');
    dom.drawerOverlay = document.getElementById('sig-drawer-overlay');
  }

  /* ===================================================================
   * 1. MODE ÉDITION / CONSULTATION
   * =================================================================== */

  function enterEditMode() {
    if (!hasEditPermission()) {
      showToast('Accès réservé aux administrateurs — Connectez-vous', 'exclamation-triangle');
      return;
    }
    if (state.editMode) return;
    state.editMode = true;
    dom.sigToolbar.classList.add('visible');
    document.body.classList.add('sig-edit-active');
    setTool('select');
    /* Initialiser la couche PK maintenant que l'utilisateur est en mode édition */
    if (typeof SIGMapLayers !== 'undefined' && typeof SIGMapLayers.init === 'function') {
      try { SIGMapLayers.init(); } catch(e) {}
    }
    showToast('Mode Édition activé — Sélectionnez une route sur la carte', 'pen-to-square');
  }

  function exitEditMode() {
    state.editMode = false;
    dom.sigToolbar.classList.remove('visible');
    document.body.classList.remove('sig-edit-active');
    clearTool();
    closeDrawer();
    clearSelection();
    clearMeasure();
    map.getTargetElement().style.cursor = '';
    showToast('Mode Édition désactivé', 'eye');
  }

  /* ===================================================================
   * 2. BARRE D'OUTILS SIG
   * =================================================================== */

  function setTool(tool) {
    clearToolInteractions();
    state.activeTool = tool;

    var btns = dom.sigToolbar.querySelectorAll('.sig-tool-btn');
    btns.forEach(function(b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });

    if (tool === 'select') {
      enableSelectTool();
    } else if (tool === 'move') {
      enableMoveTool();
    } else if (tool === 'edit' || tool === 'vertex-edit') {
      enableVertexEditTool();
    } else if (tool === 'add-vertex') {
      enableAddVertexTool();
    } else if (tool === 'delete-vertex') {
      enableDeleteVertexTool();
    } else if (tool === 'measure') {
      enableMeasureTool();
    } else if (tool === 'zoom-in') {
      map.getView().animate({ zoom: map.getView().getZoom() + 1, duration: 300 });
      state.activeTool = 'select';
      updateToolBtnUI('select');
    } else if (tool === 'zoom-out') {
      map.getView().animate({ zoom: map.getView().getZoom() - 1, duration: 300 });
      state.activeTool = 'select';
      updateToolBtnUI('select');
    } else if (tool === 'locate') {
      if (typeof geolocateUser === 'function') geolocateUser();
      state.activeTool = 'select';
      updateToolBtnUI('select');
    } else if (tool === 'reset-view') {
      if (typeof lyr_Rseauroutier_6 !== 'undefined') {
        map.getView().fit(lyr_Rseauroutier_6.getSource().getExtent(), {
          size: map.getSize(), maxZoom: 8, duration: 600
        });
      }
      state.activeTool = 'select';
      updateToolBtnUI('select');
      showToast('Vue r\u00e9initialis\u00e9e', 'expand');
    } else if (tool === 'zoom-selected') {
      enableZoomSelectedTool();
    } else if (tool === 'delete') {
      enableDeleteTool();
    }
  }

  function updateToolBtnUI(activeTool) {
    var btns = dom.sigToolbar.querySelectorAll('.sig-tool-btn');
    btns.forEach(function(b) {
      b.classList.toggle('active', b.dataset.tool === activeTool);
    });
  }

  function clearTool() {
    clearToolInteractions();
    state.activeTool = null;
    var btns = dom.sigToolbar.querySelectorAll('.sig-tool-btn');
    btns.forEach(function(b) { b.classList.remove('active'); });
  }

  function clearToolInteractions() {
    if (modifyInteraction) {
      map.removeInteraction(modifyInteraction);
      modifyInteraction = null;
    }
    if (snapInteraction) {
      map.removeInteraction(snapInteraction);
      snapInteraction = null;
    }
    if (dragPanInteraction) {
      map.removeInteraction(dragPanInteraction);
      dragPanInteraction = null;
    }
    if (state.measureDraw) {
      map.removeInteraction(state.measureDraw);
      state.measureDraw = null;
    }
    if (state.proEditorActive && typeof RoadGeometryEditorPro !== 'undefined') {
      RoadGeometryEditorPro.deactivate();
      state.proEditorActive = false;
    }
    if (proEditorCleanup) {
      proEditorCleanup();
      proEditorCleanup = null;
    }
    snapIndicatorSource.clear();
  }

  /* --- Outil Sélection --- */
  function enableSelectTool() {
    map.getTargetElement().style.cursor = 'pointer';
    /* La sélection est gérée par le singleclick handler (onEditSingleClick) */
  }

  /* --- Outil Déplacement (vrai pan/drag) --- */
  function enableMoveTool() {
    map.getTargetElement().style.cursor = 'grab';
    /* Ajouter une interaction DragPan pour le déplacement réel de la carte */
    dragPanInteraction = new ol.interaction.DragPan({
      kinetic: true
    });
    map.addInteraction(dragPanInteraction);

    /* Changer le curseur pendant le drag */
    dragPanInteraction.on('dragstart', function() {
      map.getTargetElement().style.cursor = 'grabbing';
    });
    dragPanInteraction.on('dragend', function() {
      map.getTargetElement().style.cursor = 'grab';
    });
  }

  /* --- Outil Édition sommets --- */
  function enableVertexEditTool() {
    if (!state.selectedOlFeature) {
      showToast('S\u00e9lectionnez d\'abord une route', 'info-circle');
      setTool('select');
      return;
    }
    map.getTargetElement().style.cursor = 'cell';

    if (typeof RoadGeometryEditorPro !== 'undefined') {
      state.proEditorActive = true;

      var onGeomChange = function(olFeature, newLength, newVertexCount) {
        state.drawerDirty = true;
        updateGeometryTab();
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('geometry', {
            featureId: state.selectedFeatureId,
            olFeature: olFeature,
            fullReload: false
          });
        }
        highlightSource.clear();
        var clone = new ol.Feature(olFeature.getGeometry().clone());
        clone.set('CLASSE', state.selectedOlFeature.get('CLASSE'));
        highlightSource.addFeature(clone);
      };

      RoadGeometryEditorPro.activate(state.selectedFeatureId, state.selectedOlFeature, onGeomChange);
      pushEditHistory();
      showToast('Mode \u00e9dition sommets \u2014 D\u00e9placez les sommets', 'draw-polygon');
    } else {
      enableLegacyEditTool();
    }
  }

  /* --- Outil Ajouter un sommet --- */
  function enableAddVertexTool() {
    if (!state.selectedOlFeature) {
      showToast('S\u00e9lectionnez d\'abord une route', 'info-circle');
      setTool('select');
      return;
    }
    map.getTargetElement().style.cursor = 'copy';

    if (typeof RoadGeometryEditorPro !== 'undefined') {
      state.proEditorActive = true;

      var onGeomChange = function(olFeature, newLength, newVertexCount) {
        state.drawerDirty = true;
        updateGeometryTab();
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('geometry', {
            featureId: state.selectedFeatureId,
            olFeature: olFeature,
            fullReload: false
          });
        }
        highlightSource.clear();
        var clone = new ol.Feature(olFeature.getGeometry().clone());
        clone.set('CLASSE', state.selectedOlFeature.get('CLASSE'));
        highlightSource.addFeature(clone);
      };

      RoadGeometryEditorPro.activate(state.selectedFeatureId, state.selectedOlFeature, onGeomChange);
      showToast('Mode ajout sommet \u2014 Cliquez sur un segment pour ins\u00e9rer', 'plus-circle');
    }
  }

  /* --- Outil Supprimer un sommet --- */
  function enableDeleteVertexTool() {
    if (!state.selectedOlFeature) {
      showToast('S\u00e9lectionnez d\'abord une route', 'info-circle');
      setTool('select');
      return;
    }
    map.getTargetElement().style.cursor = 'not-allowed';

    if (typeof RoadGeometryEditorPro !== 'undefined') {
      state.proEditorActive = true;

      var onGeomChange = function(olFeature, newLength, newVertexCount) {
        state.drawerDirty = true;
        updateGeometryTab();
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('geometry', {
            featureId: state.selectedFeatureId,
            olFeature: olFeature,
            fullReload: false
          });
        }
        highlightSource.clear();
        var clone = new ol.Feature(olFeature.getGeometry().clone());
        clone.set('CLASSE', state.selectedOlFeature.get('CLASSE'));
        highlightSource.addFeature(clone);
      };

      RoadGeometryEditorPro.activate(state.selectedFeatureId, state.selectedOlFeature, onGeomChange);
      showToast('Mode suppression sommet \u2014 Clic droit ou Suppr sur un sommet', 'minus-circle');
    }
  }

  /* --- Outil Supprimer (avec confirmation) --- */
  function enableDeleteTool() {
    if (!state.selectedOlFeature || state.selectedFeatureId === null) {
      showToast('S\u00e9lectionnez d\'abord une route \u00e0 supprimer', 'info-circle');
      state.activeTool = 'select';
      updateToolBtnUI('select');
      return;
    }

    var featId = state.selectedFeatureId;
    var featName = '';
    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features[featId]) {
      featName = json_Rseauroutier_6.features[featId].properties.Name || 'Route';
    }

    /* Confirmation via confirm() natif */
    if (confirm('Supprimer "' + featName + '" ? Cette action est irr\u00e9versible.')) {
      if (typeof SIGDataEngine !== 'undefined') {
        SIGDataEngine.deleteFeature(featId);
      } else if (typeof json_Rseauroutier_6 !== 'undefined') {
        json_Rseauroutier_6.features.splice(featId, 1);
      }
      clearSelection();
      highlightSource.clear();
      closeDrawer();
      refreshRoadLayer();
      if (typeof RoadSync !== 'undefined') RoadSync.syncMap(true);
      if (typeof RoadSync !== 'undefined') RoadSync.syncDashboard();
      if (typeof RoadSync !== 'undefined') RoadSync.syncRouteTable();
      showToast('"' + featName + '" supprim\u00e9e', 'trash');
    }

    /* Retourner à l'outil sélection */
    state.activeTool = 'select';
    updateToolBtnUI('select');
  }

  /* --- Outil Zoom sur route sélectionnée --- */
  function enableZoomSelectedTool() {
    if (!state.selectedOlFeature) {
      showToast('Aucune route s\u00e9lectionn\u00e9e', 'info-circle');
      state.activeTool = 'select';
      updateToolBtnUI('select');
      return;
    }
    var ext = state.selectedOlFeature.getGeometry().getExtent();
    map.getView().fit(ext, {
      size: map.getSize(),
      maxZoom: 16,
      padding: state.drawerOpen ? [80, 460, 80, 80] : [80, 80, 80, 80],
      duration: 600
    });
    state.activeTool = 'select';
    updateToolBtnUI('select');
  }

  /* --- Fallback : ancien outil édition avec ol.interaction.Modify --- */
  function enableLegacyEditTool() {
    pushEditHistory();
    var features = new ol.Collection([state.selectedOlFeature]);
    modifyInteraction = new ol.interaction.Modify({
      features: features,
      style: new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: '#C8A64B' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 2 })
        }),
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 3 })
      })
    });

    modifyInteraction.on('modifyend', function() {
      state.drawerDirty = true;
      syncGeometryToGeoJSON();
      updateGeometryTab();
      if (typeof RoadSync !== 'undefined') {
        RoadSync.propagate('geometry', {
          featureId: state.selectedFeatureId,
          olFeature: state.selectedOlFeature,
          fullReload: false
        });
      }
      showToast('G\u00e9om\u00e9trie modifi\u00e9e', 'draw-polygon');
    });

    snapInteraction = new ol.interaction.Snap({
      source: lyr_Rseauroutier_6.getSource(),
      pixelTolerance: 10
    });

    map.addInteraction(modifyInteraction);
    map.addInteraction(snapInteraction);
  }

  /* --- Outil Mesure --- */
  function enableMeasureTool() {
    clearMeasure();
    map.getTargetElement().style.cursor = 'crosshair';
    state.measureActive = true;

    state.measureDraw = new ol.interaction.Draw({
      source: measureSource,
      type: 'LineString',
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: 'rgba(200,166,75,0.6)', width: 2, lineDash: [5, 5] }),
        image: new ol.style.Circle({
          radius: 4,
          fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.8)' })
        })
      })
    });

    state.measureDraw.on('drawstart', function(evt) {
      state.measureSketch = evt.feature;
      var tooltipCoord = evt.coordinate;
      state.measureTooltip = document.createElement('div');
      state.measureTooltip.className = 'sig-measure-tooltip';
      state.measureTooltipOverlay = new ol.Overlay({
        element: state.measureTooltip,
        offset: [0, -15],
        positioning: 'bottom-center'
      });
      map.addOverlay(state.measureTooltipOverlay);

      state.measureSketch.getGeometry().on('change', function(geomEvt) {
        var geom = geomEvt.target;
        var output;
        if (geom instanceof ol.geom.LineString) {
          var len = ol.sphere.getLength(geom);
          output = len > 1000 ? (len / 1000).toFixed(2) + ' km' : len.toFixed(1) + ' m';
        }
        tooltipCoord = geom.getLastCoordinate();
        state.measureTooltip.innerHTML = output;
        state.measureTooltipOverlay.setPosition(tooltipCoord);
      });
    });

    state.measureDraw.on('drawend', function() {
      state.measureTooltip.className = 'sig-measure-tooltip sig-measure-tooltip-static';
      state.measureTooltipOverlay.setOffset([0, -7]);
      state.measureSketch = null;
    });

    map.addInteraction(state.measureDraw);
    showToast('Cliquez pour mesurer des distances', 'ruler');
  }

  function clearMeasure() {
    state.measureActive = false;
    if (state.measureDraw) {
      map.removeInteraction(state.measureDraw);
      state.measureDraw = null;
    }
    if (state.measureTooltipOverlay) {
      map.removeOverlay(state.measureTooltipOverlay);
      state.measureTooltipOverlay = null;
    }
    measureSource.clear();
  }

  /* ===================================================================
   * 3. SÉLECTION DE ROUTES
   * =================================================================== */

  var editHoverOverlay = null;
  var editHoverEl = null;

  function initEditHover() {
    editHoverEl = document.createElement('div');
    editHoverEl.className = 'sig-hover-tooltip';
    editHoverOverlay = new ol.Overlay({
      element: editHoverEl,
      offset: [0, -20],
      positioning: 'bottom-center'
    });
    map.addOverlay(editHoverOverlay);
  }

  function onEditPointerMove(evt) {
    if (!state.editMode) return;
    if (state.activeTool === 'measure' || state.activeTool === 'move') return;
    /* Ne pas montrer le hover tooltip pendant le dessin */
    if (typeof RoadDrawingManager !== 'undefined' && RoadDrawingManager.isActive()) return;

    var pixel = map.getEventPixel(evt.originalEvent);
    var hit = map.hasFeatureAtPixel(pixel, {
      layerFilter: function(l) { return l === lyr_Rseauroutier_6; }
    });

    map.getTargetElement().style.cursor = hit ? 'pointer' : (state.activeTool === 'edit' ? 'cell' : '');

    if (hit && state.activeTool !== 'edit') {
      var feat = map.getFeaturesAtPixel(pixel, {
        layerFilter: function(l) { return l === lyr_Rseauroutier_6; }
      });
      if (feat && feat.length > 0) {
        var name = feat[0].get('Name') || 'Route';
        var cls = feat[0].get('CLASSE') || '';
        editHoverEl.innerHTML = '<strong>' + escapeHtml(name) + '</strong>' + (cls ? '<br><small>' + (CAT_LABELS[cls] || cls) + '</small>' : '');
        editHoverOverlay.setPosition(evt.coordinate);
        editHoverEl.style.display = '';
      }
    } else {
      editHoverEl.style.display = 'none';
    }
  }

  function onEditSingleClick(evt) {
    if (!state.editMode) return;
    /* Bloquer le singleclick juste après un dessin (anti-course) */
    if (state._drawingJustFinished) return;
    if (typeof RoadDrawingManager !== 'undefined' && RoadDrawingManager.isFinishing()) return;
    if (state.activeTool === 'measure') return;
    if (state.activeTool === 'move') return;

    var pixel = evt.pixel;
    var featuresAtPixel = map.getFeaturesAtPixel(pixel, {
      layerFilter: function(l) { return l === lyr_Rseauroutier_6; }
    });

    if (featuresAtPixel && featuresAtPixel.length > 0) {
      var olFeat = featuresAtPixel[0];
      var props = olFeat.getProperties();
      var featIdx = findFeatureIndex(props);
      if (featIdx >= 0) {
        selectFeature(featIdx, olFeat);
      }
    } else {
      /* Clic sur vide : désélectionner */
      if (!evt.originalEvent.target.closest('#sig-drawer') &&
          !evt.originalEvent.target.closest('#sig-toolbar') &&
          !evt.originalEvent.target.closest('#sig-draw-bar') &&
          !evt.originalEvent.target.closest('#map-toolbar') &&
          !evt.originalEvent.target.closest('.modal-overlay')) {
        clearSelection();
      }
    }
  }

  function findFeatureIndex(props) {
    if (!json_Rseauroutier_6 || !json_Rseauroutier_6.features) return -1;
    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var fp = json_Rseauroutier_6.features[i].properties;
      if (fp.Name === props.Name && fp.REGIONS === props.REGIONS && fp.CLASSE === props.CLASSE) {
        return i;
      }
    }
    return -1;
  }

  function selectFeature(idx, olFeature) {
    clearSelection();
    state.selectedFeatureId = idx;
    state.selectedOlFeature = olFeature;
    state.drawerDirty = false;

    /* Surligner sur la carte */
    highlightSource.clear();
    var clone = new ol.Feature(olFeature.getGeometry().clone());
    clone.set('CLASSE', olFeature.get('CLASSE'));
    highlightSource.addFeature(clone);

    /* Zoomer sur la feature */
    var ext = olFeature.getGeometry().getExtent();
    map.getView().fit(ext, { size: map.getSize(), maxZoom: 14, padding: [80, 380, 80, 80], duration: 500 });

    /* Ouvrir le drawer */
    openDrawer(idx);
  }

  function clearSelection() {
    state.selectedFeatureId = null;
    state.selectedOlFeature = null;
    state.drawerDirty = false;
    state.editHistory = [];
    state.proEditorActive = false;
    highlightSource.clear();
    clearToolInteractions();
    closeDrawer();
  }

  /* ===================================================================
   * 4. DRAWER LATÉRAL (Fiche route)
   * =================================================================== */

  function openDrawer(featIdx) {
    state.drawerOpen = true;
    var feature = json_Rseauroutier_6.features[featIdx];
    if (!feature) return;

    var p = feature.properties;
    var km = ((p.LONGEUR || 0) / 1000).toFixed(2);

    var coordsStr = '\u2014';
    if (feature.geometry && feature.geometry.coordinates) {
      var coords = feature.geometry.coordinates;
      if (feature.geometry.type === 'MultiLineString' && coords[0]) {
        var first = coords[0][0];
        var last = coords[0][coords[0].length - 1];
        coordsStr = first[1].toFixed(5) + ', ' + first[0].toFixed(5) + ' \u2192 ' + last[1].toFixed(5) + ', ' + last[0].toFixed(5);
      } else if (feature.geometry.type === 'LineString' && coords[0]) {
        var first2 = coords[0];
        var last2 = coords[coords.length - 1];
        coordsStr = first2[1].toFixed(5) + ', ' + first2[0].toFixed(5) + ' \u2192 ' + last2[1].toFixed(5) + ', ' + last2[0].toFixed(5);
      }
    }

    var catLabel = CAT_LABELS[p.CLASSE] || p.CLASSE || '\u2014';
    var catColor = CAT_HIGHLIGHT[p.CLASSE] || '#C8A64B';

    var statusBadge = '';
    var routeStatus = p.status || 'validated';
    var statusLabels = { 'draft': 'Brouillon', 'validated': 'Valid\u00e9', 'published': 'Publi\u00e9' };
    var statusColors = { 'draft': '#A9A49A', 'validated': 'var(--green-muted)', 'published': 'var(--gold-dark)' };
    var statusIcon = { 'draft': 'fa-file-pen', 'validated': 'fa-check-circle', 'published': 'fa-globe' };
    statusBadge = '<span class="sig-drawer-status" style="background:' + (statusColors[routeStatus] || '#A9A49A') + '">' +
      '<i class="fas ' + (statusIcon[routeStatus] || 'fa-file') + '"></i> ' + (statusLabels[routeStatus] || routeStatus) + '</span>';

    var versionInfo = '';
    if (p.lastModified) {
      versionInfo = '<div class="sig-version-info">' +
        '<i class="fas fa-clock"></i> Modifi\u00e9 : ' + new Date(p.lastModified).toLocaleString('fr-FR') +
        (p.modifiedBy ? ' par <strong>' + escapeHtml(p.modifiedBy) + '</strong>' : '') +
        '</div>';
    }

    var html = '';

    html += '<div class="sig-drawer-header">';
    html += '<div class="sig-drawer-cat" style="border-left-color:' + catColor + '">';
    html += '<h2>' + escapeHtml(p.Name || 'Sans nom') + '</h2>';
    html += '<span class="sig-drawer-badge" style="background:' + catColor + '">' + escapeHtml(catLabel) + '</span>';
    html += ' ' + statusBadge;
    html += '</div>';
    html += '<button class="sig-drawer-close" onclick="SIGModule.closeDrawer()"><i class="fas fa-times"></i></button>';
    html += '</div>';
    if (versionInfo) html += versionInfo;

    html += '<div class="sig-drawer-tabs">';
    html += '<button class="sig-tab active" data-tab="fiche" onclick="SIGModule.switchTab(\'fiche\')"><i class="fas fa-id-card"></i> Fiche</button>';
    html += '<button class="sig-tab" data-tab="edit" onclick="SIGModule.switchTab(\'edit\')"><i class="fas fa-pen"></i> Modifier</button>';
    html += '<button class="sig-tab" data-tab="geometry" onclick="SIGModule.switchTab(\'geometry\')"><i class="fas fa-draw-polygon"></i> G\u00e9om\u00e9trie</button>';
    html += '</div>';

    html += '<div class="sig-drawer-content">';

    /* ONGLET FICHE */
    html += '<div class="sig-tab-panel active" id="sig-tab-fiche">';
    html += '<div class="sig-detail-grid">';
    html += sigDetailField('Nom', p.Name);
    html += sigDetailField('Code', p.Code);
    html += sigDetailField('Origine', p.Origine);
    html += sigDetailField('Destination', p.Destination);
    html += sigDetailField('Cat\u00e9gorie', catLabel);
    html += sigDetailField('Longueur', km + ' km');
    html += sigDetailField('Largeur', p.Largeur ? p.Largeur + ' m' : '\u2014');
    html += sigDetailField('Emprise', (p.EMPRISE || '\u2014') + ' m');
    html += sigDetailField('\u00c9tat', p.Etat || '\u2014');
    html += sigDetailField('Rev\u00eatement', p.Revetement || '\u2014');
    html += sigDetailField('R\u00e9gion', p.REGIONS || '\u2014');
    html += sigDetailField('Pr\u00e9fecture', p.Prefecture || '\u2014');
    html += sigDetailField('Commune', p.Communes || '\u2014');
    html += sigDetailField('Population', p.Pop_Dessertie ? Number(p.Pop_Dessertie).toLocaleString('fr-FR') + ' hab' : '\u2014');
    html += sigDetailField('PK D\u00e9but', p.PK_DEB_X ? p.PK_DEB_X + ', ' + p.PK_DEB_Y : '\u2014');
    html += sigDetailField('PK Fin', p.PK_FIN_X ? p.PK_FIN_X + ', ' + p.PK_FIN_Y : '\u2014');
    html += sigDetailField('Coordonn\u00e9es', coordsStr, true);
    html += sigDetailField('Observations', p.Observations || '\u2014', true);
    html += '</div>';
    html += '</div>';

    /* ONGLET MODIFIER */
    html += '<div class="sig-tab-panel" id="sig-tab-edit">';
    html += '<form id="sig-edit-form" onsubmit="return false;">';
    html += sigFormRow(
      sigFormGroup('Nom *', '<input type="text" name="Name" required value="' + escapeAttr(p.Name || '') + '">'),
      sigFormGroup('Code', '<input type="text" name="Code" value="' + escapeAttr(p.Code || '') + '">')
    );
    html += sigFormRow(
      sigFormGroup('Origine', '<input type="text" name="Origine" value="' + escapeAttr(p.Origine || '') + '">'),
      sigFormGroup('Destination', '<input type="text" name="Destination" value="' + escapeAttr(p.Destination || '') + '">')
    );
    html += sigFormRow(
      sigFormGroup('Cat\u00e9gorie', sigFormSelect('CLASSE', [['CU','Route Communautaire'],['RN','Route Nationale'],['RR','Route R\u00e9gionale'],['RC','Route Communale'],['RL','Route Locale']], p.CLASSE)),
      sigFormGroup('R\u00e9gion', sigFormSelect('REGIONS', [['Centre','Centre'],['Kara','Kara'],['Savanes','Savanes']], p.REGIONS))
    );
    html += sigFormRow(
      sigFormGroup('Longueur (m)', '<input type="number" name="LONGEUR" step="0.01" value="' + (p.LONGEUR || '') + '">'),
      sigFormGroup('Largeur (m)', '<input type="number" name="Largeur" step="0.1" value="' + escapeAttr(p.Largeur || '') + '">')
    );
    html += sigFormRow(
      sigFormGroup('Emprise (m)', '<input type="number" name="EMPRISE" step="1" value="' + (p.EMPRISE || '') + '">'),
      sigFormGroup('Revêtement', sigFormSelect('Revetement', REVET_OPTIONS_PAIRS, p.Revetement || ''))
    );
    html += sigFormRow(
      sigFormGroup('État', sigFormSelect('Etat', ETAT_OPTIONS_PAIRS, p.Etat || '')),
      sigFormGroup('Pr\u00e9fecture', '<input type="text" name="Prefecture" value="' + escapeAttr(p.Prefecture || '') + '">')
    );
    html += sigFormRow(
      sigFormGroup('Communes', '<input type="text" name="Communes" value="' + escapeAttr(p.Communes || '') + '">'),
      sigFormGroup('Pop. desservie', '<input type="number" name="Pop_Dessertie" value="' + escapeAttr(p.Pop_Dessertie || '') + '">')
    );
    html += sigFormRow(
      sigFormGroup('PK D\u00e9but X', '<input type="number" name="PK_DEB_X" value="' + (p.PK_DEB_X || '') + '">'),
      sigFormGroup('PK D\u00e9but Y', '<input type="number" name="PK_DEB_Y" value="' + (p.PK_DEB_Y || '') + '">')
    );
    html += sigFormRow(
      sigFormGroup('PK Fin X', '<input type="number" name="PK_FIN_X" value="' + (p.PK_FIN_X || '') + '">'),
      sigFormGroup('PK Fin Y', '<input type="number" name="PK_FIN_Y" value="' + (p.PK_FIN_Y || '') + '">')
    );
    html += '<div class="sig-form-row-single">';
    html += sigFormGroup('Observations', '<textarea name="Observations" rows="3">' + escapeHtml(p.Observations || '') + '</textarea>');
    html += '</div>';
    html += '</form>';
    html += '</div>';

    /* ONGLET GÉOMÉTRIE */
    html += '<div class="sig-tab-panel" id="sig-tab-geometry">';
    html += '<div class="sig-geo-controls">';
    html += '<p class="sig-geo-desc">Outils d\'\u00e9dition g\u00e9om\u00e9trique. Activez l\'outil "\u00c9dition" dans la barre d\'outils.</p>';
    html += '<div class="sig-geo-btns">';
    html += '<button class="sig-geo-btn" onclick="SIGModule.undoGeometry()"><i class="fas fa-undo"></i> Annuler</button>';
    html += '<button class="sig-geo-btn" onclick="SIGModule.resetGeometry()"><i class="fas fa-rotate-left"></i> R\u00e9initialiser</button>';
    html += '<button class="sig-geo-btn primary" onclick="SIGModule.saveGeometry()"><i class="fas fa-save"></i> Sauvegarder</button>';
    html += '</div></div>';
    html += '<div id="sig-geo-info"></div>';
    html += '</div>';

    html += '</div>';

    /* Pied du drawer */
    html += '<div class="sig-drawer-footer">';
    var canDelete = false;
    if (typeof AdminAuth !== 'undefined') {
      var delSession = AdminAuth.getSession();
      if (delSession && delSession.authenticated) {
        var delRole = (delSession.role || '').toLowerCase();
        canDelete = (delRole === 'administrateur');
      }
    }
    if (canDelete) {
      html += '<button class="sig-drawer-action danger" onclick="SIGModule.deleteSelectedRoute()"><i class="fas fa-trash"></i> Supprimer</button>';
    }
    html += '<div>';
    html += '<button class="sig-drawer-action ghost" onclick="SIGModule.closeDrawer()">Annuler</button>';
    html += '<button class="sig-drawer-action primary" onclick="SIGModule.saveDrawerChanges()"><i class="fas fa-save"></i> Enregistrer</button>';
    html += '</div></div>';

    dom.drawerBody.innerHTML = html;
    dom.drawer.classList.add('open');
    dom.drawerOverlay.classList.add('show');
    updateGeometryTab();
  }

  function closeDrawer() {
    state.drawerOpen = false;
    dom.drawer.classList.remove('open');
    dom.drawerOverlay.classList.remove('show');
  }

  function switchTab(tabName) {
    var tabs = dom.drawer.querySelectorAll('.sig-tab');
    tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tabName); });
    var panels = dom.drawer.querySelectorAll('.sig-tab-panel');
    panels.forEach(function(p) { p.classList.toggle('active', p.id === 'sig-tab-' + tabName); });
    if (tabName === 'geometry') updateGeometryTab();
  }

  /* ===================================================================
   * 5. SAUVEGARDE
   * =================================================================== */

  function saveDrawerChanges() {
    if (!hasEditPermission()) {
      showToast('Permissions insuffisantes', 'exclamation-triangle');
      return;
    }
    if (state.selectedFeatureId === null) return;

    var form = document.getElementById('sig-edit-form');
    if (!form) {
      closeDrawer();
      return;
    }

    var inputs = form.querySelectorAll('input, select, textarea');
    var data = {};
    inputs.forEach(function(el) {
      var v = el.value;
      if (el.type === 'number' && v !== '') v = parseFloat(v);
      data[el.name] = v;
    });

    if (!data.Name || !data.Name.trim()) {
      showToast('Le nom de la route est obligatoire', 'exclamation-triangle');
      return;
    }

    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.updateFeature(state.selectedFeatureId, { properties: data });
    } else {
      json_Rseauroutier_6.features[state.selectedFeatureId].properties = Object.assign(
        json_Rseauroutier_6.features[state.selectedFeatureId].properties,
        data
      );
      if (typeof RoadSync !== 'undefined') {
        RoadSync.propagate('updated', {
          featureId: state.selectedFeatureId,
          olFeature: state.selectedOlFeature,
          fullReload: true
        });
      }
    }

    if (state.selectedOlFeature) {
      Object.keys(data).forEach(function(k) {
        state.selectedOlFeature.set(k, data[k]);
      });
    }

    highlightSource.clear();
    var clone = new ol.Feature(state.selectedOlFeature.getGeometry().clone());
    clone.set('CLASSE', data.CLASSE || state.selectedOlFeature.get('CLASSE'));
    highlightSource.addFeature(clone);

    refreshRoadLayer();
    state.drawerDirty = false;
    showToast('"' + data.Name + '" modifi\u00e9e avec succ\u00e8s', 'check-circle');
    openDrawer(state.selectedFeatureId);
  }

  function deleteSelectedRoute() {
    if (state.selectedFeatureId === null) return;
    var delSession = null;
    if (typeof AdminAuth !== 'undefined') delSession = AdminAuth.getSession();
    if (!delSession || !delSession.authenticated || (delSession.role || '').toLowerCase() !== 'administrateur') {
      showToast('Permissions insuffisantes pour la suppression', 'exclamation-triangle');
      return;
    }
    var p = json_Rseauroutier_6.features[state.selectedFeatureId].properties;
    var name = p.Name || 'cette route';

    var existing = document.getElementById('sig-delete-confirm');
    if (existing) existing.remove();

    var confirmHtml = '<div class="sig-delete-confirm" id="sig-delete-confirm">';
    confirmHtml += '<p>Supprimer <strong>' + escapeHtml(name) + '</strong> ?</p>';
    confirmHtml += '<div>';
    confirmHtml += '<button class="sig-geo-btn ghost" onclick="document.getElementById(\'sig-delete-confirm\').remove()">Annuler</button>';
    confirmHtml += '<button class="sig-geo-btn danger" onclick="SIGModule.confirmDeleteRoute()"><i class="fas fa-trash"></i> Confirmer</button>';
    confirmHtml += '</div></div>';

    dom.drawerBody.insertAdjacentHTML('beforeend', confirmHtml);
  }

  function confirmDeleteRoute() {
    if (state.selectedFeatureId === null) return;
    var cDelSession = null;
    if (typeof AdminAuth !== 'undefined') cDelSession = AdminAuth.getSession();
    if (!cDelSession || !cDelSession.authenticated || (cDelSession.role || '').toLowerCase() !== 'administrateur') {
      showToast('Permissions insuffisantes', 'exclamation-triangle');
      return;
    }
    var name = json_Rseauroutier_6.features[state.selectedFeatureId].properties.Name || 'Route';

    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.deleteFeature(state.selectedFeatureId);
    } else {
      json_Rseauroutier_6.features.splice(state.selectedFeatureId, 1);
    }

    refreshRoadLayer();
    clearSelection();
    showToast('"' + name + '" supprim\u00e9e', 'trash');
  }

  function refreshRoadLayer() {
    if (typeof lyr_Rseauroutier_6 !== 'undefined') {
      var format = new ol.format.GeoJSON();
      var features = format.readFeatures(json_Rseauroutier_6, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      lyr_Rseauroutier_6.getSource().clear();
      lyr_Rseauroutier_6.getSource().addFeatures(features);

      var countBadge = document.querySelector('.lt-count');
      if (countBadge) countBadge.textContent = json_Rseauroutier_6.features.length;
    }
  }

  /* ===================================================================
   * 6. GÉOMETRY EDITOR
   * =================================================================== */

  function pushEditHistory() {
    if (!state.selectedOlFeature) return;
    var geom = state.selectedOlFeature.getGeometry();
    if (geom) {
      state.editHistory.push(geom.clone());
      if (state.editHistory.length > 50) state.editHistory.shift();
    }
  }

  function undoGeometry() {
    if (state.editHistory.length === 0) {
      showToast('Aucune modification \u00e0 annuler', 'info-circle');
      return;
    }
    var prevGeom = state.editHistory.pop();
    if (state.selectedOlFeature && prevGeom) {
      state.selectedOlFeature.setGeometry(prevGeom);
      syncGeometryToGeoJSON();
      highlightSource.clear();
      var clone = new ol.Feature(prevGeom.clone());
      clone.set('CLASSE', state.selectedOlFeature.get('CLASSE'));
      highlightSource.addFeature(clone);
      updateGeometryTab();
      showToast('Modification annul\u00e9e', 'undo');
    }
  }

  function resetGeometry() {
    if (state.editHistory.length === 0) {
      showToast('Aucun \u00e9tat ant\u00e9rieur', 'info-circle');
      return;
    }
    var originalGeom = state.editHistory[0];
    if (state.selectedOlFeature && originalGeom) {
      state.selectedOlFeature.setGeometry(originalGeom.clone());
      state.editHistory = [];
      syncGeometryToGeoJSON();
      highlightSource.clear();
      var clone = new ol.Feature(originalGeom.clone());
      clone.set('CLASSE', state.selectedOlFeature.get('CLASSE'));
      highlightSource.addFeature(clone);
      updateGeometryTab();
      showToast('G\u00e9om\u00e9trie r\u00e9initialis\u00e9e', 'rotate-left');
    }
  }

  function saveGeometry() {
    if (!hasEditPermission()) {
      showToast('Permissions insuffisantes', 'exclamation-triangle');
      return;
    }
    if (!state.selectedOlFeature || state.selectedFeatureId === null) return;

    syncGeometryToGeoJSON();
    refreshRoadLayer();
    state.editHistory = [];
    state.drawerDirty = false;

    var format = new ol.format.GeoJSON();
    var newOlFeat = format.readFeature(
      json_Rseauroutier_6.features[state.selectedFeatureId],
      { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' }
    );
    state.selectedOlFeature = newOlFeat;
    highlightSource.clear();
    var hlClone = new ol.Feature(newOlFeat.getGeometry().clone());
    hlClone.set('CLASSE', newOlFeat.get('CLASSE'));
    highlightSource.addFeature(hlClone);

    updateGeometryTab();
    showToast('G\u00e9om\u00e9trie sauvegard\u00e9e', 'check-circle');
  }

  function syncGeometryToGeoJSON() {
    if (!state.selectedOlFeature || state.selectedFeatureId === null) return;
    var format = new ol.format.GeoJSON();
    var geomJson = format.writeGeometryObject(state.selectedOlFeature.getGeometry(), {
      dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'
    });
    json_Rseauroutier_6.features[state.selectedFeatureId].geometry = geomJson;
  }

  /* ===================================================================
   * 7. INFOS GÉOMÉTRIQUES
   * =================================================================== */

  function computeGeoInfo(geom) {
    var length = ol.sphere.getLength(geom);
    var lengthStr = length > 1000 ? (length / 1000).toFixed(3) + ' km' : length.toFixed(1) + ' m';
    var ext = geom.getExtent();
    var bboxStr = ext[1].toFixed(4) + '\u00b0N, ' + ext[0].toFixed(4) + '\u00b0E | ' +
                 ext[3].toFixed(4) + '\u00b0N, ' + ext[2].toFixed(4) + '\u00b0E';
    var vertices = 0;
    var geomType = geom.getType();
    if (geomType === 'MultiLineString') {
      geom.getLineStrings().forEach(function(ls) { vertices += ls.getCoordinates().length; });
    } else if (geomType === 'LineString') {
      vertices = geom.getCoordinates().length;
    }
    var empriseSurface = '\u2014';
    if (typeof json_Emprise_5 !== 'undefined' && state.selectedFeatureId !== null) {
      var routeProps = json_Rseauroutier_6.features[state.selectedFeatureId].properties;
      for (var i = 0; i < json_Emprise_5.features.length; i++) {
        var ep = json_Emprise_5.features[i].properties;
        if (ep.Name === routeProps.Name && ep.CLASSE === routeProps.CLASSE) {
          if (ep.EMPRISE) {
            var surf = ep.EMPRISE * length;
            empriseSurface = surf > 10000 ? (surf / 10000).toFixed(2) + ' ha' : surf.toFixed(0) + ' m\u00b2';
          }
          break;
        }
      }
    }
    var geomTypeLabels = { 'Point': 'Point', 'LineString': 'Ligne', 'MultiLineString': 'Multiligne', 'Polygon': 'Polygone', 'MultiPolygon': 'Multipolygone' };
    return { length: lengthStr, bbox: bboxStr, vertices: vertices, geomType: geomTypeLabels[geomType] || geomType, empriseSurface: empriseSurface };
  }

  function updateGeometryTab() {
    var el = document.getElementById('sig-geo-info');
    if (!el || !state.selectedOlFeature) return;
    var geom = state.selectedOlFeature.getGeometry();
    if (!geom) return;
    var info = computeGeoInfo(geom);
    var html = '<div class="sig-geo-details">';
    html += sigInfoRow('Type', info.geomType);
    html += sigInfoRow('Sommets', info.vertices);
    html += sigInfoRow('Longueur (calcul\u00e9e)', info.length);
    html += sigInfoRow('BBox', info.bbox);
    html += sigInfoRow('Surface emprise', info.empriseSurface);
    html += '</div>';
    el.innerHTML = html;
  }

  /* ===================================================================
   * HELPERS HTML
   * =================================================================== */

  function sigDetailField(label, value, full) {
    var cls = full ? 'sig-detail-item sig-detail-full' : 'sig-detail-item';
    return '<div class="' + cls + '"><div class="sig-detail-label">' + escapeHtml(label) + '</div><div class="sig-detail-value">' + (value || '\u2014') + '</div></div>';
  }

  function sigInfoRow(label, value) {
    return '<div class="sig-info-row"><span class="sig-info-label">' + label + '</span><span class="sig-info-value">' + value + '</span></div>';
  }

  function sigFormGroup(label, inputHtml) {
    return '<div class="sig-fm-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function sigFormRow(left, right) {
    return '<div class="sig-form-row">' + left + right + '</div>';
  }

  function sigFormSelect(name, options, current) {
    var html = '<select name="' + name + '">';
    options.forEach(function(o) {
      var sel = String(o[0]) === String(current) ? ' selected' : '';
      html += '<option value="' + escapeAttr(o[0]) + '"' + sel + '>' + escapeHtml(o[1]) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ===================================================================
   * RBAC
   * =================================================================== */

  function applyRBACVisibility() {
    if (hasEditPermission()) {
      dom.sigToolbar.style.display = '';
      document.body.classList.add('sig-edit-active');
    } else {
      dom.sigToolbar.style.display = 'none';
      document.body.classList.remove('sig-edit-active');
    }
  }

  function isPublicConsultationMode() {
    return !!(document.body && document.body.getAttribute('data-georoad-mode') === 'public');
  }

  function hasEditPermission() {
    if (isPublicConsultationMode()) return false;
    var session = null;
    if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
    if (!session || !session.authenticated) return false;
    var role = (session.role || '').toLowerCase();
    return role === 'administrateur';
  }

  function applyMode() {
    if (state.editMode) {
      dom.sigToolbar.classList.add('visible');
      document.body.classList.add('sig-edit-active');
    } else {
      dom.sigToolbar.classList.remove('visible');
      document.body.classList.remove('sig-edit-active');
    }
  }

  /* ===================================================================
   * INITIALISATION
   * =================================================================== */

  function init() {
    cacheDom();
    initEditHover();
    applyRBACVisibility();

    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.initialize();
    }


    /* Événements de la carte */
    map.on('pointermove', onEditPointerMove);
    map.on('singleclick', onEditSingleClick);

    /* Outils de la barre SIG */
    dom.sigToolbar.querySelectorAll('.sig-tool-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tool = this.dataset.tool;
        if (tool) setTool(tool);
      });
    });

    /* Drawer overlay */
    dom.drawerOverlay.addEventListener('click', function() {
      closeDrawer();
    });

    /* V4.0: EventBus listeners */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, function(data) {
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('created', { featureId: data.featureId, fullReload: true });
        }
      });
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, function(data) {
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('updated', { featureId: data.featureId, fullReload: true });
        }
      });
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('deleted', { featureId: data.featureId, fullReload: true });
        }
      });
      SIGEventBus.on(SIGEventBus.EVENTS.GEOMETRY_UPDATED, function(data) {
        if (typeof RoadSync !== 'undefined') {
          RoadSync.propagate('geometry', { featureId: data.featureId, fullReload: false });
        }
      });
      SIGEventBus.on(SIGEventBus.EVENTS.DASHBOARD_REFRESH, function() {
        if (typeof RoadSync !== 'undefined') RoadSync.syncDashboard();
      });
      SIGEventBus.on(SIGEventBus.EVENTS.STATS_CHANGED, function() {
        if (typeof RoadSync !== 'undefined') RoadSync.syncDashboard();
      });
    }

    /* Raccourci clavier */
    document.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (!hasEditPermission() && !state.editMode) return;
      if (e.key === 'e' || e.key === 'E') {
        if (!dom.drawer.classList.contains('open')) {
          if (state.editMode) { exitEditMode(); } else { enterEditMode(); }
        }
      }
      if (e.key === 'Escape' && state.editMode) {
        if (dom.drawer.classList.contains('open')) {
          closeDrawer();
        } else {
          exitEditMode();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && state.activeTool === 'edit') {
        e.preventDefault();
        undoGeometry();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ===== API PUBLIQUE ===== */
  return {
    enterEditMode: enterEditMode,
    exitEditMode: exitEditMode,
    setTool: setTool,
    closeDrawer: closeDrawer,
    switchTab: switchTab,
    saveDrawerChanges: saveDrawerChanges,
    deleteSelectedRoute: deleteSelectedRoute,
    confirmDeleteRoute: confirmDeleteRoute,
    undoGeometry: undoGeometry,
    resetGeometry: resetGeometry,
    saveGeometry: saveGeometry,
    getState: function() { return state; },
    getHighlightSource: function() { return highlightSource; },
    refreshRoadLayer: refreshRoadLayer
  };
})();
