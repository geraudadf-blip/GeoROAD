/* ===================================================================
 * GeoROAD TOGO — Admin Route Editor (3-Panel SIG Editor)
 *
 * Standalone SIG page for creating new routes via cartographic drawing.
 * 3-panel layout: Tools | Map | Properties (shown after drawing).
 *
 * Integrates with:
 *   - RoadDrawingManager (drawing interaction)
 *   - RoadAttributes (attribute form)
 *   - RoadValidator (validation)
 *   - RoadSync (post-save synchronization)
 *   - SIGDataEngine (data persistence)
 *   - SIGAuditTrail (audit logging)
 *   - AdministrativeHierarchy (region/prefecture cascade)
 *
 * Auth: Uses georoad_auth sessionStorage (same as admin.html).
 * =================================================================== */
var RouteEditor = (function() {
  'use strict';

  /* ===== ÉTAT ===== */
  var _map = null;
  var _activeTool = 'select';
  var _roadLayer = null;
  var _roadSource = null;
  var _drawLayer = null;
  var _drawSource = null;
  var _highlightLayer = null;
  var _highlightSource = null;
  var _measureLayer = null;
  var _measureSource = null;

  /* Interactions */
  var _selectInteraction = null;
  var _modifyInteraction = null;
  var _snapInteraction = null;
  var _measureInteraction = null;
  var _drawInteractionInternal = null;

  /* Base layers (module scope for switchBaseLayer access) */
  var _baseLayers = [];

  /* Pending data (between drawing and save) */
  var _pendingGeoJSON = null;
  var _pendingOlGeom = null;
  var _pendingGeoInfo = null;
  var _selectedFeatureIdx = null;

  /* ===== AUTH CHECK ===== */
  function checkAuth() {
    try {
      var s = JSON.parse(sessionStorage.getItem('georoad_auth'));
      if (s && s.authenticated) return true;
    } catch (e) {}
    return false;
  }

  /* ===================================================================
   * INITIALISATION
   * =================================================================== */
  function init() {
    /* Auth guard */
    if (!checkAuth()) {
      window.location.href = 'admin-login.html';
      return;
    }

    /* Initialize SIG Core */
    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.initialize();
    }

    /* Initialize hierarchy */
    if (typeof AdministrativeHierarchy !== 'undefined') {
      AdministrativeHierarchy.loadFromGeoJSON();
    }

    /* Create the map */
    createMap();

    /* Wire up tool palette */
    wireTools();

    /* Wire up keyboard shortcuts */
    wireKeyboard();

    /* Set initial tool */
    setTool('select');

    /* Update user info */
    updateUserDisplay();

    /* Log audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('ROUTE_EDITOR_OPENED', 'admin-route-editor', 'Ouverture de l\u2019\u00e9diteur de route');
    }
  }

  /* ===================================================================
   * CARTE OPENLAYERS
   * =================================================================== */
  function createMap() {
    var mapEl = document.getElementById('re-map');
    if (!mapEl) return;

    /* ===== BASE LAYERS (uniquement OSM + Google Hybrid) ===== */
    var baseTileGrid = ol.tilegrid.createXYZ({ maxZoom: 21 });

    var osmLayer = new ol.layer.Tile({
      title: 'OpenStreetMap', type: 'base', baseLayer: true,
      source: new ol.source.XYZ({
        attributions: '© OpenStreetMap contributors',
        crossOrigin: 'anonymous', projection: 'EPSG:3857', tileGrid: baseTileGrid,
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      }), visible: true
    });
    _baseLayers.push(osmLayer);

    var hybridLayer = new ol.layer.Tile({
      title: 'Google Hybrid', type: 'base', baseLayer: true,
      source: new ol.source.XYZ({
        attributions: '© Google',
        crossOrigin: 'anonymous', projection: 'EPSG:3857', tileGrid: baseTileGrid,
        url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
      }), visible: false
    });
    _baseLayers.push(hybridLayer);

    /* Road network layer */
    if (typeof json_Rseauroutier_6 !== 'undefined' && typeof style_Rseauroutier_6 !== 'undefined') {
      var roadFormat = new ol.format.GeoJSON();
      var roadFeatures = roadFormat.readFeatures(json_Rseauroutier_6, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      /* Store the GeoJSON index on each OL feature for reliable tracking */
      roadFeatures.forEach(function(feat, idx) {
        feat.set('_geojsonIdx', idx);
      });
      _roadSource = new ol.source.Vector({ attributions: ' ' });
      _roadSource.addFeatures(roadFeatures);
      _roadLayer = new ol.layer.Vector({
        source: _roadSource,
        style: style_Rseauroutier_6,
        title: 'R\u00e9seau routier'
      });
    }

    /* Draw layer (for new route sketch) */
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

    /* Highlight layer (selected feature) */
    _highlightSource = new ol.source.Vector();
    _highlightLayer = new ol.layer.Vector({
      source: _highlightSource,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 6 }),
        image: new ol.style.Circle({
          radius: 7,
          fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.8)' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 2.5 })
        })
      }),
      zIndex: 250
    });

    /* Measure layer */
    _measureSource = new ol.source.Vector();
    _measureLayer = new ol.layer.Vector({
      source: _measureSource,
      style: new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.1)' }),
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 2, lineDash: [5, 5] })
      }),
      zIndex: 200
    });

    /* Build layer list */
    var layers = _baseLayers.concat([_roadLayer, _highlightLayer, _drawLayer, _measureLayer]).filter(function(l) { return !!l; });

    /* Create map — vue EPSG:4326 comme le géoportail public */
    _map = new ol.Map({
      target: mapEl,
      layers: layers,
      view: new ol.View({
        maxZoom: 22, minZoom: 1, enableRotation: false,
        projection: new ol.proj.Projection({
          code: 'EPSG:4326',
          units: 'degrees'
        }),
        center: [1.2, 8.6],
        zoom: 7
      })
    });

    /* Fit to road extent */
    if (_roadSource) {
      var ext = _roadSource.getExtent();
      if (ext && !isNaN(ext[0])) {
        _map.getView().fit(ext, { size: _map.getSize(), maxZoom: 9, padding: [40, 40, 40, 40] });
      }
    }

    /* Map click → select feature (when in select mode) */
    _map.on('singleclick', onMapSingleClick);
    _map.on('pointermove', onMapPointerMove);

    /* Coordinate display (view en EPSG:4326 — coordonnées déjà en lon/lat) */
    _map.on('pointermove', function(evt) {
      var c = evt.coordinate;
      var display = document.getElementById('re-coords');
      if (display) {
        display.textContent = 'Lat: ' + c[1].toFixed(6) + ', Lon: ' + c[0].toFixed(6);
      }
    });

    _map.on('moveend', function() {
      var zoomEl = document.getElementById('re-zoom');
      if (zoomEl) zoomEl.textContent = 'Zoom: ' + _map.getView().getZoom().toFixed(1);
    });
  }

  /* ===== BASEMAP SWITCHER ===== */
  function switchBaseLayer(title) {
    _baseLayers.forEach(function(lyr) {
      lyr.setVisible(lyr.get('title') === title);
    });
    var activeSelect = document.getElementById('re-basemap-select');
    if (activeSelect) activeSelect.value = title;
    showToast('Fond de carte : ' + title, 'globe');
  }

  /* ===== DRAG PAN INTERACTION (for Move tool) ===== */
  var _dragPanInteraction = null;

  /* ===================================================================
   * TOOL PALETTE
   * =================================================================== */
  function setTool(tool) {
    /* Remove all custom interactions first */
    removeAllInteractions();

    _activeTool = tool;

    /* Update UI */
    var btns = document.querySelectorAll('.re-tool-btn');
    btns.forEach(function(b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });

    /* Update cursor */
    var mapEl = document.getElementById('re-map');
    if (!mapEl) return;

    switch (tool) {
      case 'select':
        addSelectInteraction();
        mapEl.style.cursor = '';
        break;
      case 'draw':
        startDrawing();
        mapEl.style.cursor = 'crosshair';
        break;
      case 'modify':
        addModifyInteraction();
        mapEl.style.cursor = 'grab';
        break;
      case 'move':
        /* OL's default DragPan is always active; just clear custom interactions */
        mapEl.style.cursor = 'grab';
        showToast('D\u00e9placez la carte en cliquant-glissant', 'hand');
        break;
      case 'delete':
        addSelectInteraction();
        mapEl.style.cursor = 'pointer';
        _selectedFeatureIdx = null;
        showToast('Cliquez sur une route pour la supprimer', 'trash');
        break;
      case 'measure':
        addMeasureInteraction();
        mapEl.style.cursor = 'crosshair';
        showToast('Cliquez pour mesurer une distance', 'ruler');
        break;
      case 'zoom-in':
        _map.getView().setZoom(_map.getView().getZoom() + 1);
        setTool('select');
        break;
      case 'zoom-out':
        _map.getView().setZoom(_map.getView().getZoom() - 1);
        setTool('select');
        break;
      case 'fullscreen':
        toggleFullscreen();
        setTool('select');
        break;
      case 'reset':
        if (_roadSource) {
          var ext = _roadSource.getExtent();
          if (ext && !isNaN(ext[0])) {
            _map.getView().fit(ext, { size: _map.getSize(), maxZoom: 9, padding: [40, 40, 40, 40] });
          }
        }
        setTool('select');
        break;
      case 'import':
        triggerImport();
        setTool('select');
        break;
      case 'export':
        triggerExport();
        setTool('select');
        break;
    }
  }

  function wireTools() {
    var btns = document.querySelectorAll('.re-tool-btn');
    btns.forEach(function(b) {
      b.addEventListener('click', function() {
        var tool = this.dataset.tool;
        if (tool) setTool(tool);
      });
    });
  }

  function removeAllInteractions() {
    if (_selectInteraction) { _map.removeInteraction(_selectInteraction); _selectInteraction = null; }
    if (_modifyInteraction) { _map.removeInteraction(_modifyInteraction); _modifyInteraction = null; }
    if (_snapInteraction) { _map.removeInteraction(_snapInteraction); _snapInteraction = null; }
    if (_measureInteraction) { _map.removeInteraction(_measureInteraction); _measureInteraction = null; }
    if (_dragPanInteraction) { _map.removeInteraction(_dragPanInteraction); _dragPanInteraction = null; }
    /* CRITICAL: also remove the draw interaction */
    if (_drawInteractionInternal) { _map.removeInteraction(_drawInteractionInternal); _drawInteractionInternal = null; }
    removeDrawStatusBar();

    /* Also cancel any RoadDrawingManager drawing */
    if (typeof RoadDrawingManager !== 'undefined' && RoadDrawingManager.isActive()) {
      RoadDrawingManager.cancelDrawing();
    }
  }

  /* ===== SELECT INTERACTION ===== */
  function addSelectInteraction() {
    if (!_roadSource) return;
    _selectInteraction = new ol.interaction.Select({
      layers: [_roadLayer],
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 6 }),
        image: new ol.style.Circle({
          radius: 7,
          fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.8)' }),
          stroke: new ol.style.Stroke({ color: '#fff', width: 2.5 })
        })
      })
    });
    _selectInteraction.on('select', onSelectEvent);
    _map.addInteraction(_selectInteraction);
  }

  function onSelectEvent(evt) {
    var selected = evt.selected;
    _highlightSource.clear();

    if (selected.length > 0) {
      var feature = selected[0];
      var featIdx = findFeatureIndex(feature);
      if (featIdx !== null) {
        _selectedFeatureIdx = featIdx;
        _highlightSource.addFeature(feature);
        showPropertiesForFeature(featIdx);
      }
    } else {
      _selectedFeatureIdx = null;
      hidePropertiesPanel();
    }
  }

  function findFeatureIndex(olFeature) {
    if (!olFeature || typeof json_Rseauroutier_6 === 'undefined') return null;
    /* First try the stored index (reliable even after geometry modification) */
    var storedIdx = olFeature.get('_geojsonIdx');
    if (storedIdx !== undefined && storedIdx !== null && storedIdx >= 0 && storedIdx < json_Rseauroutier_6.features.length) {
      return storedIdx;
    }
    /* Fallback: coordinate matching */
    var geom = olFeature.getGeometry();
    if (!geom) return null;
    var coords = geom.getCoordinates();
    if (!coords || coords.length < 2) return null;
    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var f = json_Rseauroutier_6.features[i];
      if (!f.geometry || !f.geometry.coordinates) continue;
      var fc = f.geometry.coordinates;
      if (coords.length === fc.length && coords[0][0] === fc[0][0] && coords[0][1] === fc[0][1]) {
        return i;
      }
    }
    return null;
  }

  /* ===== MODIFY INTERACTION ===== */
  function addModifyInteraction() {
    if (!_roadSource) return;
    _modifyInteraction = new ol.interaction.Modify({ source: _roadSource });
    _snapInteraction = new ol.interaction.Snap({ source: _roadSource });

    _modifyInteraction.on('modifyend', function(evt) {
      /* Update the underlying GeoJSON data */
      var modifiedFeatures = evt.features.getArray();
      modifiedFeatures.forEach(function(modFeature) {
        var idx = findFeatureIndex(modFeature);
        if (idx !== null && typeof json_Rseauroutier_6 !== 'undefined') {
          var format = new ol.format.GeoJSON();
          var newGeom = format.writeGeometryObject(modFeature.getGeometry(), {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:4326'
          });
          json_Rseauroutier_6.features[idx].geometry = newGeom;

          /* Update length */
          var len = ol.sphere.getLength(modFeature.getGeometry());
          json_Rseauroutier_6.features[idx].properties.LONGEUR = Math.round(len);

          /* Update PK */
          var c = modFeature.getGeometry().getCoordinates();
          json_Rseauroutier_6.features[idx].properties.PK_DEB_X = Math.round(c[0][0] * 1000000) / 1000000;
          json_Rseauroutier_6.features[idx].properties.PK_DEB_Y = Math.round(c[0][1] * 1000000) / 1000000;
          json_Rseauroutier_6.features[idx].properties.PK_FIN_X = Math.round(c[c.length - 1][0] * 1000000) / 1000000;
          json_Rseauroutier_6.features[idx].properties.PK_FIN_Y = Math.round(c[c.length - 1][1] * 1000000) / 1000000;
        }
      });

      /* Persist */
      if (typeof SIGPersistence !== 'undefined' && typeof json_Rseauroutier_6 !== 'undefined') {
        SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6);
      }

      /* Audit */
      if (typeof SIGAuditTrail !== 'undefined') {
        SIGAuditTrail.log('GEOMETRY_MODIFIED', 'admin-route-editor', 'G\u00e9om\u00e9trie modifi\u00e9e via outil Modifier');
      }

      showToast('G\u00e9om\u00e9trie mise \u00e0 jour', 'check-circle');
    });

    _map.addInteraction(_modifyInteraction);
    _map.addInteraction(_snapInteraction);
  }

  /* ===== MEASURE INTERACTION ===== */
  function addMeasureInteraction() {
    _measureSource.clear();
    _measureInteraction = new ol.interaction.Draw({
      source: _measureSource,
      type: 'LineString',
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 2, lineDash: [5, 5] })
      })
    });

    _measureInteraction.on('drawend', function(evt) {
      var geom = evt.feature.getGeometry();
      var len = ol.sphere.getLength(geom);
      var lenStr = len > 1000 ? (len / 1000).toFixed(2) + ' km' : len.toFixed(1) + ' m';
      showToast('Mesure : ' + lenStr, 'ruler');
    });

    _map.addInteraction(_measureInteraction);
  }

  /* ===================================================================
   * DRAWING (New Route)
   * =================================================================== */
  function startDrawing() {
    /* Remove any previous draw interaction */
    if (_drawInteractionInternal) {
      _map.removeInteraction(_drawInteractionInternal);
      _drawInteractionInternal = null;
    }
    _drawSource.clear();
    showDrawStatusBar();

    var drawStyle = new ol.style.Style({
      fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.2)' }),
      stroke: new ol.style.Stroke({ color: '#C8A64B', width: 4, lineDash: [10, 6] }),
      image: new ol.style.Circle({
        radius: 7,
        fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.6)' }),
        stroke: new ol.style.Stroke({ color: '#C8A64B', width: 3 })
      })
    });

    var currentSketch = null;

    _drawInteractionInternal = new ol.interaction.Draw({
      source: _drawSource,
      type: 'LineString',
      style: drawStyle,
      minPoints: 2,
      clickTolerance: 5
    });

    _drawInteractionInternal.on('drawstart', function(evt) {
      currentSketch = evt.feature;
      currentSketch.getGeometry().on('change', function() {
        var geom = currentSketch.getGeometry();
        var coords = geom.getCoordinates();
        var len = ol.sphere.getLength(geom);
        var lenStr = len > 1000 ? (len / 1000).toFixed(2) + ' km' : len.toFixed(1) + ' m';
        var vertInfo = coords.length + ' sommet' + (coords.length > 1 ? 's' : '');
        updateDrawStatusBar(vertInfo, lenStr);
      });
    });

    _drawInteractionInternal.on('drawend', function(evt) {
      var feature = evt.feature;
      if (!feature || !feature.getGeometry()) return;
      var coords = feature.getGeometry().getCoordinates();
      if (coords.length < 2) {
        showToast('Ajoutez au moins 2 points', 'info-circle');
        return;
      }
      onDrawingFinished(feature);
    });

    _drawInteractionInternal.on('drawabort', function() {
      showToast('Dessin annul\u00e9', 'undo');
      removeDrawStatusBar();
      setTool('select');
    });

    _map.addInteraction(_drawInteractionInternal);
  }

  function onDrawingFinished(feature) {
    try {
      var geom = feature.getGeometry();
      if (!geom) { showToast('G\u00e9om\u00e9trie invalide', 'exclamation-triangle'); return; }
      var coords = geom.getCoordinates();
      if (!coords || coords.length < 2) {
        showToast('Ajoutez au moins 2 points', 'info-circle');
        return;
      }
      var length = ol.sphere.getLength(geom);

      /* Convert to GeoJSON */
      var format = new ol.format.GeoJSON();
      var geoJSON = format.writeGeometryObject(geom, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });

      /* Store pending data IMMEDIATELY before any cleanup */
      _pendingGeoJSON = geoJSON;
      _pendingOlGeom = geom;
      _pendingGeoInfo = { length: length, vertices: coords.length };

      /* Clear draw layer */
      _drawSource.clear();

      /* Zoom to geometry */
      var ext = geom.getExtent();
      _map.getView().fit(ext, { size: _map.getSize(), maxZoom: 14, padding: [80, 80, 80, 80], duration: 500 });

      /* Remove draw interaction */
      if (_drawInteractionInternal) {
        _map.removeInteraction(_drawInteractionInternal);
        _drawInteractionInternal = null;
      }

      removeDrawStatusBar();

      /* Show the properties panel with form */
      showPropertiesPanelForNewRoute();

      /* Audit */
      if (typeof SIGAuditTrail !== 'undefined') {
        SIGAuditTrail.log('ROUTE_DRAWN', 'admin-route-editor', 'Route dessin\u00e9e : ' + coords.length + ' sommets, ' + length.toFixed(0) + ' m');
      }
    } catch(err) {
      /* console.error removed */;
      showToast('Erreur: ' + err.message, 'exclamation-triangle');
      removeDrawStatusBar();
      setTool('select');
    }
  }

  /* ===== Draw Status Bar ===== */
  function showDrawStatusBar() {
    var bar = document.getElementById('re-draw-status');
    if (bar) {
      bar.style.display = 'flex';
      bar.innerHTML = '<i class="fas fa-draw-polygon"></i> <strong>Mode Dessin</strong> \u2014 Cliquez pour ajouter des points'
        + ' <button onclick="RouteEditor.finishDrawingAction()" style="margin-left:12px;padding:3px 10px;background:#C8A64B;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.72rem;font-family:Outfit,sans-serif;font-weight:600"><i class="fas fa-check"></i> Terminer</button>'
        + ' <button onclick="RouteEditor.undoLastVertexAction()" style="margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.72rem;font-family:Outfit,sans-serif"><i class="fas fa-undo"></i></button>'
        + ' <button onclick="RouteEditor.cancelDrawingAction()" style="margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.72rem;font-family:Outfit,sans-serif"><i class="fas fa-times"></i></button>';
    }
  }

  function updateDrawStatusBar(vertexInfo, lengthStr) {
    var bar = document.getElementById('re-draw-status');
    if (bar) {
      bar.innerHTML = '<i class="fas fa-draw-polygon"></i> <strong>Mode Dessin</strong> \u2014 ' + vertexInfo + ' | ' + lengthStr
        + ' <button onclick=\"RouteEditor.finishDrawingAction()\" style=\"margin-left:12px;padding:3px 10px;background:#C8A64B;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.72rem;font-family:Outfit,sans-serif;font-weight:600\"><i class=\"fas fa-check\"></i> Terminer</button>'
        + ' <button onclick=\"RouteEditor.undoLastVertexAction()\" style=\"margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.72rem;font-family:Outfit,sans-serif\"><i class=\"fas fa-undo\"></i></button>'
        + ' <button onclick=\"RouteEditor.cancelDrawingAction()\" style=\"margin-left:4px;padding:3px 8px;background:rgba(255,255,255,.2);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:.72rem;font-family:Outfit,sans-serif\"><i class=\"fas fa-times\"></i></button>';
    }
  }

  function removeDrawStatusBar() {
    var bar = document.getElementById('re-draw-status');
    if (bar) bar.style.display = 'none';
  }

  /* ===================================================================
   * PROPERTIES PANEL
   * =================================================================== */

  function showPropertiesPanel() {
    var panel = document.getElementById('re-props-panel');
    if (panel) panel.classList.add('open');
  }

  function hidePropertiesPanel() {
    var panel = document.getElementById('re-props-panel');
    if (panel) panel.classList.remove('open');
  }

  /**
   * Show properties for an existing selected feature.
   */
  function showPropertiesForFeature(featIdx) {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var f = json_Rseauroutier_6.features[featIdx];
    if (!f) return;
    var props = f.properties || {};
    var geom = f.geometry;

    /* Calculate geo info */
    var geoInfo = { length: 0, vertices: 0 };
    if (geom) {
      geoInfo.vertices = (geom.coordinates ? geom.coordinates.length : 0);
      geoInfo.length = (props.LONGEUR || 0);
      if (!geoInfo.length && typeof ol !== 'undefined' && ol.sphere) {
        try {
          var fmt = new ol.format.GeoJSON();
          var g = fmt.readGeometry(geom, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
          geoInfo.length = ol.sphere.getLength(g);
        } catch (e) {}
      }
    }

    var html = '';

    /* Header */
    html += '<div class="re-props-header">';
    html += '<h3><i class="fas fa-road" style="color:var(--gold);margin-right:6px"></i> ' + escapeHtml(props.Name || 'Route sans nom') + '</h3>';
    html += '<button class="re-props-close" onclick="RouteEditor.hideProperties()"><i class="fas fa-times"></i></button>';
    html += '</div>';

    /* Geometry info */
    html += '<div class="re-props-section">';
    html += '<div class="re-props-section-title"><i class="fas fa-shapes"></i> Informations g\u00e9om\u00e9triques</div>';
    html += '<div class="re-geo-info">';
    html += '<div class="re-geo-row"><span>Type</span><span>' + (geom ? geom.type : '\u2014') + '</span></div>';
    html += '<div class="re-geo-row"><span>Sommets</span><span>' + geoInfo.vertices + '</span></div>';
    html += '<div class="re-geo-row"><span>Longueur calcul\u00e9e</span><span>' + (geoInfo.length > 1000 ? (geoInfo.length / 1000).toFixed(2) + ' km' : geoInfo.length.toFixed(1) + ' m') + '</span></div>';
    if (geom && geom.coordinates && geom.coordinates.length >= 2) {
      var c0 = geom.coordinates[0], cN = geom.coordinates[geom.coordinates.length - 1];
      html += '<div class="re-geo-row"><span>BBox</span><span>' + c0[1].toFixed(4) + ',' + c0[0].toFixed(4) + ' \u2192 ' + cN[1].toFixed(4) + ',' + cN[0].toFixed(4) + '</span></div>';
    }
    html += '</div></div>';

    /* Form (using RoadAttributes if available) */
    html += '<div class="re-props-section re-props-scroll">';
    if (typeof RoadAttributes !== 'undefined') {
      html += RoadAttributes.renderForm(props, geoInfo);
    } else {
      html += '<p style="padding:16px;color:var(--red)">Module RoadAttributes non charg\u00e9.</p>';
    }
    html += '</div>';

    /* Validation errors container */
    html += '<div id="re-validation-errors" style="display:none"></div>';

    /* Footer */
    html += '<div class="re-props-footer">';
    html += '<button class="re-props-btn danger" onclick="RouteEditor.deleteSelectedFeature()"><i class="fas fa-trash"></i> Supprimer</button>';
    html += '<div class="re-props-btn-group">';
    html += '<button class="re-props-btn ghost" onclick="RouteEditor.hideProperties()">Annuler</button>';
    html += '<button class="re-props-btn primary" onclick="RouteEditor.saveExistingFeature(' + featIdx + ')"><i class="fas fa-save"></i> Enregistrer</button>';
    html += '</div>';
    html += '</div>';

    var panelBody = document.getElementById('re-props-body');
    if (panelBody) panelBody.innerHTML = html;

    showPropertiesPanel();

    /* Init hierarchy cascade */
    if (typeof RoadAttributes !== 'undefined') {
      setTimeout(function() { RoadAttributes.initHierarchyEvents(); }, 50);
    }
  }

  /**
   * Show properties for a newly drawn route.
   */
  function showPropertiesPanelForNewRoute() {
    if (!_pendingGeoJSON || !_pendingGeoInfo) return;

    /* Calculate PK */
    var pk = {};
    if (_pendingOlGeom) {
      var coords = _pendingOlGeom.getCoordinates();
      if (coords && coords.length >= 2) {
        pk = {
          PK_DEB_X: Math.round(coords[0][0] * 1000000) / 1000000,
          PK_DEB_Y: Math.round(coords[0][1] * 1000000) / 1000000,
          PK_FIN_X: Math.round(coords[coords.length - 1][0] * 1000000) / 1000000,
          PK_FIN_Y: Math.round(coords[coords.length - 1][1] * 1000000) / 1000000
        };
      }
    }

    var defaultProps = {
      LONGEUR: Math.round(_pendingGeoInfo.length),
      Nb_sommets: _pendingGeoInfo.vertices,
      PK_DEB_X: pk.PK_DEB_X || '',
      PK_DEB_Y: pk.PK_DEB_Y || '',
      PK_FIN_X: pk.PK_FIN_X || '',
      PK_FIN_Y: pk.PK_FIN_Y || '',
      Date_creation: new Date().toISOString().slice(0, 10),
      Date_maj: new Date().toISOString().slice(0, 10),
      Statut: 'En service'
    };

    var html = '';

    /* Header */
    html += '<div class="re-props-header">';
    html += '<h3><i class="fas fa-plus-circle" style="color:var(--gold);margin-right:6px"></i> Nouvelle route</h3>';
    html += '<button class="re-props-close" onclick="RouteEditor.cancelNewRoute()"><i class="fas fa-times"></i></button>';
    html += '</div>';

    /* Geometry info */
    html += '<div class="re-props-section">';
    html += '<div class="re-props-section-title"><i class="fas fa-shapes"></i> Informations g\u00e9om\u00e9triques</div>';
    html += '<div class="re-geo-info">';
    html += '<div class="re-geo-row"><span>Type</span><span>' + (_pendingGeoJSON.type || 'LineString') + '</span></div>';
    html += '<div class="re-geo-row"><span>Sommets</span><span>' + _pendingGeoInfo.vertices + '</span></div>';
    html += '<div class="re-geo-row"><span>Longueur calcul\u00e9e</span><span>' + (_pendingGeoInfo.length > 1000 ? (_pendingGeoInfo.length / 1000).toFixed(2) + ' km' : _pendingGeoInfo.length.toFixed(1) + ' m') + '</span></div>';
    if (_pendingGeoJSON.coordinates && _pendingGeoJSON.coordinates.length >= 2) {
      var c0 = _pendingGeoJSON.coordinates[0], cN = _pendingGeoJSON.coordinates[_pendingGeoJSON.coordinates.length - 1];
      html += '<div class="re-geo-row"><span>BBox</span><span>' + c0[1].toFixed(4) + ',' + c0[0].toFixed(4) + ' \u2192 ' + cN[1].toFixed(4) + ',' + cN[0].toFixed(4) + '</span></div>';
    }
    html += '</div></div>';

    /* Form */
    html += '<div class="re-props-section re-props-scroll">';
    if (typeof RoadAttributes !== 'undefined') {
      html += RoadAttributes.renderForm(defaultProps, _pendingGeoInfo);
    } else {
      html += '<p style="padding:16px;color:var(--red)">Module RoadAttributes non charg\u00e9.</p>';
    }
    html += '</div>';

    /* Validation errors container */
    html += '<div id="re-validation-errors" style="display:none"></div>';

    /* Footer */
    html += '<div class="re-props-footer">';
    html += '<button class="re-props-btn danger" onclick="RouteEditor.cancelNewRoute()"><i class="fas fa-times"></i> Annuler</button>';
    html += '<div class="re-props-btn-group">';
    html += '<button class="re-props-btn ghost" onclick="RouteEditor.cancelNewRoute()">Fermer</button>';
    html += '<button class="re-props-btn primary" onclick="RouteEditor.saveNewRoute()"><i class="fas fa-save"></i> Enregistrer la route</button>';
    html += '</div>';
    html += '</div>';

    var panelBody = document.getElementById('re-props-body');
    if (panelBody) panelBody.innerHTML = html;

    showPropertiesPanel();

    /* Init hierarchy cascade */
    if (typeof RoadAttributes !== 'undefined') {
      setTimeout(function() { RoadAttributes.initHierarchyEvents(); }, 50);
    }
  }

  /* ===================================================================
   * SAVE / CANCEL / DELETE
   * =================================================================== */

  /**
   * Save a newly drawn route.
   */
  function saveNewRoute() {
    if (!_pendingGeoJSON) {
      showToast('Aucune g\u00e9om\u00e9trie en attente', 'exclamation-triangle');
      return;
    }

    /* Collect form data */
    var attrs = {};
    if (typeof RoadAttributes !== 'undefined') {
      attrs = RoadAttributes.getFormData();
    } else {
      var form = document.getElementById('sig-route-form');
      if (!form) return;
      form.querySelectorAll('input, select, textarea').forEach(function(el) {
        var v = el.value;
        if (el.type === 'number' && v !== '') v = parseFloat(v);
        attrs[el.name] = v;
      });
    }

    /* Validate */
    var context = { allRoutes: getAllRoutesArray() };
    var validation = { valid: true, errors: [], warnings: [] };
    if (typeof RoadValidator !== 'undefined') {
      validation = RoadValidator.validate(attrs, _pendingGeoJSON, context);
    }

    var errorEl = document.getElementById('re-validation-errors');
    if (validation.errors.length > 0) {
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.innerHTML = '<div class="re-validation-error"><i class="fas fa-exclamation-triangle"></i><ul>' +
          validation.errors.map(function(e) { return '<li>' + e + '</li>'; }).join('') +
          '</ul></div>';
      }
      showToast('Veuillez corriger les erreurs', 'exclamation-triangle');
      return;
    }

    /* Show warnings if any */
    if (validation.warnings.length > 0 && errorEl) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = '<div class="re-validation-warning"><i class="fas fa-info-circle"></i><ul>' +
        validation.warnings.map(function(w) { return '<li>' + w + '</li>'; }).join('') +
        '</ul></div>';
    }

    /* Add to GeoJSON */
    var newFeature = {
      type: 'Feature',
      properties: attrs,
      geometry: _pendingGeoJSON
    };

    /* Use SIGDataEngine if available, else direct push */
    if (typeof SIGDataEngine !== 'undefined') {
      try {
        SIGDataEngine.addFeature({
          geometry: _pendingGeoJSON,
          properties: attrs
        });
      } catch (engineErr) {
        showToast('Erreur moteur : ' + engineErr.message, 'exclamation-triangle');
        return;
      }
    } else {
      /* Fallback: direct push */
      if (typeof json_Rseauroutier_6 !== 'undefined') {
        attrs.createdAt = new Date().toISOString();
        attrs.lastModified = new Date().toISOString();
        attrs.status = attrs.status || 'draft';
        var session = null;
        if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
        attrs.modifiedBy = session ? (session.name || session.username) : 'Utilisateur';
        json_Rseauroutier_6.features.push(newFeature);
      }
    }

    /* ===== CLASSEMENT AUTOMATIQUE PAR CATÉGORIE ===== */
    autoClassifyRoute(attrs);

    /* Refresh map layer */
    refreshRoadLayer();

    /* Persist to localStorage */
    if (typeof SIGPersistence !== 'undefined' && typeof json_Rseauroutier_6 !== 'undefined') {
      SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6);
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('ROUTE_CREATED', 'admin-route-editor', 'Route cr\u00e9\u00e9e : ' + (attrs.Name || 'Sans nom'));
    }

    /* ===== SYNCHRONISATION GLOBALE ===== */
    if (typeof RoadSync !== 'undefined') {
      RoadSync.propagate('created', {
        fullReload: true,
        featureId: json_Rseauroutier_6.features.length - 1
      });
    }

    /* Notification */
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.add('route', 'Nouvelle route', (attrs.Name || 'Route') + ' ajout\u00e9e au r\u00e9seau routier');
    }

    /* Clean up */
    var routeName = attrs.Name || 'Route';
    _pendingGeoJSON = null;
    _pendingOlGeom = null;
    _pendingGeoInfo = null;
    hidePropertiesPanel();

    showToast('"' + routeName + '" cr\u00e9\u00e9e avec succ\u00e8s', 'check-circle');

    /* Offer to go back */
    showSaveConfirmation(routeName);
  }

  /**
   * Classe automatiquement la route selon sa catégorie (CLASSE).
   * Le classement garantit que la route apparaît dans la couche
   * correspondante sur la carte (RN, RC, RR, RL, CU).
   * Le champ CLASSE est déjà posé par le formulaire ;
   * cette fonction complète les métadonnées et vérifie la cohérence.
   */
  function autoClassifyRoute(attrs) {
    var classe = attrs.CLASSE || '';
    var CAT_LABELS = { 'RN': 'Route Nationale', 'RC': 'Route Communale', 'RR': 'Route R\u00e9gionale', 'RL': 'Route Locale', 'CU': 'Route Communautaire' };

    if (classe && CAT_LABELS[classe]) {
      /* Vérifier la cohérence entre CLASSE et Code si fourni */
      if (attrs.Code) {
        var codePrefix = attrs.Code.replace(/[0-9]/g, '').toUpperCase();
        if (codePrefix && codePrefix !== classe) {
          /* Auto-corriger le code si incohérent */
          var numPart = attrs.Code.replace(/[^0-9]/g, '');
          attrs.Code = classe + numPart;
        }
      }
      /* Mettre à jour le Type_route pour cohérence */
      if (!attrs.Type_route) {
        var TYPE_MAP = { 'RN': 'Nationale', 'RR': 'R\u00e9gionale', 'RC': 'D\u00e9partementale', 'RL': 'Rurale', 'CU': 'Piste' };
        attrs.Type_route = TYPE_MAP[classe] || '';
      }
    }
  }

  /**
   * Save edits to an existing feature.
   */
  function saveExistingFeature(featIdx) {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    if (featIdx === null || featIdx === undefined) return;

    /* Collect form data */
    var attrs = {};
    if (typeof RoadAttributes !== 'undefined') {
      attrs = RoadAttributes.getFormData();
    } else {
      var form = document.getElementById('sig-route-form');
      if (!form) return;
      form.querySelectorAll('input, select, textarea').forEach(function(el) {
        var v = el.value;
        if (el.type === 'number' && v !== '') v = parseFloat(v);
        attrs[el.name] = v;
      });
    }

    /* Validate */
    var context = { allRoutes: getAllRoutesArray(), existingId: featIdx };
    var validation = { valid: true, errors: [], warnings: [] };
    if (typeof RoadValidator !== 'undefined') {
      validation = RoadValidator.validate(attrs, json_Rseauroutier_6.features[featIdx].geometry, context);
    }

    var errorEl = document.getElementById('re-validation-errors');
    if (validation.errors.length > 0) {
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.innerHTML = '<div class="re-validation-error"><i class="fas fa-exclamation-triangle"></i><ul>' +
          validation.errors.map(function(e) { return '<li>' + e + '</li>'; }).join('') +
          '</ul></div>';
      }
      showToast('Veuillez corriger les erreurs', 'exclamation-triangle');
      return;
    }

    if (validation.warnings.length > 0 && errorEl) {
      errorEl.style.display = 'block';
      errorEl.innerHTML = '<div class="re-validation-warning"><i class="fas fa-info-circle"></i><ul>' +
        validation.warnings.map(function(w) { return '<li>' + w + '</li>'; }).join('') +
        '</ul></div>';
    }

    /* Update the feature */
    json_Rseauroutier_6.features[featIdx].properties = Object.assign(
      json_Rseauroutier_6.features[featIdx].properties || {},
      attrs
    );

    /* Touch version */
    if (typeof RoadSync !== 'undefined') {
      RoadSync.touchVersion(featIdx);
    }

    /* Refresh map */
    refreshRoadLayer();

    /* Persist */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6);
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('ROUTE_UPDATED', 'admin-route-editor', 'Route modifi\u00e9e : ' + (attrs.Name || 'Index ' + featIdx));
    }

    var routeName = attrs.Name || 'Route';
    _selectedFeatureIdx = null;
    _highlightSource.clear();
    hidePropertiesPanel();

    showToast('"' + routeName + '" mise \u00e0 jour', 'check-circle');
  }

  /**
   * Delete the currently selected feature.
   */
  function deleteSelectedFeature() {
    if (_selectedFeatureIdx === null) return;
    if (typeof json_Rseauroutier_6 === 'undefined') return;

    var feat = json_Rseauroutier_6.features[_selectedFeatureIdx];
    var name = (feat && feat.properties && feat.properties.Name) || 'Route';
    var featId = feat.id || _selectedFeatureIdx;

    if (!confirm('Supprimer "' + name + '" ? Cette action est irr\u00e9versible.')) return;

    /* Use SIGDataEngine if available for proper event propagation */
    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.deleteFeature(featId);
    } else {
      json_Rseauroutier_6.features.splice(_selectedFeatureIdx, 1);
    }

    /* Refresh */
    refreshRoadLayer();

    /* Persist */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6);
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('ROUTE_DELETED', 'admin-route-editor', 'Route supprim\u00e9e : ' + name);
    }

    _selectedFeatureIdx = null;
    _highlightSource.clear();
    hidePropertiesPanel();

    showToast('"' + name + '" supprim\u00e9e', 'trash');
  }

  /**
   * Cancel a new route being created.
   */
  function cancelNewRoute() {
    _pendingGeoJSON = null;
    _pendingOlGeom = null;
    _pendingGeoInfo = null;
    _drawSource.clear();
    hidePropertiesPanel();
    setTool('select');
    showToast('Cr\u00e9ation annul\u00e9e', 'undo');
  }

  /* ===== Save Confirmation Dialog ===== */
  function showSaveConfirmation(routeName) {
    var overlay = document.getElementById('re-confirm-overlay');
    var dialog = document.getElementById('re-confirm-dialog');
    if (!overlay || !dialog) return;

    dialog.innerHTML =
      '<div class="re-confirm-icon"><i class="fas fa-check-circle"></i></div>' +
      '<h3>Route enregistr\u00e9e</h3>' +
      '<p>"' + escapeHtml(routeName) + '" a \u00e9t\u00e9 ajout\u00e9e au r\u00e9seau routier.</p>' +
      '<div class="re-confirm-actions">' +
      '<button class="re-props-btn ghost" onclick="RouteEditor.dismissConfirmation()"><i class="fas fa-pen"></i> Dessiner une autre</button>' +
      '<button class="re-props-btn primary" onclick="RouteEditor.goToAdminRoutes()"><i class="fas fa-list"></i> Voir le tableau</button>' +
      '</div>';

    overlay.style.display = 'flex';
  }

  function dismissConfirmation() {
    var overlay = document.getElementById('re-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function goToAdminRoutes() {
    window.location.href = 'admin.html#ajout';
  }

  /* ===================================================================
   * IMPORT / EXPORT
   * =================================================================== */
  function triggerImport() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson,.json,.kml,.gpx,.zip,.csv';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) { document.body.removeChild(input); return; }
      var ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'zip') {
        importShapefile(file);
      } else if (ext === 'kml') {
        importKML(file);
      } else if (ext === 'gpx') {
        importGPX(file);
      } else if (ext === 'csv') {
        importCSV(file);
      } else {
        importGeoJSON(file);
      }
      document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  }

  function importGeoJSON(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var count = 0;
        if (data.type === 'FeatureCollection' && data.features) {
          data.features.forEach(function(f) {
            if (f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')) {
              if (!f.properties) f.properties = {};
              /* Auto-detect and reproject if needed */
              if (data.crs && data.crs.properties && data.crs.properties.name) {
                var crsName = data.crs.properties.name;
                if (crsName.indexOf('32631') !== -1) {
                  f.geometry = reprojectGeometry(f.geometry, 'EPSG:32631', 'EPSG:4326');
                }
              }
              if (typeof SIGDataEngine !== 'undefined') {
                SIGDataEngine.addFeature({ geometry: f.geometry, properties: f.properties });
              } else {
                json_Rseauroutier_6.features.push(f);
              }
              count++;
            }
          });
        } else if (data.type === 'Feature' && data.geometry) {
          if (!data.properties) data.properties = {};
          if (typeof SIGDataEngine !== 'undefined') {
            SIGDataEngine.addFeature({ geometry: data.geometry, properties: data.properties });
          } else {
            json_Rseauroutier_6.features.push(data);
          }
          count = 1;
        }
        if (count > 0) {
          refreshRoadLayer();
          persistData();
          showToast(count + ' route(s) import\u00e9e(s) depuis GeoJSON', 'file-import');
        } else {
          showToast('Aucune LineString trouv\u00e9e dans le fichier', 'exclamation-triangle');
        }
      } catch (err) {
        showToast('Erreur GeoJSON : ' + err.message, 'exclamation-triangle');
      }
    };
    reader.readAsText(file);
  }

  function importShapefile(file) {
    if (typeof shp === 'undefined') {
      showToast('Librairie shp.js non charg\u00e9e. Utilisez le module Import dans l\'administration.', 'exclamation-triangle');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev) {
      shp(ev.target.result).then(function(geojson) {
        var count = 0;
        if (geojson.type === 'FeatureCollection' && geojson.features) {
          geojson.features.forEach(function(f) {
            if (f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')) {
              if (!f.properties) f.properties = {};
              f.geometry = reprojectGeometry(f.geometry, 'EPSG:32631', 'EPSG:4326');
              if (typeof SIGDataEngine !== 'undefined') {
                SIGDataEngine.addFeature({ geometry: f.geometry, properties: f.properties });
              } else {
                json_Rseauroutier_6.features.push(f);
              }
              count++;
            }
          });
        }
        if (count > 0) {
          refreshRoadLayer();
          persistData();
          showToast(count + ' route(s) import\u00e9e(s) depuis Shapefile', 'file-import');
        } else {
          showToast('Aucune LineString trouv\u00e9e dans le Shapefile', 'exclamation-triangle');
        }
      }).catch(function(err) {
        showToast('Erreur Shapefile : ' + err.message, 'exclamation-triangle');
      });
    };
    reader.readAsArrayBuffer(file);
  }

  function importKML(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var format = new ol.format.KML({ extractStyles: false });
        var features = format.readFeatures(ev.target.result, {
          dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'
        });
        var count = 0;
        var geoFormat = new ol.format.GeoJSON();
        features.forEach(function(f) {
          var geom = f.getGeometry();
          if (geom && (geom.getType() === 'LineString' || geom.getType() === 'MultiLineString')) {
            var geoJSON = geoFormat.writeGeometryObject(geom, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
            var props = f.getProperties();
            delete props.geometry;
            if (typeof SIGDataEngine !== 'undefined') {
              SIGDataEngine.addFeature({ geometry: geoJSON, properties: props });
            } else {
              json_Rseauroutier_6.features.push({ type: 'Feature', properties: props, geometry: geoJSON });
            }
            count++;
          }
        });
        if (count > 0) {
          refreshRoadLayer();
          persistData();
          showToast(count + ' route(s) import\u00e9e(s) depuis KML', 'file-import');
        } else {
          showToast('Aucune LineString trouv\u00e9e dans le KML', 'exclamation-triangle');
        }
      } catch (err) {
        showToast('Erreur KML : ' + err.message, 'exclamation-triangle');
      }
    };
    reader.readAsText(file);
  }

  function importGPX(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var format = new ol.format.GPX();
        var features = format.readFeatures(ev.target.result, {
          dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'
        });
        var count = 0;
        var geoFormat = new ol.format.GeoJSON();
        features.forEach(function(f) {
          var geom = f.getGeometry();
          if (geom && (geom.getType() === 'LineString' || geom.getType() === 'MultiLineString')) {
            var geoJSON = geoFormat.writeGeometryObject(geom, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
            var props = f.getProperties();
            delete props.geometry;
            props.Name = props.name || props.Name || 'Route GPX';
            if (typeof SIGDataEngine !== 'undefined') {
              SIGDataEngine.addFeature({ geometry: geoJSON, properties: props });
            } else {
              json_Rseauroutier_6.features.push({ type: 'Feature', properties: props, geometry: geoJSON });
            }
            count++;
          }
        });
        if (count > 0) {
          refreshRoadLayer();
          persistData();
          showToast(count + ' route(s) import\u00e9e(s) depuis GPX', 'file-import');
        } else {
          showToast('Aucun trac\u00e9 trouv\u00e9 dans le GPX', 'exclamation-triangle');
        }
      } catch (err) {
        showToast('Erreur GPX : ' + err.message, 'exclamation-triangle');
      }
    };
    reader.readAsText(file);
  }

  function importCSV(file) {
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var text = ev.target.result;
        var lines = text.trim().split('\n');
        if (lines.length < 2) { showToast('CSV vide ou invalide', 'exclamation-triangle'); return; }
        var headers = lines[0].split(/[,;\t]/).map(function(h) { return h.trim().replace(/^["']|["']$/g, ''); });
        
        /* Auto-detect coordinate columns */
        var coordPattern = [
          { lat: ['latitude', 'lat'], lon: ['longitude', 'lon', 'lng'] },
          { lat: ['lat'], lon: ['lon'] },
          { lat: ['y'], lon: ['x'] },
          { lat: ['northing'], lon: ['easting'] },
          { lat: ['nord'], lon: ['est'] },
          { lat: ['coord_y', 'coord_y'], lon: ['coord_x', 'coord_x'] },
          { lat: ['utm_n'], lon: ['utm_e'] },
          { lat: ['y_utm'], lon: ['x_utm'] }
        ];
        
        var latIdx = -1, lonIdx = -1, detectedCRS = 'EPSG:4326';
        for (var p = 0; p < coordPattern.length; p++) {
          var pat = coordPattern[p];
          for (var li = 0; li < headers.length; li++) {
            if (latIdx === -1 && pat.lat.indexOf(headers[li].toLowerCase()) !== -1) latIdx = li;
            if (lonIdx === -1 && pat.lon.indexOf(headers[li].toLowerCase()) !== -1) lonIdx = li;
          }
          if (latIdx !== -1 && lonIdx !== -1) {
            if (p >= 3) detectedCRS = 'EPSG:32631'; /* UTM patterns */
            break;
          }
          latIdx = -1; lonIdx = -1;
        }
        
        if (latIdx === -1 || lonIdx === -1) {
          showToast('Colonnes de coordonn\u00e9es non d\u00e9tect\u00e9es. Utilisez le module Import dans l\'administration pour l\'association manuelle.', 'exclamation-triangle');
          return;
        }
        
        var coords = [];
        for (var i = 1; i < lines.length; i++) {
          var cols = lines[i].split(/[,;\t]/).map(function(c) { return c.trim().replace(/^["']|["']$/g, ''); });
          var lat = parseFloat(cols[latIdx]);
          var lon = parseFloat(cols[lonIdx]);
          if (!isNaN(lat) && !isNaN(lon)) {
            if (detectedCRS === 'EPSG:32631') {
              var transformed = ol.proj.transform([lon, lat], 'EPSG:32631', 'EPSG:4326');
              coords.push(transformed);
            } else {
              coords.push([lon, lat]);
            }
          }
        }
        
        if (coords.length < 2) { showToast('Pas assez de coordonn\u00e9es valides (minimum 2)', 'exclamation-triangle'); return; }
        
        var geoJSON = { type: 'LineString', coordinates: coords };
        if (typeof RoadValidator !== 'undefined') {
          var result = RoadValidator.validate({}, geoJSON, null);
          if (!result.valid) { showToast('G\u00e9om\u00e9trie invalide : ' + result.errors[0], 'exclamation-triangle'); return; }
        }
        
        _pendingGeoJSON = geoJSON;
        var geomFormat = new ol.format.GeoJSON();
        _pendingOlGeom = geomFormat.readGeometry(geoJSON, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
        _pendingGeoInfo = { length: ol.sphere.getLength(_pendingOlGeom), vertices: coords.length };
        showPropertiesPanelForNewRoute();
        showToast('CSV import\u00e9 : ' + coords.length + ' points (' + detectedCRS + ')', 'file-import');
      } catch (err) {
        showToast('Erreur CSV : ' + err.message, 'exclamation-triangle');
      }
    };
    reader.readAsText(file);
  }

  function reprojectGeometry(geom, fromCRS, toCRS) {
    if (fromCRS === toCRS) return geom;
    if (geom.type === 'LineString') {
      return {
        type: 'LineString',
        coordinates: geom.coordinates.map(function(c) {
          return ol.proj.transform(c, fromCRS, toCRS);
        })
      };
    } else if (geom.type === 'MultiLineString') {
      return {
        type: 'MultiLineString',
        coordinates: geom.coordinates.map(function(line) {
          return line.map(function(c) { return ol.proj.transform(c, fromCRS, toCRS); });
        })
      };
    }
    return geom;
  }

  function persistData() {
    if (typeof SIGPersistence !== 'undefined' && typeof json_Rseauroutier_6 !== 'undefined') {
      SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6);
    }
  }

  function triggerExport() {
    if (typeof json_Rseauroutier_6 === 'undefined') {
      showToast('Aucune donn\u00e9e \u00e0 exporter', 'info-circle');
      return;
    }
    try {
      var dataStr = JSON.stringify(json_Rseauroutier_6, null, 2);
      var blob = new Blob([dataStr], { type: 'application/geo+json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'reseau_routier_georoad.geojson';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
      showToast('GeoJSON export\u00e9', 'file-export');
    } catch (err) {
      showToast('Erreur export : ' + err.message, 'exclamation-triangle');
    }
  }

  /* ===================================================================
   * HELPERS
   * =================================================================== */

  function refreshRoadLayer() {
    if (!_roadSource || !_roadLayer) return;
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var format = new ol.format.GeoJSON();
    var features = format.readFeatures(json_Rseauroutier_6, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:4326'
    });
    /* Re-index each feature */
    features.forEach(function(feat, idx) {
      feat.set('_geojsonIdx', idx);
    });
    _roadSource.clear();
    _roadSource.addFeatures(features);
  }

  function getAllRoutesArray() {
    if (typeof json_Rseauroutier_6 === 'undefined') return [];
    return json_Rseauroutier_6.features.map(function(f, idx) {
      return { id: idx, properties: f.properties };
    });
  }

  function toggleFullscreen() {
    var el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
    }
  }

  function updateUserDisplay() {
    try {
      var s = JSON.parse(sessionStorage.getItem('georoad_auth'));
      if (s) {
        var nameEl = document.getElementById('re-user-name');
        var avatarEl = document.getElementById('re-user-avatar');
        if (nameEl) nameEl.textContent = s.name || 'Administrateur';
        if (avatarEl) avatarEl.textContent = (s.name || 'A').charAt(0).toUpperCase();
      }
    } catch (e) {}
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Map events */
  function onMapSingleClick(evt) {
    if (_activeTool === 'delete') {
      /* Small delay to let the select event fire first */
      setTimeout(function() {
        if (_selectedFeatureIdx !== null) deleteSelectedFeature();
      }, 150);
    }
  }

  function onMapPointerMove(evt) {
    if (evt.dragging) return;
    if (_activeTool === 'select' || _activeTool === 'delete') {
      var hit = _map.hasFeatureAtPixel(evt.pixel, {
        layerFilter: function(l) { return l === _roadLayer; }
      });
      var mapEl = document.getElementById('re-map');
      if (mapEl) mapEl.style.cursor = hit ? 'pointer' : '';
    } else if (_activeTool === 'modify') {
      var hitMod = _map.hasFeatureAtPixel(evt.pixel, {
        layerFilter: function(l) { return l === _roadLayer; }
      });
      var mapEl2 = document.getElementById('re-map');
      if (mapEl2) mapEl2.style.cursor = hitMod ? 'move' : 'default';
    }
  }

  /* ===== KEYBOARD SHORTCUTS ===== */
  function wireKeyboard() {
    document.addEventListener('keydown', function(e) {
      /* Don't intercept when typing in inputs */
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

      /* Escape: cancel current operation */
      if (e.key === 'Escape') {
        e.preventDefault();
        if (_pendingGeoJSON) {
          cancelNewRoute();
        } else {
          hidePropertiesPanel();
          setTool('select');
        }
      }

      /* Ctrl+Z: undo last vertex during drawing */
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && _activeTool === 'draw') {
        e.preventDefault();
        /* RoadDrawingManager undo not applicable here, but we clear last drawn point */
        if (_drawSource) {
          var features = _drawSource.getFeatures();
          if (features.length > 0) {
            var geom = features[features.length - 1].getGeometry();
            if (geom && geom instanceof ol.geom.LineString) {
              var coords = geom.getCoordinates();
              if (coords.length > 2) {
                coords.pop();
                geom.setCoordinates(coords);
              }
            }
          }
        }
      }

      /* Enter: finish drawing */
      if (e.key === 'Enter' && _activeTool === 'draw') {
        e.preventDefault();
        finishDrawingAction();
      }
    });
  }

  /* Toast (lightweight) */
  function showToast(msg, icon) {
    var container = document.getElementById('re-toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 're-toast';
    toast.innerHTML = '<i class="fas fa-' + (icon || 'info-circle') + '"></i> ' + escapeHtml(msg);
    container.appendChild(toast);
    setTimeout(function() { toast.classList.add('fade-out'); }, 2500);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
  }

  /* ===== PUBLIC ACTION METHODS (called from status bar buttons) ===== */
  function finishDrawingAction() {
    if (!_drawInteractionInternal) return;
    try {
      /* Use the OL Draw interaction's own finishDrawing() method
         which properly finalizes the current sketch and adds it to the source.
         This triggers the 'drawend' event automatically. */
      if (typeof _drawInteractionInternal.finishDrawing === 'function') {
        _drawInteractionInternal.finishDrawing();
      } else {
        /* Fallback: remove interaction and check source for features */
        _map.removeInteraction(_drawInteractionInternal);
        _drawInteractionInternal = null;
        var features = _drawSource.getFeatures();
        if (features.length > 0) {
          var lastFeat = features[features.length - 1];
          var geom = lastFeat.getGeometry();
          if (geom && geom.getCoordinates().length >= 2) {
            onDrawingFinished(lastFeat);
            return;
          }
        }
        _drawSource.clear();
        removeDrawStatusBar();
        setTool('select');
        showToast('Aucun trac\u00e9 valide en cours', 'info-circle');
      }
    } catch(e) {
      /* console.error removed */;
      showToast('Erreur: ' + e.message, 'exclamation-triangle');
    }
  }

  function undoLastVertexAction() {
    if (!_drawInteractionInternal) return;
    var features = _drawSource.getFeatures();
    if (features.length > 0) {
      var geom = features[features.length - 1].getGeometry();
      if (geom && geom instanceof ol.geom.LineString) {
        var coords = geom.getCoordinates();
        if (coords.length > 2) {
          coords.pop();
          geom.setCoordinates(coords);
          showToast('Dernier sommet supprim\u00e9', 'undo');
        }
      }
    }
  }

  function cancelDrawingAction() {
    if (_drawInteractionInternal) {
      _map.removeInteraction(_drawInteractionInternal);
      _drawInteractionInternal = null;
    }
    _drawSource.clear();
    removeDrawStatusBar();
    setTool('select');
    showToast('Dessin annul\u00e9', 'undo');
  }

  /* ===== API PUBLIQUE ===== */
  return {
    init: init,
    setTool: setTool,
    hideProperties: hidePropertiesPanel,
    cancelNewRoute: cancelNewRoute,
    saveNewRoute: saveNewRoute,
    saveExistingFeature: saveExistingFeature,
    deleteSelectedFeature: deleteSelectedFeature,
    dismissConfirmation: dismissConfirmation,
    goToAdminRoutes: goToAdminRoutes,
    finishDrawingAction: finishDrawingAction,
    undoLastVertexAction: undoLastVertexAction,
    cancelDrawingAction: cancelDrawingAction,
    switchBaseLayer: switchBaseLayer
  };
})();

/* Auto-init on DOMContentLoaded */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', RouteEditor.init);
} else {
  RouteEditor.init();
}