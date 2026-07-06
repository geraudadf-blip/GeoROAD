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