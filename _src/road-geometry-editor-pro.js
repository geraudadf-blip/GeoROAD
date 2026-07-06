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