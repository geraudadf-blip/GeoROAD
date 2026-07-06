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