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