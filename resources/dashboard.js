/**
 * dashboard.js — Module d'interface améliorée pour GeoROAD TOGO
 * Charge APRÈS qgis2web.js — utilise les globals : map, layersList, json_Rseauroutier_6, etc.
 */
(function () {
    'use strict';

    /* ──────────────────────────────────────────────
       CONFIGURATION
    ────────────────────────────────────────────── */
    var CATEGORY_LABELS = {
        'RN': 'Route nationale',
        'RR': 'Route régionale',
        'RL': 'Route locale',
        'RC': 'Route communale',
        'CU': 'Route communautaire'
    };
    var CATEGORY_COLORS = {
        'RN': '#EF4444',
        'RR': '#6366F1',
        'RL': '#EC4899',
        'RC': '#F59E0B',
        'CU': '#10B981'
    };
    var CATEGORY_ICONS = {
        'RN': 'fa-road',
        'RR': 'fa-route',
        'RL': 'fa-road',
        'RC': 'fa-road',
        'CU': 'fa-road'
    };
    var REGION_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];

    var PER_PAGE = 15;

    /* ──────────────────────────────────────────────
       STATE
    ────────────────────────────────────────────── */
    var searchIndex = [];
    var roadFeatures = [];
    var tableState = {
        data: [],
        filtered: [],
        sortCol: 'Name',
        sortDir: 'asc',
        page: 1,
        filterText: '',
        filterCategory: ''
    };

    /* ──────────────────────────────────────────────
       INIT
    ────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(initDashboard, 600);
    });

    function initDashboard() {
        if (typeof map === 'undefined' || typeof layersList === 'undefined') {
            console.warn('[Dashboard] map ou layersList non trouvé — réessai dans 500ms');
            setTimeout(initDashboard, 500);
            return;
        }
        console.log('[Dashboard] Initialisation...');
        collectRoadFeatures();
        buildSearchIndex();
        initLayerPanel();
        initCategoryFilters();
        initSearch();
        initAttributeTable();
        computeAndDisplayStats();
        initInfoPanel();
        initSidebarToggle();
        initModalEvents();
        repositionOLControls();
        console.log('[Dashboard] Prêt.');
    }

    /* ──────────────────────────────────────────────
       COLLECT FEATURES
    ────────────────────────────────────────────── */
    function collectRoadFeatures() {
        if (typeof json_Rseauroutier_6 !== 'undefined') {
            var fmt = new ol.format.GeoJSON();
            roadFeatures = fmt.readFeatures(json_Rseauroutier_6,
                { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
        }
    }

    function buildSearchIndex() {
        searchIndex = [];
        // Routes
        roadFeatures.forEach(function (f, i) {
            searchIndex.push({
                type: 'route',
                layer: 'route',
                name: f.get('Name') || '',
                detail: (f.get('CLASSE') || '') + ' — ' + (f.get('REGIONS') || ''),
                region: f.get('REGIONS') || '',
                category: f.get('CLASSE') || '',
                index: i,
                feature: f
            });
        });
        // Régions
        if (typeof lyr_Rgion_2 !== 'undefined') {
            lyr_Rgion_2.getSource().getFeatures().forEach(function (f) {
                searchIndex.push({
                    type: 'region',
                    layer: 'region',
                    name: f.get('NAME_1') || '',
                    detail: 'Région — Pop. ' + (f.get('POP_2022') || '—'),
                    region: f.get('NAME_1') || '',
                    index: -1,
                    feature: f
                });
            });
        }
        // Préfectures
        if (typeof lyr_Prfecture_3 !== 'undefined') {
            lyr_Prfecture_3.getSource().getFeatures().forEach(function (f) {
                searchIndex.push({
                    type: 'prefecture',
                    layer: 'prefecture',
                    name: f.get('NAME_2') || '',
                    detail: (f.get('NAME_1') || '') + ' — Pop. ' + (f.get('POP_2022') || '—'),
                    region: f.get('NAME_1') || '',
                    index: -1,
                    feature: f
                });
            });
        }
        // Emprises
        if (typeof lyr_Emprise_5 !== 'undefined') {
            lyr_Emprise_5.getSource().getFeatures().forEach(function (f) {
                searchIndex.push({
                    type: 'emprise',
                    layer: 'emprise',
                    name: f.get('Name') || '',
                    detail: 'Emprise ' + (f.get('CLASSE') || ''),
                    region: '',
                    index: -1,
                    feature: f
                });
            });
        }
    }

    /* ──────────────────────────────────────────────
       LAYER PANEL (Sidebar)
    ────────────────────────────────────────────── */
    function initLayerPanel() {
        var container = document.getElementById('custom-layers');
        if (!container) return;

        // Base maps group
        var baseGroup = createLayerGroup('Fonds de carte', 'fa-map');
        layersList.forEach(function (lyr) {
            if (lyr.get('type') === 'base') {
                baseGroup.body.appendChild(
                    createLayerItem(lyr, lyr.get('title'), 'fa-globe', true)
                );
            }
        });
        container.appendChild(baseGroup.el);

        // Overlay layers group
        var overlayGroup = createLayerGroup('Couches de données', 'fa-layer-group');
        layersList.forEach(function (lyr) {
            if (lyr.get('type') !== 'base' && lyr.get('displayInLayerSwitcher') !== false) {
                var title = lyr.get('popuplayertitle') || lyr.get('title') || 'Couche';
                overlayGroup.body.appendChild(
                    createLayerItem(lyr, title, getLayerIcon(title), false)
                );
            }
        });
        container.appendChild(overlayGroup.el);
    }

    function createLayerGroup(title, iconClass) {
        var el = document.createElement('div');
        el.className = 'sidebar-section';
        var titleEl = document.createElement('div');
        titleEl.className = 'sidebar-section-title';
        titleEl.innerHTML = '<span><i class="fas ' + iconClass + '" style="margin-right:6px;font-size:11px;color:var(--primary)"></i>' + title + '</span><i class="fas fa-chevron-down"></i>';
        titleEl.addEventListener('click', function () {
            el.classList.toggle('collapsed');
        });
        var body = document.createElement('div');
        body.className = 'sidebar-section-body';
        el.appendChild(titleEl);
        el.appendChild(body);
        return { el: el, body: body };
    }

    function createLayerItem(lyr, title, iconClass, isRadio) {
        var item = document.createElement('div');
        item.className = 'layer-item';
        var cb = document.createElement('input');
        cb.type = isRadio ? 'radio' : 'checkbox';
        cb.name = isRadio ? 'basemap' : '';
        cb.checked = lyr.getVisible();
        cb.addEventListener('change', function () {
            if (isRadio) {
                layersList.forEach(function (l) {
                    if (l.get('type') === 'base') l.setVisible(false);
                });
            }
            lyr.setVisible(cb.checked);
        });
        var icon = document.createElement('i');
        icon.className = 'fas ' + iconClass + ' layer-icon';
        icon.style.color = getLayerColor(title);
        icon.style.background = getLayerColorBg(title);
        var label = document.createElement('span');
        label.className = 'layer-label';
        label.textContent = cleanTitle(title);
        label.title = cleanTitle(title);
        item.appendChild(cb);
        item.appendChild(icon);
        item.appendChild(label);
        // Feature count
        if (lyr.getSource && lyr.getSource().getFeatures) {
            var count = lyr.getSource().getFeatures().length;
            if (count > 0) {
                var countEl = document.createElement('span');
                countEl.className = 'layer-count';
                countEl.textContent = count;
                item.appendChild(countEl);
            }
        }
        label.addEventListener('click', function () { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); });
        return item;
    }

    function getLayerIcon(title) {
        var t = (title || '').toLowerCase();
        if (t.indexOf('région') !== -1 || t.indexOf('region') !== -1) return 'fa-map';
        if (t.indexOf('préfecture') !== -1 || t.indexOf('prefecture') !== -1) return 'fa-map-marker-alt';
        if (t.indexOf('canton') !== -1) return 'fa-map-pin';
        if (t.indexOf('emprise') !== -1) return 'fa-expand';
        if (t.indexOf('réseau') !== -1 || t.indexOf('routier') !== -1) return 'fa-road';
        return 'fa-layer-group';
    }

    function getLayerColor(title) {
        var t = (title || '').toLowerCase();
        if (t.indexOf('région') !== -1 || t.indexOf('region') !== -1) return '#10B981';
        if (t.indexOf('préfecture') !== -1 || t.indexOf('prefecture') !== -1) return '#8B5CF6';
        if (t.indexOf('canton') !== -1) return '#F59E0B';
        if (t.indexOf('emprise') !== -1) return '#EF4444';
        if (t.indexOf('réseau') !== -1 || t.indexOf('routier') !== -1) return '#2563EB';
        return '#64748B';
    }

    function getLayerColorBg(title) {
        var c = getLayerColor(title);
        return c + '18';
    }

    function cleanTitle(title) {
        return title.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }

    /* ──────────────────────────────────────────────
       CATEGORY FILTERS
    ────────────────────────────────────────────── */
    function initCategoryFilters() {
        var container = document.getElementById('category-filters');
        if (!container) return;

        // Count per category
        var counts = {};
        roadFeatures.forEach(function (f) {
            var c = f.get('CLASSE') || 'Autre';
            counts[c] = (counts[c] || 0) + 1;
        });

        Object.keys(CATEGORY_LABELS).forEach(function (key) {
            var item = document.createElement('div');
            item.className = 'filter-item';
            item.dataset.category = key;
            var color = document.createElement('div');
            color.className = 'filter-color';
            color.style.background = CATEGORY_COLORS[key];
            var label = document.createElement('span');
            label.className = 'filter-label';
            label.textContent = CATEGORY_LABELS[key];
            var count = document.createElement('span');
            count.className = 'filter-count';
            count.textContent = counts[key] || 0;
            item.appendChild(color);
            item.appendChild(label);
            item.appendChild(count);
            item.addEventListener('click', function () {
                item.classList.toggle('active-filter');
                filterByCategories();
            });
            container.appendChild(item);
        });
    }

    function filterByCategories() {
        var activeEls = document.querySelectorAll('#category-filters .filter-item.active-filter');
        var active = [];
        activeEls.forEach(function (el) { active.push(el.dataset.category); });

        if (typeof lyr_Rseauroutier_6 !== 'undefined') {
            if (active.length === 0) {
                // Show all
                lyr_Rseauroutier_6.getSource().getFeatures().forEach(function (f) {
                    f.setStyle(null); // reset to original style
                });
            } else {
                lyr_Rseauroutier_6.getSource().getFeatures().forEach(function (f) {
                    var cls = f.get('CLASSE');
                    if (active.indexOf(cls) === -1) {
                        f.setStyle(new ol.style.Style({}));
                    } else {
                        f.setStyle(null);
                    }
                });
            }
        }
    }

    /* ──────────────────────────────────────────────
       SMART SEARCH (Auto-complete)
    ────────────────────────────────────────────── */
    function initSearch() {
        var input = document.getElementById('global-search');
        var dropdown = document.getElementById('search-dropdown');
        if (!input || !dropdown) return;

        var debounceTimer;
        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                var q = input.value.trim().toLowerCase();
                if (q.length < 2) {
                    dropdown.classList.remove('active');
                    return;
                }
                var results = searchIndex.filter(function (item) {
                    return item.name.toLowerCase().indexOf(q) !== -1 ||
                        item.detail.toLowerCase().indexOf(q) !== -1 ||
                        (item.region && item.region.toLowerCase().indexOf(q) !== -1);
                }).slice(0, 20);

                if (results.length === 0) {
                    dropdown.innerHTML = '<div class="search-no-result">Aucun résultat pour "' + escapeHtml(input.value) + '"</div>';
                } else {
                    dropdown.innerHTML = '';
                    results.forEach(function (r) {
                        var div = document.createElement('div');
                        div.className = 'search-result-item';
                        div.innerHTML =
                            '<div class="result-icon ' + r.type + '"><i class="fas ' + getResultIcon(r.type) + '"></i></div>' +
                            '<div class="result-info">' +
                            '<div class="result-name">' + escapeHtml(r.name) + '</div>' +
                            '<div class="result-detail">' + escapeHtml(r.detail) + '</div>' +
                            '</div>';
                        div.addEventListener('click', function () {
                            zoomToFeature(r.feature, r.type);
                            dropdown.classList.remove('active');
                            input.value = r.name;
                        });
                        dropdown.appendChild(div);
                    });
                }
                dropdown.classList.add('active');
            }, 200);
        });

        input.addEventListener('focus', function () {
            if (input.value.trim().length >= 2) {
                input.dispatchEvent(new Event('input'));
            }
        });

        // Close on outside click
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.header-center')) {
                dropdown.classList.remove('active');
            }
        });
    }

    function getResultIcon(type) {
        switch (type) {
            case 'route': return 'fa-road';
            case 'region': return 'fa-map';
            case 'prefecture': return 'fa-map-marker-alt';
            case 'emprise': return 'fa-expand';
            default: return 'fa-search';
        }
    }

    function zoomToFeature(feature, type) {
        if (!feature || !feature.getGeometry) return;
        var geom = feature.getGeometry();
        var ext = geom.getExtent();
        // Add some padding
        var dx = (ext[2] - ext[0]) * 0.15 || 0.01;
        var dy = (ext[3] - ext[1]) * 0.15 || 0.01;
        map.getView().fit([ext[0] - dx, ext[1] - dy, ext[2] + dx, ext[3] + dy],
            { duration: 600, maxZoom: 16 });
        // Show in info panel
        showFeatureInPanel(feature, type);
    }

    /* ──────────────────────────────────────────────
       FEATURE INFO PANEL (Right)
    ────────────────────────────────────────────── */
    function initInfoPanel() {
        var closeBtn = document.getElementById('close-right-panel');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                document.getElementById('right-panel').classList.add('collapsed');
            });
        }

        // Hook into existing popup click
        var origSingleClick = map.getListeners('singleclick');
        map.on('singleclick', function (evt) {
            // Small delay to let qgis2web popup fire first
            setTimeout(function () {
                var features = [];
                map.forEachFeatureAtPixel(evt.pixel, function (f, layer) {
                    if (layer && layer.get('interactive') && f instanceof ol.Feature) {
                        features.push({ feature: f, layer: layer });
                    }
                });
                if (features.length > 0) {
                    var top = features[features.length - 1];
                    var layerTitle = top.layer.get('popuplayertitle') || top.layer.get('title') || '';
                    var type = 'route';
                    if (layerTitle.indexOf('Région') !== -1) type = 'region';
                    else if (layerTitle.indexOf('Préfecture') !== -1) type = 'prefecture';
                    else if (layerTitle.indexOf('Canton') !== -1) type = 'canton';
                    else if (layerTitle.indexOf('Emprise') !== -1) type = 'emprise';
                    showFeatureInPanel(top.feature, type);
                }
            }, 50);
        });
    }

    function showFeatureInPanel(feature, type) {
        var panel = document.getElementById('right-panel');
        var content = document.getElementById('feature-info-content');
        if (!panel || !content) return;

        // Store for zoom button
        window._lastInfoFeature = feature;

        panel.classList.remove('collapsed');

        var html = '';
        var props = feature.getProperties();
        var keys = feature.getKeys().filter(function (k) { return k !== 'geometry'; });

        // Title
        var name = props.Name || props.NAME_1 || props.NAME_2 || props.NAME_3 || 'Sans nom';
        html += '<div class="feature-info-section">';
        html += '<div class="section-label">Identification</div>';
        html += '<div class="feature-info-card">';
        html += '<h4 style="margin:0 0 10px 0;font-size:16px;color:var(--primary)">' + escapeHtml(name) + '</h4>';

        if (type === 'route') {
            var cls = props.CLASSE || '—';
            html += featureInfoRow('Catégorie', '<span class="info-value badge badge-' + cls.toLowerCase() + '">' + escapeHtml(CATEGORY_LABELS[cls] || cls) + '</span>');
        }

        keys.forEach(function (key) {
            if (key === 'Name' || key === 'NAME_1' || key === 'NAME_2' || key === 'NAME_3' || key === 'fid') return;
            var alias = key;
            // Try to find alias from layers
            var layer = findLayerForFeature(feature);
            if (layer) {
                var aliases = layer.get('fieldAliases');
                if (aliases && aliases[key]) alias = aliases[key];
            }
            var val = props[key];
            if (val === null || val === undefined) val = '—';
            var displayVal = escapeHtml(String(val));
            if (key === 'LONGEUR') displayVal = formatLength(val);
            if (key === 'EMPRISE') displayVal = formatNumber(val) + ' m';
            if (key === 'POP_2022' || key === 'POP_RU_TOT' || key === 'POP_RU_IMP' || key === 'POP_IMPACT') {
                displayVal = formatNumber(val);
            }
            html += featureInfoRow(alias, displayVal);
        });
        html += '</div></div>';

        // Actions
        html += '<div class="feature-info-section">';
        html += '<div class="section-label">Actions</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
        html += '<button onclick="window._dashboardZoomTo(this)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;font-size:12px;font-family:var(--font);color:var(--text);transition:all 200ms" onmouseover="this.style.background=\'var(--primary-light)\'" onmouseout="this.style.background=\'var(--bg)\'"><i class="fas fa-search-plus" style="margin-right:4px"></i> Zoomer</button>';
        html += '<button onclick="window._dashboardExportFeature(this)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);cursor:pointer;font-size:12px;font-family:var(--font);color:var(--text);transition:all 200ms" onmouseover="this.style.background=\'var(--primary-light)\'" onmouseout="this.style.background=\'var(--bg)\'"><i class="fas fa-download" style="margin-right:4px"></i> Exporter</button>';
        html += '</div></div>';

        content.innerHTML = html;
    }

    function featureInfoRow(key, value) {
        return '<div class="feature-info-row"><span class="info-key">' + escapeHtml(key) + '</span><span class="info-value">' + value + '</span></div>';
    }

    function findLayerForFeature(feature) {
        for (var i = 0; i < layersList.length; i++) {
            var src = layersList[i].getSource();
            if (src && src.getFeatures) {
                var feats = src.getFeatures();
                for (var j = 0; j < feats.length; j++) {
                    if (feats[j] === feature) return layersList[i];
                }
            }
        }
        return null;
    }

    /* Global handlers for inline onclick */
    window._dashboardZoomTo = function (btn) {
        var card = btn.closest('.feature-info-card');
        // re-zoom to the last selected feature
        if (window._lastInfoFeature) {
            zoomToFeature(window._lastInfoFeature, 'route');
        }
    };
    window._dashboardExportFeature = function (btn) {
        showToast('Export en cours de développement', 'info');
    };

    /* ──────────────────────────────────────────────
       ATTRIBUTE TABLE
    ────────────────────────────────────────────── */
    function initAttributeTable() {
        // Prepare data
        tableState.data = roadFeatures.map(function (f, i) {
            return {
                index: i,
                Name: f.get('Name') || '',
                REGIONS: f.get('REGIONS') || '',
                CLASSE: f.get('CLASSE') || '',
                EMPRISE: f.get('EMPRISE'),
                LONGEUR: f.get('LONGEUR')
            };
        });
        tableState.filtered = tableState.data.slice();

        renderTable();
        initTableControls();
    }

    function renderTable() {
        var tbody = document.getElementById('table-tbody');
        if (!tbody) return;

        var start = (tableState.page - 1) * PER_PAGE;
        var end = Math.min(start + PER_PAGE, tableState.filtered.length);
        var slice = tableState.filtered.slice(start, end);

        tbody.innerHTML = '';
        slice.forEach(function (row) {
            var tr = document.createElement('tr');
            tr.addEventListener('click', function () {
                var f = roadFeatures[row.index];
                if (f) {
                    zoomToFeature(f, 'route');
                    document.getElementById('table-modal-overlay').classList.remove('active');
                }
            });
            tr.innerHTML =
                '<td>' + escapeHtml(row.Name) + '</td>' +
                '<td>' + escapeHtml(row.REGIONS) + '</td>' +
                '<td><span class="info-value badge badge-' + row.CLASSE.toLowerCase() + '" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">' + escapeHtml(CATEGORY_LABELS[row.CLASSE] || row.CLASSE) + '</span></td>' +
                '<td class="number">' + (row.EMPRISE != null ? formatNumber(row.EMPRISE) + ' m' : '—') + '</td>' +
                '<td class="number">' + (row.LONGEUR != null ? formatLength(row.LONGEUR) : '—') + '</td>';
            tbody.appendChild(tr);
        });

        // Update info and pagination
        updateTableInfo();
        renderPagination();
    }

    function updateTableInfo() {
        var info = document.getElementById('table-info');
        if (!info) return;
        var total = tableState.filtered.length;
        var start = total === 0 ? 0 : (tableState.page - 1) * PER_PAGE + 1;
        var end = Math.min(tableState.page * PER_PAGE, total);
        info.textContent = start + '–' + end + ' sur ' + total + ' routes';
    }

    function renderPagination() {
        var container = document.getElementById('table-pagination');
        if (!container) return;
        container.innerHTML = '';
        var totalPages = Math.ceil(tableState.filtered.length / PER_PAGE) || 1;

        // Prev
        var prev = createPageBtn('<i class="fas fa-chevron-left"></i>', function () {
            if (tableState.page > 1) { tableState.page--; renderTable(); }
        });
        if (tableState.page <= 1) prev.disabled = true;
        container.appendChild(prev);

        // Pages
        var pages = getPaginationRange(tableState.page, totalPages, 5);
        pages.forEach(function (p) {
            if (p === '...') {
                var dots = document.createElement('span');
                dots.textContent = '...';
                dots.style.padding = '0 6px';
                dots.style.color = 'var(--text-secondary)';
                container.appendChild(dots);
            } else {
                var btn = createPageBtn(p, function () { tableState.page = p; renderTable(); });
                if (p === tableState.page) btn.classList.add('active');
                container.appendChild(btn);
            }
        });

        // Next
        var next = createPageBtn('<i class="fas fa-chevron-right"></i>', function () {
            if (tableState.page < totalPages) { tableState.page++; renderTable(); }
        });
        if (tableState.page >= totalPages) next.disabled = true;
        container.appendChild(next);
    }

    function createPageBtn(label, onClick) {
        var btn = document.createElement('button');
        btn.className = 'page-btn';
        btn.innerHTML = label;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function getPaginationRange(current, total, maxVisible) {
        if (total <= maxVisible + 2) {
            var arr = [];
            for (var i = 1; i <= total; i++) arr.push(i);
            return arr;
        }
        var pages = [1];
        var start = Math.max(2, current - 1);
        var end = Math.min(total - 1, current + 1);
        if (start > 2) pages.push('...');
        for (var j = start; j <= end; j++) pages.push(j);
        if (end < total - 1) pages.push('...');
        pages.push(total);
        return pages;
    }

    function initTableControls() {
        // Search
        var searchInput = document.getElementById('table-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                tableState.filterText = searchInput.value.trim().toLowerCase();
                tableState.page = 1;
                applyTableFilters();
            });
        }

        // Category filter
        var catSelect = document.getElementById('table-category-filter');
        if (catSelect) {
            catSelect.addEventListener('change', function () {
                tableState.filterCategory = catSelect.value;
                tableState.page = 1;
                applyTableFilters();
            });
        }

        // Region filter
        var regSelect = document.getElementById('table-region-filter');
        if (regSelect) {
            // Populate regions
            var regions = [];
            roadFeatures.forEach(function (f) {
                var r = f.get('REGIONS');
                if (r && regions.indexOf(r) === -1) regions.push(r);
            });
            regions.sort();
            regions.forEach(function (r) {
                var opt = document.createElement('option');
                opt.value = r;
                opt.textContent = r;
                regSelect.appendChild(opt);
            });
            regSelect.addEventListener('change', function () {
                tableState.filterRegion = regSelect.value;
                tableState.page = 1;
                applyTableFilters();
            });
        }

        // Column headers sort
        var ths = document.querySelectorAll('#attribute-table thead th[data-col]');
        ths.forEach(function (th) {
            th.addEventListener('click', function () {
                var col = th.dataset.col;
                if (tableState.sortCol === col) {
                    tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
                } else {
                    tableState.sortCol = col;
                    tableState.sortDir = 'asc';
                }
                // Update header classes
                ths.forEach(function (h) { h.classList.remove('sorted'); });
                th.classList.add('sorted');
                th.querySelector('.sort-icon').className = 'sort-icon fas ' +
                    (tableState.sortDir === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
                applyTableFilters();
            });
        });
    }

    function applyTableFilters() {
        var ft = tableState.filterText;
        var fc = tableState.filterCategory;
        var fr = tableState.filterRegion;

        tableState.filtered = tableState.data.filter(function (row) {
            if (ft && row.Name.toLowerCase().indexOf(ft) === -1 &&
                row.REGIONS.toLowerCase().indexOf(ft) === -1 &&
                row.CLASSE.toLowerCase().indexOf(ft) === -1) return false;
            if (fc && row.CLASSE !== fc) return false;
            if (fr && row.REGIONS !== fr) return false;
            return true;
        });

        // Sort
        var col = tableState.sortCol;
        var dir = tableState.sortDir === 'asc' ? 1 : -1;
        tableState.filtered.sort(function (a, b) {
            var va = a[col], vb = b[col];
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb), 'fr') * dir;
        });

        renderTable();
    }

    /* ──────────────────────────────────────────────
       STATISTICS
    ────────────────────────────────────────────── */
    function computeAndDisplayStats() {
        // Compute from road features
        var totalKm = 0, totalEmprise = 0, count = roadFeatures.length;
        var byCategory = {};
        var byRegion = {};
        var categories = Object.keys(CATEGORY_LABELS);
        categories.forEach(function (c) { byCategory[c] = { km: 0, count: 0, emprise: 0 }; });

        roadFeatures.forEach(function (f) {
            var len = f.get('LONGEUR') || 0;
            var emp = f.get('EMPRISE') || 0;
            var cls = f.get('CLASSE') || 'Autre';
            var reg = f.get('REGIONS') || 'Non défini';

            totalKm += len;
            totalEmprise += emp;

            if (byCategory[cls]) {
                byCategory[cls].km += len;
                byCategory[cls].count++;
                byCategory[cls].emprise += emp;
            }
            if (!byRegion[reg]) byRegion[reg] = { km: 0, count: 0 };
            byRegion[reg].km += len;
            byRegion[reg].count++;
        });

        totalKm /= 1000; // Convert to km

        // Render mini stats in sidebar
        renderMiniStats(totalKm, count, totalEmprise);

        // Render full stats modal
        renderFullStats(totalKm, count, totalEmprise, byCategory, byRegion);
    }

    function renderMiniStats(totalKm, count, totalEmprise) {
        var el = document.getElementById('mini-stats-values');
        if (!el) return;
        el.innerHTML =
            '<div class="mini-stat-card"><div class="stat-value">' + formatNumber(totalKm, 1) + '</div><div class="stat-label">km de routes</div></div>' +
            '<div class="mini-stat-card"><div class="stat-value green">' + count + '</div><div class="stat-label">tronçons</div></div>' +
            '<div class="mini-stat-card"><div class="stat-value orange">' + formatNumber(totalEmprise, 0) + '</div><div class="stat-label">m emprise totale</div></div>' +
            '<div class="mini-stat-card"><div class="stat-value purple">' + Object.keys(CATEGORY_LABELS).length + '</div><div class="stat-label">catégories</div></div>';
    }

    function renderFullStats(totalKm, count, totalEmprise, byCategory, byRegion) {
        var container = document.getElementById('stats-content');
        if (!container) return;

        var maxCatKm = 0;
        Object.keys(byCategory).forEach(function (c) {
            if (byCategory[c].km > maxCatKm) maxCatKm = byCategory[c].km;
        });
        maxCatKm = maxCatKm || 1;

        var html = '';

        // KPI Cards
        html += '<div class="stats-grid">';
        html += statCard('fa-road', 'blue', formatNumber(totalKm, 1) + ' km', 'Longueur totale du réseau');
        html += statCard('fa-route', 'green', count, 'Nombre de tronçons');
        html += statCard('fa-expand', 'orange', formatNumber(totalEmprise, 0) + ' m', 'Emprise totale');
        html += statCard('fa-chart-line', 'purple', formatNumber(totalKm / Math.max(count, 1), 2) + ' km', 'Longueur moyenne');
        html += '</div>';

        // Category breakdown bar chart
        html += '<div class="chart-section">';
        html += '<h3><i class="fas fa-chart-bar" style="margin-right:8px;color:var(--primary)"></i>Répartition par catégorie</h3>';
        html += '<div class="bar-chart">';
        Object.keys(CATEGORY_LABELS).forEach(function (key) {
            var d = byCategory[key];
            if (!d) return;
            var pct = (d.km / maxCatKm) * 100;
            var km = (d.km / 1000);
            html += '<div class="bar-row">';
            html += '<div class="bar-label">' + CATEGORY_LABELS[key] + '</div>';
            html += '<div class="bar-track"><div class="bar-fill ' + key.toLowerCase() + '" style="width:' + pct + '%">' + d.count + '</div></div>';
            html += '<div class="bar-value">' + formatNumber(km, 1) + ' km</div>';
            html += '</div>';
        });
        html += '</div></div>';

        // Region breakdown
        html += '<div class="stats-row-section">';
        html += '<h3><i class="fas fa-map" style="margin-right:8px;color:var(--success)"></i>Répartition par région</h3>';
        html += '<div class="stat-row-cards">';
        var regionKeys = Object.keys(byRegion).sort();
        regionKeys.forEach(function (reg, i) {
            var d = byRegion[reg];
            html += '<div class="stat-row-card" style="border-left-color:' + REGION_COLORS[i % REGION_COLORS.length] + '">';
            html += '<div class="row-card-value">' + formatNumber(d.km / 1000, 1) + ' km</div>';
            html += '<div class="row-card-label">' + escapeHtml(reg) + ' — ' + d.count + ' tronçons</div>';
            html += '</div>';
        });
        html += '</div></div>';

        container.innerHTML = html;
    }

    function statCard(icon, colorClass, value, label) {
        return '<div class="stat-card">' +
            '<div class="stat-card-icon ' + colorClass + '"><i class="fas ' + icon + '"></i></div>' +
            '<div class="stat-card-value">' + value + '</div>' +
            '<div class="stat-card-label">' + label + '</div>' +
            '</div>';
    }

    /* ──────────────────────────────────────────────
       SIDEBAR TOGGLE
    ────────────────────────────────────────────── */
    function initSidebarToggle() {
        var btn = document.getElementById('sidebar-toggle');
        var sidebar = document.getElementById('left-sidebar');
        if (btn && sidebar) {
            btn.addEventListener('click', function () {
                sidebar.classList.toggle('collapsed');
                btn.classList.toggle('active');
                setTimeout(function () { map.updateSize(); }, 300);
            });
        }
    }

    /* ──────────────────────────────────────────────
       MODAL EVENTS
    ────────────────────────────────────────────── */
    function initModalEvents() {
        // Table modal
        var tableBtn = document.getElementById('btn-open-table');
        var tableModal = document.getElementById('table-modal-overlay');
        if (tableBtn && tableModal) {
            tableBtn.addEventListener('click', function () {
                tableModal.classList.add('active');
                tableState.page = 1;
                renderTable();
            });
            var tableClose = tableModal.querySelector('.modal-close');
            if (tableClose) tableClose.addEventListener('click', function () { tableModal.classList.remove('active'); });
            tableModal.addEventListener('click', function (e) { if (e.target === tableModal) tableModal.classList.remove('active'); });
        }

        // Stats modal
        var statsBtn = document.getElementById('btn-open-stats');
        var statsModal = document.getElementById('stats-modal-overlay');
        if (statsBtn && statsModal) {
            statsBtn.addEventListener('click', function () {
                statsModal.classList.add('active');
                computeAndDisplayStats();
            });
            var statsClose = statsModal.querySelector('.modal-close');
            if (statsClose) statsClose.addEventListener('click', function () { statsModal.classList.remove('active'); });
            statsModal.addEventListener('click', function (e) { if (e.target === statsModal) statsModal.classList.remove('active'); });
        }

        // ESC key
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (tableModal) tableModal.classList.remove('active');
                if (statsModal) statsModal.classList.remove('active');
                var rp = document.getElementById('right-panel');
                if (rp) rp.classList.add('collapsed');
            }
        });
    }

    /* ──────────────────────────────────────────────
       REPOSITION OL CONTROLS
    ────────────────────────────────────────────── */
    function repositionOLControls() {
        // Hide the default OL layer switcher (we use custom sidebar)
        var ls = document.querySelector('.layer-switcher');
        if (ls) ls.style.display = 'none';

        // Hide the default geocoder (we use header search)
        var gc = document.querySelector('.photon-geocoder-autocomplete');
        if (gc) gc.style.display = 'none';

        // Move #top-left-container into #map-wrapper if needed
        // qgis2web.js already handles this, we just ensure proper styling
    }

    /* ──────────────────────────────────────────────
       UTILITIES
    ────────────────────────────────────────────── */
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    }

    function formatNumber(num, decimals) {
        if (num == null || isNaN(num)) return '—';
        if (decimals === undefined) decimals = 0;
        return Number(num).toLocaleString('fr-FR', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function formatLength(meters) {
        if (meters == null || isNaN(meters)) return '—';
        var km = meters / 1000;
        if (km >= 1) {
            return formatNumber(km, 2) + ' km';
        }
        return formatNumber(meters, 0) + ' m';
    }

    function showToast(message, type) {
        type = type || 'info';
        var container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(function () {
            toast.style.animation = 'toastOut 300ms ease forwards';
            setTimeout(function () { toast.remove(); }, 300);
        }, 3000);
    }

})();