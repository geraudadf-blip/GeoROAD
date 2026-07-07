/* ===== GEOPORTAIL.JS — GeoROAD TOGO Map Dashboard ===== */
(function() {
  'use strict';

  // 1. Disable yellow highlight
  if (typeof doHighlight !== 'undefined') doHighlight = false;
  if (typeof doHover !== 'undefined') doHover = false;

  // 1b. Toast notification system
  function showToast(msg, icon) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<i class="fas fa-' + (icon || 'check-circle') + '"></i> ' + msg;
    container.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2800);
  }

  // 1c. Preloader dismissal
  function dismissPreloader() {
    var p = document.getElementById('gp-preloader');
    if (p) {
      p.classList.add('hidden');
      setTimeout(function() { if (p.parentNode) p.parentNode.removeChild(p); }, 600);
    }
  }
  map.once('rendercomplete', function() { setTimeout(dismissPreloader, 300); });
  setTimeout(dismissPreloader, 4000); // Fallback

  // 2. Class labels mapping
  var classLabels = {
    'RN': 'Route Nationale',
    'RR': 'Route Régionale',
    'RL': 'Route Locale',
    'RC': 'Route Communale',
    'CU': 'Route Communautaire'
  };

  // 3. Field aliases (French — full wording, no abbreviations)
  var fieldAliases = {
    'Rgion_2': {
      'fid': 'Identifiant', 'COUNTRY': 'Pays', 'NAME_1': 'Région',
      'POP_2022': 'Population totale (2022)', 'POP_RU_TOT': 'Population rurale totale',
      'POP_RU_IMP': 'Population rurale impactée', 'POP_IMAPCT': 'Population impactée (dans un rayon de 2 km)',
      'IAR_%': 'Indice d\'accès rural en %', 'TAUX_HUBN': 'Taux d\'urbanisation en %'
    },
    'Prfecture_3': {
      'fid': 'Identifiant', 'NAME_1': 'Région', 'NAME_2': 'Préfecture',
      'POP_2022': 'Population de la préfecture (2022)',
      'POP_IMPACT': 'Population impactée de la préfecture (dans un rayon de 2 km)',
      'REG_POP_2022': 'Population de la région (2022)',
      'REG_POP_RU_TOT': 'Population rurale totale de la région',
      'REG_POP_RU_IMP': 'Population rurale impactée de la région',
      'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
      'REG_IAR_%': 'Indice d\'accès rural de la région en %',
      'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
    },
    'Canton_4': {
      'fid': 'Identifiant', 'NAME_1': 'Région', 'NAME_2': 'Préfecture', 'NAME_3': 'Canton',
      'PREF_POP_2022': 'Population de la préfecture (2022)',
      'PREF_POP_IMPACT': 'Population impactée de la préfecture (dans un rayon de 2 km)',
      'REG_POP_2022': 'Population de la région (2022)',
      'REG_POP_RU_TOT': 'Population rurale totale de la région',
      'REG_POP_RU_IMP': 'Population rurale impactée de la région',
      'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
      'REG_IAR_%': 'Indice d\'accès rural de la région en %',
      'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
    },
    'Emprise_5': {
      'Name': 'Nom de la route', 'CLASSE': 'Classification routière', 'EMPRISE': 'Largeur d\'emprise en mètres',
      'REGIONS': 'Région desservie',
      'RT_LONGEUR': 'Longueur du tronçon en mètres',
      'RT_PK_DEB_X': 'Point kilométrique de début — Coordonnée X',
      'RT_PK_DEB_Y': 'Point kilométrique de début — Coordonnée Y',
      'RT_PK_FIN_X': 'Point kilométrique de fin — Coordonnée X',
      'RT_PK_FIN_Y': 'Point kilométrique de fin — Coordonnée Y',
      'REG_POP_2022': 'Population de la région (2022)',
      'REG_POP_RU_TOT': 'Population rurale totale de la région',
      'REG_POP_RU_IMP': 'Population rurale impactée de la région',
      'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
      'REG_IAR_%': 'Indice d\'accès rural de la région en %',
      'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
    },
    'Rseauroutier_6': {
      'Name': 'Nom de la route', 'REGIONS': 'Région', 'CLASSE': 'Classification routière',
      'EMPRISE': 'Largeur d\'emprise en mètres', 'LONGEUR': 'Longueur du tronçon en mètres',
      'PK_DEB_X': 'Point kilométrique de début — Coordonnée X',
      'PK_DEB_Y': 'Point kilométrique de début — Coordonnée Y',
      'PK_FIN_X': 'Point kilométrique de fin — Coordonnée X',
      'PK_FIN_Y': 'Point kilométrique de fin — Coordonnée Y',
      'REG_POP_2022': 'Population de la région (2022)',
      'REG_POP_RU_TOT': 'Population rurale totale de la région',
      'REG_POP_RU_IMP': 'Population rurale impactée de la région',
      'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
      'REG_IAR_%': 'Indice d\'accès rural de la région en %',
      'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
    }
  };

  // Clés héritées à masquer dans la table attributaire et l'info panel
  var hiddenKeys = {
    'Canton_4': ['PREF_POP_2022','PREF_POP_IMPACT','REG_POP_2022','REG_POP_RU_TOT','REG_POP_RU_IMP','REG_POP_IMAPCT','REG_IAR_%','REG_TAUX_HUBN'],
    'Prfecture_3': ['REG_POP_2022','REG_POP_RU_TOT','REG_POP_RU_IMP','REG_POP_IMAPCT','REG_IAR_%','REG_TAUX_HUBN'],
    'Emprise_5': ['REG_POP_2022','REG_POP_RU_TOT','REG_POP_RU_IMP','REG_POP_IMAPCT','REG_IAR_%','REG_TAUX_HUBN'],
    'Rseauroutier_6': ['REG_POP_2022','REG_POP_RU_TOT','REG_POP_RU_IMP','REG_POP_IMAPCT','REG_IAR_%','REG_TAUX_HUBN']
  };

  // Layer references
  var layerMap = {
    'satellite': lyr_GoogleSatellite_0,
    'osm': lyr_OpenStreetMap_1,
    'hybrid': lyr_GoogleHybrid_2,
    'Rgion_2': lyr_Rgion_2,
    'Prfecture_3': lyr_Prfecture_3,
    'Canton_4': lyr_Canton_4,
    'Emprise_5': lyr_Emprise_5,
    'Rseauroutier_6': lyr_Rseauroutier_6
  };

  var jsonData = {
    'Rgion_2': json_Rgion_2,
    'Prfecture_3': json_Prfecture_3,
    'Canton_4': json_Canton_4,
    'Emprise_5': json_Emprise_5,
    'Rseauroutier_6': json_Rseauroutier_6
  };

  var layerNames = {
    'Rgion_2': 'Région',
    'Prfecture_3': 'Préfecture',
    'Canton_4': 'Canton',
    'Emprise_5': 'Emprise',
    'Rseauroutier_6': 'Réseau routier'
  };

  // 4. Set OSM invisible by default
  lyr_OpenStreetMap_1.setVisible(false);

  // 5. Layer toggles (base layers: radio-style, others: independent)
  var baseLayerKeys = ['satellite', 'osm', 'hybrid'];
  document.querySelectorAll('.layer-toggle input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var key = this.dataset.layer;
      if (!layerMap[key]) return;
      // Base layer: radio behavior
      if (baseLayerKeys.indexOf(key) !== -1) {
        if (this.checked) {
          baseLayerKeys.forEach(function(bk) {
            if (bk !== key) {
              layerMap[bk].setVisible(false);
              var otherCb = document.querySelector('.layer-toggle input[data-layer="' + bk + '"]');
              if (otherCb) otherCb.checked = false;
            }
          });
          layerMap[key].setVisible(true);
        } else {
          // Don't allow unchecking the last base layer
          var anyChecked = baseLayerKeys.some(function(bk) {
            var c = document.querySelector('.layer-toggle input[data-layer="' + bk + '"]');
            return c && c.checked;
          });
          if (!anyChecked) {
            this.checked = true;
            return;
          }
          layerMap[key].setVisible(false);
        }
      } else {
        layerMap[key].setVisible(this.checked);
      }
    });
  });

  // Opacity sliders
  document.querySelectorAll('.lt-opacity').forEach(function(slider) {
    slider.addEventListener('input', function() {
      var key = this.dataset.opacityLayer;
      if (layerMap[key]) layerMap[key].setOpacity(this.value / 100);
    });
  });

  /* ===== BASEMAP SWITCHER ===== */
  /* Les radios ont width:0; height:0 en CSS (custom toggle),
     donc le 'change' event ne se déclenche pas fiablement.
     On utilise le click sur le parent .layer-toggle à la place. */
  document.querySelectorAll('.layer-toggle').forEach(function(toggle) {
    var radio = toggle.querySelector('input[data-base-layer]');
    if (!radio) return;
    toggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var layerName = radio.dataset.baseLayer;
      /* Forcer le radio checked */
      radio.checked = true;
      /* Décocher les autres radios de fond de carte */
      document.querySelectorAll('[data-base-layer]').forEach(function(r) {
        if (r !== radio) r.checked = false;
      });
      /* Changer le fond de carte */
      if (typeof switchBaseLayer === 'function') {
        switchBaseLayer(layerName);
      }
    });
  });

  // 5b. Feature count badges in sidebar
  var layerCounts = {
    'Rseauroutier_6': json_Rseauroutier_6 ? json_Rseauroutier_6.features.length : 0,
    'Emprise_5': json_Emprise_5 ? json_Emprise_5.features.length : 0,
    'Canton_4': json_Canton_4 ? json_Canton_4.features.length : 0,
    'Prfecture_3': json_Prfecture_3 ? json_Prfecture_3.features.length : 0,
    'Rgion_2': json_Rgion_2 ? json_Rgion_2.features.length : 0
  };
  document.querySelectorAll('.layer-toggle').forEach(function(toggle) {
    var cb = toggle.querySelector('input[data-layer]');
    if (!cb) return;
    var key = cb.dataset.layer;
    var count = layerCounts[key];
    if (count === undefined) return;
    var nameSpan = toggle.querySelector('.lt-name');
    if (nameSpan && !toggle.querySelector('.lt-count')) {
      var badge = document.createElement('span');
      badge.className = 'lt-count';
      badge.textContent = count;
      toggle.appendChild(badge);
    }
  });

  // 6. Sidebar toggle
  // On mobile, start collapsed
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-toggle-btn').classList.add('visible');
  }
  window.toggleSidebar = function() {
    var sb = document.getElementById('sidebar');
    var btn = document.getElementById('sidebar-toggle-btn');
    sb.classList.toggle('collapsed');
    if (sb.classList.contains('collapsed')) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  };

  // 6.5 Duplicate coord marquee for seamless loop
  var coordMarquee = document.getElementById('coord-marquee');
  if (coordMarquee) {
    coordMarquee.innerHTML += '    •    ' + coordMarquee.innerHTML;
  }

  // 7. Coordinate display + Scale bar
  map.on('pointermove', function(evt) {
    var coord = ol.proj.toLonLat(evt.coordinate);
    var lat = coord[1].toFixed(5);
    var lon = coord[0].toFixed(5);
    document.getElementById('coord-display').textContent = 'Lat: ' + lat + ' , Lon: ' + lon;
    document.getElementById('zoom-display').textContent = 'Zoom: ' + map.getView().getZoom().toFixed(1);
  });
  map.on('moveend', function() {
    document.getElementById('zoom-display').textContent = 'Zoom: ' + map.getView().getZoom().toFixed(1);
    updateScaleBar();
  });
  // Initial scale bar
  setTimeout(updateScaleBar, 500);

  // 8. Scale bar (accurate for EPSG:4326 at Togo's latitude)
  function updateScaleBar() {
    var lineEl = document.getElementById('scale-line');
    var textEl = document.getElementById('scale-text');
    if (!lineEl || !textEl) return;

    var view = map.getView();
    var center = view.getCenter();
    var resolution = view.getResolution(); // degrees per pixel

    // Convert degrees/pixel to meters/pixel at the map center latitude
    var lat = center[1]; // degrees
    var degToRad = Math.PI / 180;
    // WGS84 ellipsoid: 1 degree of latitude ≈ 111132.92 - 559.82*cos(2φ) + 1.175*cos(4φ) meters
    // For longitude: multiply by cos(lat)
    var metersPerDegLat = 111132.92 - 559.82 * Math.cos(2 * lat * degToRad) + 1.175 * Math.cos(4 * lat * degToRad);
    var metersPerDegLon = metersPerDegLat * Math.cos(lat * degToRad);
    // Use average meters per degree at this point (good enough for scale bar)
    var mpp = (metersPerDegLat + metersPerDegLon) / 2 * resolution;

    // Target ~120px line, find nice round number
    var targetMeters = mpp * 120;

    // Nice scale steps
    var niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
    var bestMeters = niceSteps[0];
    for (var i = 0; i < niceSteps.length; i++) {
      if (niceSteps[i] <= targetMeters * 1.5) bestMeters = niceSteps[i];
      else break;
    }

    var pxWidth = Math.round(bestMeters / mpp);
    pxWidth = Math.max(40, Math.min(pxWidth, 200));

    lineEl.style.width = pxWidth + 'px';

    if (bestMeters >= 1000) {
      textEl.textContent = (bestMeters / 1000) + ' km';
    } else {
      textEl.textContent = bestMeters + ' m';
    }
  }

  // 9. Global search — indexed + debounced for instant results
  var searchInput = document.getElementById('global-search');
  var searchResults = document.getElementById('search-results');

  // Pre-build search index (once)
  var searchIndex = [];
  (function buildSearchIndex() {
    function add(json, layerKey, nameField, label) {
      if (!json || !json.features) return;
      json.features.forEach(function(f) {
        var n = (f.properties[nameField] || '').trim();
        if (n) searchIndex.push({ layer: layerKey, name: n, feature: f, label: label, _lc: n.toLowerCase() });
      });
    }
    add(json_Rseauroutier_6, 'Rseauroutier_6', 'Name', 'Réseau routier');
    add(json_Prfecture_3, 'Prfecture_3', 'NAME_2', 'Préfecture');
    add(json_Rgion_2, 'Rgion_2', 'NAME_1', 'Région');
    add(json_Canton_4, 'Canton_4', 'NAME_3', 'Canton');
    // Also index secondary names for Préfecture
    if (json_Prfecture_3 && json_Prfecture_3.features) {
      json_Prfecture_3.features.forEach(function(f) {
        var n = (f.properties.NAME_1 || '').trim();
        if (n) searchIndex.push({ layer: 'Prfecture_3', name: n + ' (région)', feature: f, label: 'Préfecture', _lc: n.toLowerCase() });
      });
    }
  })();

  var searchTimer = null;
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    var q = this.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.classList.remove('active'); searchResults.innerHTML = ''; return; }
    searchTimer = setTimeout(function() {
      var results = [];
      for (var i = 0; i < searchIndex.length; i++) {
        if (searchIndex[i]._lc.indexOf(q) !== -1) {
          results.push(searchIndex[i]);
          if (results.length >= 15) break;
        }
      }
      if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item" style="color:var(--text-3)">Aucun résultat</div>';
        searchResults.classList.add('active');
        return;
      }
      searchResults.innerHTML = results.map(function(r, i) {
        return '<div class="search-result-item" data-idx="' + i + '"><div>' + r.name + '</div><div class="sr-layer">' + r.label + '</div></div>';
      }).join('');
      searchResults.classList.add('active');
      searchResults.querySelectorAll('.search-result-item').forEach(function(el, i) {
        el.addEventListener('click', function() {
          var r = results[i];
          zoomToFeature(r.layer, r.feature);
          searchResults.classList.remove('active');
          searchInput.value = r.name;
        });
      });
    }, 80);
  });

  searchInput.addEventListener('blur', function() {
    setTimeout(function() {
      searchResults.classList.remove('active');
      clearKbFocus();
    }, 200);
  });

  // 9b. Keyboard navigation in search results
  var kbFocusIdx = -1;
  var currentSearchResults = [];

  function clearKbFocus() {
    kbFocusIdx = -1;
    searchResults.querySelectorAll('.kb-focus').forEach(function(el) { el.classList.remove('kb-focus'); });
  }

  searchInput.addEventListener('keydown', function(e) {
    var items = searchResults.querySelectorAll('.search-result-item[data-idx]');
    if (!items.length || !searchResults.classList.contains('active')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      kbFocusIdx = Math.min(kbFocusIdx + 1, items.length - 1);
      clearKbFocus();
      items[kbFocusIdx].classList.add('kb-focus');
      items[kbFocusIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      kbFocusIdx = Math.max(kbFocusIdx - 1, 0);
      clearKbFocus();
      items[kbFocusIdx].classList.add('kb-focus');
      items[kbFocusIdx].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && kbFocusIdx >= 0) {
      e.preventDefault();
      items[kbFocusIdx].click();
    } else if (e.key === 'Escape') {
      searchResults.classList.remove('active');
      clearKbFocus();
      searchInput.blur();
    }
  });

  // Store current results reference for keyboard nav (patch into the search callback)
  var _origSearchInputHandler = searchInput.oninput;
  // We patch the results rendering to store reference
  var _origBuildResults = null; // We'll hook via the existing setTimeout callback

  // 7b. Click-to-copy coordinates
  document.getElementById('coord-display').addEventListener('click', function() {
    var text = this.textContent.replace('Lat: ', '').replace('Lon: ', '').trim();
    if (text && text !== '— , —') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          showToast('Coordonnées copiées : ' + text, 'copy');
        });
      } else {
        // Fallback
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Coordonnées copiées : ' + text, 'copy');
      }
    }
  });

  // 10. Zoom to feature - FIXED: uses the source features directly
  function zoomToFeature(layerKey, feature) {
    var source = layerMap[layerKey].getSource();
    var format = new ol.format.GeoJSON();
    var olFeature = format.readFeature(feature, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
    var geom = olFeature.getGeometry();
    if (geom) {
      var ext = geom.getExtent();
      map.getView().fit(ext, { size: map.getSize(), maxZoom: 14, padding: [80, 80, 80, 80], duration: 600 });
    }
  }



  // 12. Modals
  window.openModal = function(id) {
    // Close toolbar menu when opening a modal
    var toolbarMenu = document.getElementById('toolbar-menu');
    var toolbarFab = document.getElementById('toolbar-fab');
    if (toolbarMenu) toolbarMenu.classList.remove('open');
    if (toolbarFab) toolbarFab.classList.remove('active');
    // Close export modal if opening from there
    document.getElementById(id).classList.add('open');
    if (id === 'attr-table-modal') buildAttrTable();
    if (id === 'stats-modal') buildStats();
  };
  window.closeModal = function(id) {
    document.getElementById(id).classList.remove('open');
  };
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  // 13. Attribute Table
  var attrState = { page: 1, perPage: 15, sortKey: null, sortDir: 'asc', filter: '' };

  document.getElementById('attr-layer-select').addEventListener('change', function() {
    attrState.page = 1; attrState.sortKey = null; attrState.filter = '';
    document.getElementById('attr-search-input').value = '';
    buildAttrTable();
  });
  document.getElementById('attr-search-input').addEventListener('input', function() {
    attrState.filter = this.value.toLowerCase();
    attrState.page = 1;
    buildAttrTable();
  });

  function buildAttrTable() {
    var layerKey = document.getElementById('attr-layer-select').value;
    var aliases = fieldAliases[layerKey] || {};
    var data = jsonData[layerKey];
    if (!data) return;

    var features = data.features.slice();
    if (attrState.filter) {
      features = features.filter(function(f) {
        return Object.values(f.properties).some(function(v) {
          return String(v).toLowerCase().indexOf(attrState.filter) !== -1;
        });
      });
    }
    if (attrState.sortKey) {
      var sk = attrState.sortKey;
      var dir = attrState.sortDir === 'asc' ? 1 : -1;
      features.sort(function(a, b) {
        var va = a.properties[sk], vb = b.properties[sk];
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'fr') * dir;
      });
    }

    var total = features.length;
    var totalPages = Math.ceil(total / attrState.perPage) || 1;
    if (attrState.page > totalPages) attrState.page = totalPages;
    var start = (attrState.page - 1) * attrState.perPage;
    var pageFeatures = features.slice(start, start + attrState.perPage);

    var allKeys = [];
    var layerHidden = hiddenKeys[layerKey] || [];
    if (data.features.length > 0) {
      allKeys = Object.keys(data.features[0].properties).filter(function(kk) { return layerHidden.indexOf(kk) === -1; });
    }
    // Réinitialiser le tri si la clé triée est masquée
    if (attrState.sortKey && layerHidden.indexOf(attrState.sortKey) !== -1) {
      attrState.sortKey = null;
    }

    var thead = document.getElementById('attr-thead');
    thead.innerHTML = '<tr>' + allKeys.map(function(k) {
      var label = aliases[k] || k;
      var sortIcon = '';
      if (attrState.sortKey === k) {
        sortIcon = attrState.sortDir === 'asc' ? '<i class="fas fa-sort-up sort-icon"></i>' : '<i class="fas fa-sort-down sort-icon"></i>';
      } else {
        sortIcon = '<i class="fas fa-sort sort-icon" style="opacity:.3"></i>';
      }
      return '<th data-key="' + k + '">' + label + ' ' + sortIcon + '</th>';
    }).join('') + '</tr>';
    thead.querySelectorAll('th').forEach(function(th) {
      th.addEventListener('click', function() {
        var k = this.dataset.key;
        if (attrState.sortKey === k) {
          attrState.sortDir = attrState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          attrState.sortKey = k;
          attrState.sortDir = 'asc';
        }
        buildAttrTable();
      });
    });

    var tbody = document.getElementById('attr-tbody');
    tbody.innerHTML = pageFeatures.map(function(f, idx) {
      return '<tr data-layer="' + layerKey + '" data-fidx="' + (start + idx) + '">' +
        allKeys.map(function(k) {
          var val = f.properties[k];
          var display = val !== null && val !== undefined ? val : '—';
          if (typeof val === 'number') {
            display = Number(val).toLocaleString('fr-FR');
          }
          if ((layerKey === 'Rseauroutier_6' || layerKey === 'Emprise_5') && k === 'CLASSE') {
            var fullName = classLabels[val] || val;
            display = '<span class="cat-badge cat-' + fullName.replace(/\s/g, '') + '">' + fullName + '</span>';
          }
          return '<td>' + display + '</td>';
        }).join('') + '</tr>';
    }).join('');

    tbody.querySelectorAll('tr').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var lk = this.dataset.layer;
        var fidx = parseInt(this.dataset.fidx);
        var feature = jsonData[lk].features[fidx];
        if (feature) {
          zoomToFeature(lk, feature);
        }
      });
    });

    var footer = document.getElementById('attr-table-footer');
    var showing = total === 0 ? 0 : start + 1;
    var showingEnd = Math.min(start + attrState.perPage, total);
    var leftHtml = '<span>' + showing + '–' + showingEnd + ' sur ' + total + '</span>';
    var btns = '';
    btns += '<button ' + (attrState.page <= 1 ? 'disabled' : '') + ' onclick="attrGoPage(' + (attrState.page - 1) + ')"><i class="fas fa-chevron-left"></i></button>';
    for (var p = 1; p <= totalPages; p++) {
      if (totalPages > 7 && Math.abs(p - attrState.page) > 2 && p !== 1 && p !== totalPages) {
        if (p === 2 || p === totalPages - 1) btns += '<button disabled>...</button>';
        continue;
      }
      btns += '<button class="' + (p === attrState.page ? 'active' : '') + '" onclick="attrGoPage(' + p + ')">' + p + '</button>';
    }
    btns += '<button ' + (attrState.page >= totalPages ? 'disabled' : '') + ' onclick="attrGoPage(' + (attrState.page + 1) + ')"><i class="fas fa-chevron-right"></i></button>';
    footer.innerHTML = leftHtml + '<div class="page-btns">' + btns + '</div>';
  }

  window.attrGoPage = function(p) { attrState.page = p; buildAttrTable(); };

  function downloadBlob(blob, filename) {
    if (typeof GeoROADDownload !== 'undefined' && typeof GeoROADDownload.downloadBlob === 'function') {
      GeoROADDownload.downloadBlob(blob, filename);
      return;
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    (document.body || document.documentElement).appendChild(link);
    link.click();
    setTimeout(function() {
      if (link.parentNode) link.parentNode.removeChild(link);
      URL.revokeObjectURL(url);
    }, 400);
  }

  function dataURLToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var meta = parts[0] || '';
    var base64 = parts[1] || '';
    var mimeMatch = meta.match(/data:([^;]+);base64/);
    var mime = mimeMatch ? mimeMatch[1] : 'image/png';
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  // 14. Export CSV
  window.exportLayerCSV = function(layerKey) {
    var data = jsonData[layerKey];
    if (!data) return;
    var aliases = fieldAliases[layerKey] || {};
    var csvHidden = hiddenKeys[layerKey] || [];
    var allKeys = data.features.length > 0 ? Object.keys(data.features[0].properties).filter(function(kk) { return csvHidden.indexOf(kk) === -1; }) : [];
    var csvContent = '\uFEFF';
    csvContent += allKeys.map(function(k) { return '"' + (aliases[k] || k) + '"'; }).join(';') + '\n';
    data.features.forEach(function(f) {
      csvContent += allKeys.map(function(k) {
        var v = f.properties[k];
        if (v === null || v === undefined) return '""';
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(';') + '\n';
    });
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, layerKey + '.csv');
    showToast('Export CSV : ' + (layerNames[layerKey] || layerKey), 'file-csv');
  };

  /* Export GeoJSON */
  window.exportLayerGeoJSON = function(layerKey) {
    var data = jsonData[layerKey];
    if (!data) return;
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/geo+json' });
    downloadBlob(blob, layerKey + '.geojson');
    showToast('Export GeoJSON : ' + (layerNames[layerKey] || layerKey), 'code');
  };

  window.exportAttrCSV = function() {
    var layerKey = document.getElementById('attr-layer-select').value;
    exportLayerCSV(layerKey);
  };

  // 15. Statistics - Enhanced with real data
  function buildStats() {
    var body = document.getElementById('stats-body');
    var roadFeatures = json_Rseauroutier_6.features;
    var regionFeatures = json_Rgion_2.features;

    // Compute road stats
    var byCategory = {};
    var byRegion = {};
    var byCategoryCount = {};
    var totalKm = 0;
    var count = roadFeatures.length;
    roadFeatures.forEach(function(f) {
      var cls = f.properties.CLASSE || 'Autre';
      var reg = f.properties.REGIONS || 'Autre';
      var len = (f.properties.LONGEUR || 0) / 1000;
      byCategory[cls] = (byCategory[cls] || 0) + len;
      byCategoryCount[cls] = (byCategoryCount[cls] || 0) + 1;
      byRegion[reg] = (byRegion[reg] || 0) + len;
      totalKm += len;
    });

    // Compute population stats
    var totalPop = 0;
    var totalPopRurale = 0;
    regionFeatures.forEach(function(f) {
      totalPop += f.properties.POP_2022 || 0;
      totalPopRurale += f.properties.POP_RU_TOT || 0;
    });

    var maxCatKm = Math.max.apply(null, Object.values(byCategory));
    var maxRegKm = Math.max.apply(null, Object.values(byRegion));

    // Intro text
    var introHtml = '<div class="stats-intro">Le réseau routier des régions <strong>Centre</strong>, <strong>Kara</strong> et <strong>Savanes</strong> totalise <strong>' + totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km</strong> de routes desservant une population rurale de <strong>' + totalPopRurale.toLocaleString('fr-FR') + ' habitants</strong>.</div>';

    // Summary cards
    var summaryHtml = '<div class="stats-summary-cards">';
    summaryHtml += '<div class="stat-card"><div class="sc-value">' + totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '</div><div class="sc-label">Longueur totale (km)</div></div>';
    summaryHtml += '<div class="stat-card"><div class="sc-value">' + count + '</div><div class="sc-label">Nombre de tronçons</div></div>';
    summaryHtml += '<div class="stat-card"><div class="sc-value">' + (totalKm / count).toFixed(1) + '</div><div class="sc-label">Longueur moyenne (km)</div></div>';
    summaryHtml += '<div class="stat-card"><div class="sc-value">' + totalPopRurale.toLocaleString('fr-FR') + '</div><div class="sc-label">Population rurale totale</div></div>';
    summaryHtml += '</div>';

    // Bar chart by category (full names)
    var catOrder = ['CU', 'RN', 'RR', 'RC', 'RL'];
    var catCssClass = { 'RN': 'c-rn', 'RR': 'c-rr', 'RL': 'c-rl', 'RC': 'c-rc', 'CU': 'c-cu' };
    var donutColors = ['#8B8578', '#8B4513', '#C8A64B', '#3b82f6', '#5E6E54'];
    var barsHtml1 = '<div class="chart-box"><h4><i class="fas fa-road" style="color:var(--gold)"></i>Répartition par type de route</h4><p class="chart-subtitle">Longueur en kilomètres par catégorie de route</p><div class="bar-chart">';
    catOrder.forEach(function(c) {
      var km = byCategory[c] || 0;
      var cnt = byCategoryCount[c] || 0;
      var pct = maxCatKm > 0 ? (km / maxCatKm * 100) : 0;
      barsHtml1 += '<div class="bar-row"><span class="bar-label bar-label-wide">' + classLabels[c] + '</span><div class="bar-track"><div class="bar-fill ' + (catCssClass[c] || '') + '" style="width:' + pct + '%">' + km.toFixed(0) + ' km (' + cnt + ')</div></div></div>';
    });
    barsHtml1 += '</div></div>';

    // Bar chart by region
    var regOrder = ['Centre', 'Kara', 'Savanes'];
    var barsHtml2 = '<div class="chart-box"><h4><i class="fas fa-map" style="color:var(--gold)"></i>Couverture par région</h4><p class="chart-subtitle">Longueur du réseau routier par région administrative</p><div class="bar-chart">';
    regOrder.forEach(function(r) {
      var km = byRegion[r] || 0;
      var pct = maxRegKm > 0 ? (km / maxRegKm * 100) : 0;
      barsHtml2 += '<div class="bar-row"><span class="bar-label bar-label-wide">' + r + '</span><div class="bar-track"><div class="bar-fill c-region" style="width:' + pct + '%">' + km.toFixed(0) + ' km</div></div></div>';
    });
    barsHtml2 += '</div></div>';

    // IAR section
    var iarMax = 40; // max for bar scaling
    var iarHtml = '<div class="iar-section"><h4><i class="fas fa-chart-line" style="color:var(--gold)"></i>Indice d\'Accès Rural (IAR)</h4><p class="chart-subtitle">Part de la population rurale à moins de 2 km d\'une route carrossable — un indicateur clé de l\'accessibilité</p><div class="iar-bars">';
    regionFeatures.forEach(function(f) {
      var name = f.properties.NAME_1;
      var iar = f.properties['IAR_%'];
      var pop = f.properties.POP_2022;
      var popRurale = f.properties.POP_RU_TOT;
      var cls = name === 'Centre' ? 'iar-centre' : (name === 'Kara' ? 'iar-kara' : 'iar-savanes');
      var pct = Math.min((iar / iarMax) * 100, 100);
      iarHtml += '<div class="iar-row"><span class="iar-label">' + name + '</span><div class="iar-track"><div class="iar-fill ' + cls + '" style="width:' + pct + '%">IAR ' + iar.toFixed(2) + '%</div></div><span class="iar-value">' + iar.toFixed(2) + '%</span></div>';
      iarHtml += '<div style="padding-left:100px;font-size:.72rem;color:var(--text-3);margin-bottom:10px">Population rurale : ' + Number(popRurale).toLocaleString('fr-FR') + ' / ' + Number(pop).toLocaleString('fr-FR') + ' habitants</div>';
    });
    iarHtml += '</div></div>';

    // Donut chart
    var catEntries = catOrder.map(function(c) { return { key: classLabels[c], val: byCategory[c] || 0 }; }).filter(function(e) { return e.val > 0; });
    var totalCatKm = catEntries.reduce(function(s, e) { return s + e.val; }, 0);
    var cumulative = 0;
    var gradientParts = catEntries.map(function(e, i) {
      var start = cumulative / totalCatKm * 360;
      cumulative += e.val;
      var end = cumulative / totalCatKm * 360;
      return donutColors[i] + ' ' + start.toFixed(1) + 'deg ' + end.toFixed(1) + 'deg';
    });
    var donutStyle = 'conic-gradient(' + gradientParts.join(', ') + ')';

    var donutLegendHtml = catEntries.map(function(e, i) {
      var pct = (e.val / totalCatKm * 100).toFixed(1);
      return '<div class="donut-legend-item"><div class="donut-legend-dot" style="background:' + donutColors[i] + '"></div>' + e.key + ' (' + pct + '%)</div>';
    }).join('');

    var donutHtml = '<div class="chart-box"><h4><i class="fas fa-chart-pie" style="color:var(--gold)"></i>Proportion par type de route</h4><p class="chart-subtitle">Répartition de la longueur totale du réseau</p>' +
      '<div class="donut-container"><div class="donut-chart" style="background:' + donutStyle + '"><div class="donut-hole"><div class="dh-value">' + totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + '</div><div class="dh-label">km total</div></div></div>' +
      '<div class="donut-legend">' + donutLegendHtml + '</div></div></div>';

    // Population section
    var popHtml = '<div class="pop-section"><h4><i class="fas fa-users" style="color:var(--gold)"></i>Population et urbanisation par région</h4><p class="chart-subtitle">Données démographiques issues du RGPH 2022</p><div class="bar-chart">';
    regionFeatures.forEach(function(f) {
      var name = f.properties.NAME_1;
      var pop = f.properties.POP_2022;
      var tauxUrb = f.properties.TAUX_HUBN;
      var popRurale = f.properties.POP_RU_TOT;
      var pct = pop / 1200000 * 100;
      var cls = name === 'Centre' ? 'iar-centre' : (name === 'Kara' ? 'iar-kara' : 'iar-savanes');
      popHtml += '<div class="bar-row"><span class="bar-label bar-label-wide">' + name + '</span><div class="bar-track"><div class="iar-fill ' + cls + '" style="width:' + pct + '%">' + Number(pop).toLocaleString('fr-FR') + ' hab</div></div></div>';
      popHtml += '<div style="padding-left:160px;font-size:.72rem;color:var(--text-3);margin-bottom:10px">Taux d\'urbanisation : ' + tauxUrb + '% | Population rurale : ' + Number(popRurale).toLocaleString('fr-FR') + '</div>';
    });
    popHtml += '</div></div>';

    body.innerHTML = introHtml + summaryHtml +
      '<div class="charts-row">' + barsHtml1 + barsHtml2 + '</div>' +
      iarHtml +
      '<div class="charts-row">' + donutHtml + popHtml + '</div>';
  }

  // 15b. Expose buildStats as renderStatsContent for road-sync.js
  window.renderStatsContent = buildStats;

  // 19. Geolocation
  var geoSource = new ol.source.Vector();
  var geoLayer = new ol.layer.Vector({
    source: geoSource,
    style: function(feature) {
      return [
        new ol.style.Style({
          image: new ol.style.Circle({
            radius: 20,
            fill: new ol.style.Fill({ color: 'rgba(0,106,78,0.12)' }),
            stroke: new ol.style.Stroke({ color: 'rgba(0,106,78,0.3)', width: 1 })
          })
        }),
        new ol.style.Style({
          image: new ol.style.Circle({
            radius: 6,
            fill: new ol.style.Fill({ color: 'rgba(200,166,75,0.5)' }),
            stroke: new ol.style.Stroke({ color: '#C8A64B', width: 3 })
          })
        }),
        new ol.style.Style({
          image: new ol.style.Circle({
            radius: 3,
            fill: new ol.style.Fill({ color: '#C8A64B' })
          })
        })
      ];
    }
  });
  map.addLayer(geoLayer);

  var userPosDisplay = document.getElementById('user-pos-display');
  var geolocWatchId = null;

  window.geolocateUser = function() {
    if (!navigator.geolocation) {
      alert('Géolocalisation non supportée par votre navigateur.');
      return;
    }
    document.getElementById('btn-geolocate').classList.add('active');
    userPosDisplay.textContent = 'Localisation en cours...';
    userPosDisplay.classList.add('visible');

    if (geolocWatchId !== null) {
      navigator.geolocation.clearWatch(geolocWatchId);
      geolocWatchId = null;
    }

    geolocWatchId = navigator.geolocation.watchPosition(
      function(pos) {
        var lat = pos.coords.latitude;
        var lon = pos.coords.longitude;
        var accuracy = pos.coords.accuracy;
        // Map is EPSG:4326, coordinates are already in [lon, lat] format
        var coords = [lon, lat];

        geoSource.clear();
        var feature = new ol.Feature({
          geometry: new ol.geom.Point(coords)
        });
        geoSource.addFeature(feature);

        // Ensure at least one base layer is visible
        var anyBaseVisible = baseLayerKeys.some(function(bk) { return layerMap[bk].getVisible(); });
        if (!anyBaseVisible) {
          layerMap['satellite'].setVisible(true);
          var satCb = document.querySelector('.layer-toggle input[data-layer="satellite"]');
          if (satCb) satCb.checked = true;
        }

        // Cap zoom at 15 for EPSG:4326 (equivalent to ~10m/pixel)
        var targetZoom = Math.min(Math.max(map.getView().getZoom(), 12), 15);

        map.getView().animate({
          center: coords,
          zoom: targetZoom,
          duration: 1200
        }, function(complete) {
          if (complete) {
            // Force tile reload after animation
            map.renderSync();
            setTimeout(function() { map.renderSync(); }, 200);
          }
        });

        userPosDisplay.innerHTML = '<i class="fas fa-location-dot" style="margin-right:4px"></i> Position : ' + lat.toFixed(5) + ', ' + lon.toFixed(5) + ' (±' + Math.round(accuracy) + 'm)';
      },
      function(err) {
        userPosDisplay.textContent = 'Erreur de localisation : ' + err.message;
        document.getElementById('btn-geolocate').classList.remove('active');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // 17b. Duplicate coord marquee (handled above in 6.5)

  // 18. Toolbar expandable menu
  var toolbarMenu = document.getElementById('toolbar-menu');
  var toolbarFab = document.getElementById('toolbar-fab');
  window.toggleToolbarMenu = function() {
    toolbarMenu.classList.toggle('open');
    toolbarFab.classList.toggle('active');
  };
  // Close toolbar menu on click outside
  document.addEventListener('click', function(e) {
    if (!document.getElementById('map-toolbar').contains(e.target)) {
      toolbarMenu.classList.remove('open');
      toolbarFab.classList.remove('active');
    }
  });

  // 18b. Fullscreen toggle
  window.toggleFullscreen = function() {
    var el = document.getElementById('map-container');
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      showToast('Mode plein écran activé', 'expand');
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    // Close toolbar menu
    toolbarMenu.classList.remove('open');
    toolbarFab.classList.remove('active');
  };
  // Update fullscreen icon on change
  function onFsChange() {
    var btn = document.getElementById('btn-fullscreen');
    if (!btn) return;
    var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btn.innerHTML = isFs ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-maximize"></i>';
    btn.title = isFs ? 'Quitter le plein écran' : 'Plein écran';
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // 18c. Export map as PNG
  window.exportMapPNG = function() {
    showToast('Capture de la carte en cours...', 'camera');
    // Close toolbar menu and export modal
    toolbarMenu.classList.remove('open');
    toolbarFab.classList.remove('active');
    var exportModal = document.getElementById('export-modal');
    if (exportModal) exportModal.classList.remove('open');

    map.once('rendercomplete', function() {
      var canvas = document.querySelector('#map canvas');
      if (!canvas) { showToast('Erreur lors de la capture', 'exclamation-triangle'); return; }
      try {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob(function(blob) {
            if (!blob) {
              showToast('Erreur lors de la capture', 'exclamation-triangle');
              return;
            }
            downloadBlob(blob, 'GeoROAD_TOGO_' + new Date().toISOString().slice(0,10) + '.png');
            showToast('Carte exportée en PNG', 'check-circle');
          }, 'image/png');
        } else {
          var pngBlob = dataURLToBlob(canvas.toDataURL('image/png'));
          downloadBlob(pngBlob, 'GeoROAD_TOGO_' + new Date().toISOString().slice(0,10) + '.png');
          showToast('Carte exportée en PNG', 'check-circle');
        }
      } catch(err) {
        showToast('Erreur : ' + err.message, 'exclamation-triangle');
      }
    });
    map.renderSync();
  };

  // 19. Close modals on Escape (unified)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(function(m) { m.classList.remove('open'); });
      closeInfoPanel();
      toolbarMenu.classList.remove('open');
      toolbarFab.classList.remove('active');
    }
  });

  // 20. Double-click zoom with smooth animation (disabled in edit mode)
  map.on('dblclick', function(evt) {
    /* En mode édition, ne pas intercepter le double-clic */
    if (typeof SIGModule !== 'undefined') {
      var sigState = SIGModule.getState();
      if (sigState && sigState.editMode) return;
    }
    evt.preventDefault();
    var view = map.getView();
    var currentZoom = view.getZoom();
    view.animate({ zoom: Math.min(currentZoom + 1, view.getMaxZoom()), duration: 300 });
  });

  // 21. Right info panel — on map click (same approach as TOGO_VF reference)
  var infoPanel = document.getElementById('info-panel');
  var infoPanelBody = document.getElementById('info-panel-body');
  var currentClickedFeature = null;
  var currentClickedLayerKey = null;

  map.on('singleclick', function(evt) {
    /* Skip if SIGModule is in edit mode */
    if (typeof SIGModule !== 'undefined') {
      try {
        var sigState = SIGModule.getState();
        if (sigState && sigState.editMode) { closeInfoPanel(); return; }
      } catch(e) {}
    }

    var found = false;
    var checkLayers = ['Rseauroutier_6', 'Emprise_5', 'Canton_4', 'Prfecture_3', 'Rgion_2'];
    for (var i = 0; i < checkLayers.length; i++) {
      var layerKey = checkLayers[i];
      var layer = layerMap[layerKey];
      if (!layer || !layer.getVisible()) continue;
      var featuresAtPixel = map.getFeaturesAtPixel(evt.pixel, { layerFilter: function(l) { return l === layer; } });
      if (featuresAtPixel && featuresAtPixel.length > 0) {
        currentClickedFeature = featuresAtPixel[0];
        currentClickedLayerKey = layerKey;
        var props = featuresAtPixel[0].getProperties();
        delete props.geometry;
        showInfoPanel(layerKey, props);
        found = true;
        break;
      }
    }
    if (!found) {
      closeInfoPanel();
      currentClickedFeature = null;
      currentClickedLayerKey = null;
    }
  });

  function showInfoPanel(layerKey, props) {
    var aliases = fieldAliases[layerKey] || {};
    var html = '<div class="info-layer-badge">' + (layerNames[layerKey] || layerKey) + '</div>';

    // Définir l'ordre et le regroupement des champs par couche.
    // Chaque groupe : { title, keys[] }
    var groups = [];
    if (layerKey === 'Rgion_2') {
      groups = [
        { title: 'Identification', keys: ['fid', 'COUNTRY', 'NAME_1'] },
        { title: 'Population', keys: ['POP_2022', 'POP_RU_TOT', 'POP_RU_IMP', 'POP_IMAPCT'] },
        { title: 'Indicateurs', keys: ['IAR_%', 'TAUX_HUBN'] }
      ];
    } else if (layerKey === 'Prfecture_3') {
      groups = [
        { title: 'Identification', keys: ['fid', 'NAME_1', 'NAME_2'] },
        { title: 'Population', keys: ['POP_2022', 'POP_IMPACT'] }
      ];
    } else if (layerKey === 'Canton_4') {
      groups = [
        { title: 'Identification', keys: ['fid', 'NAME_1', 'NAME_2', 'NAME_3'] }
      ];
    } else if (layerKey === 'Emprise_5') {
      groups = [
        { title: 'Identification', keys: ['Name', 'CLASSE', 'EMPRISE', 'REGIONS'] },
        { title: 'Tronçon routier', keys: ['RT_LONGEUR', 'RT_PK_DEB_X', 'RT_PK_DEB_Y', 'RT_PK_FIN_X', 'RT_PK_FIN_Y'] }
      ];
    } else if (layerKey === 'Rseauroutier_6') {
      groups = [
        { title: 'Identification', keys: ['Name', 'REGIONS', 'CLASSE', 'EMPRISE'] },
        { title: 'Tronçon routier', keys: ['LONGEUR', 'PK_DEB_X', 'PK_DEB_Y', 'PK_FIN_X', 'PK_FIN_Y'] }
      ];
    }

    var layerHidden = hiddenKeys[layerKey] || [];

    // Si la couche n'a pas de groupes définis, on affiche tout à la suite (sauf hiddenKeys).
    if (groups.length === 0) {
      var allKeys = Object.keys(props).filter(function(kk) { return layerHidden.indexOf(kk) === -1; });
      for (var i = 0; i < allKeys.length; i++) {
        var k = allKeys[i];
        var lbl = aliases[k] || k;
        var val = formatInfoValue(k, props[k], layerKey);
        html += '<div class="info-attr-row"><span class="info-attr-label">' + lbl + '</span><span class="info-attr-value">' + val + '</span></div>';
      }
    } else {
      // Suivre les clés déjà affichées pour ajouter à la fin toute clé non prévue.
      var displayed = {};
      groups.forEach(function(g) {
        // Vérifier qu'au moins une clé du groupe existe dans les props.
        var hasAny = g.keys.some(function(kk) { return props.hasOwnProperty(kk); });
        if (!hasAny) return;
        html += '<div class="info-section-title">' + g.title + '</div>';
        g.keys.forEach(function(k) {
          if (!props.hasOwnProperty(k)) return;
          var label = aliases[k] || k;
          var value = formatInfoValue(k, props[k], layerKey);
          html += '<div class="info-attr-row"><span class="info-attr-label">' + label + '</span><span class="info-attr-value">' + value + '</span></div>';
          displayed[k] = true;
        });
      });
      // Ajouter les clés restantes éventuelles (en excluant les hiddenKeys).
      var remaining = Object.keys(props).filter(function(kk) { return !displayed[kk] && layerHidden.indexOf(kk) === -1; });
      if (remaining.length > 0) {
        html += '<div class="info-section-title">Autres informations</div>';
        remaining.forEach(function(k) {
          var label = aliases[k] || k;
          var value = formatInfoValue(k, props[k], layerKey);
          html += '<div class="info-attr-row"><span class="info-attr-label">' + label + '</span><span class="info-attr-value">' + value + '</span></div>';
        });
      }
    }

    html += '<button class="info-zoom-btn" onclick="zoomToClickedFeature()"><i class="fas fa-search-plus"></i> Zoomer sur l\'entit\u00e9</button>';
    infoPanelBody.innerHTML = html;
    infoPanel.classList.add('open');
  }

  function formatInfoValue(key, value, layerKey) {
    if (value === null || value === undefined) return '\u2014';
    if ((layerKey === 'Rseauroutier_6' || layerKey === 'Emprise_5') && key === 'CLASSE') {
      var fullName = classLabels[value] || value;
      return '<span class="cat-badge cat-' + fullName.replace(/\s/g, '') + '">' + fullName + '</span>';
    }
    if (typeof value === 'number') {
      // Populations (préfecture / région / canton) — affichées avec le suffixe « hab »
      if (key === 'fid') {
        return Number(value).toLocaleString('fr-FR');
      }
      if (key.indexOf('POP') !== -1) {
        return Number(value).toLocaleString('fr-FR') + ' hab';
      }
      // Pourcentages IAR / urbanisation (avec ou sans préfixe REG_)
      if (key === 'IAR_%' || key === 'TAUX_HUBN' || key === 'REG_IAR_%' || key === 'REG_TAUX_HUBN') {
        return value.toFixed(2) + '%';
      }
      // Longueurs des tronçons (LONGEUR ou RT_LONGEUR) — converties en km
      if (key === 'LONGEUR' || key === 'RT_LONGEUR') {
        return (value / 1000).toFixed(2) + ' km';
      }
      // Emprise en mètres
      if (key === 'EMPRISE') {
        return Number(value).toLocaleString('fr-FR') + ' m';
      }
      // Points kilométriques (PK_* ou RT_PK_*)
      if (key.indexOf('PK_') !== -1) {
        return Number(value).toLocaleString('fr-FR') + ' m';
      }
      return Number(value).toLocaleString('fr-FR');
    }
    return String(value);
  }

  window.closeInfoPanel = function() {
    if (infoPanel) infoPanel.classList.remove('open');
  };

  window.zoomToClickedFeature = function() {
    if (!currentClickedFeature) return;
    var geom = currentClickedFeature.getGeometry();
    if (geom) {
      var ext = geom.getExtent();
      map.getView().fit(ext, { size: map.getSize(), maxZoom: 14, padding: [80, 80, 80, 80], duration: 600 });
    }
  };

})();
