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
