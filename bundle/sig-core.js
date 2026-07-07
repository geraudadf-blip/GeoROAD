/* ===================================================================
 * GeoROAD TOGO — SIG Event Bus (V3.0 SIG Core)
 *
 * Bus d'événements global pour la synchronisation cross-modules.
 * Remplace tout rafraîchissement manuel par un système pub/sub
 * centralisé et performant.
 *
 * Events :
 *   - FEATURE_CREATED   : Nouvelle route ajoutée
 *   - FEATURE_UPDATED   : Attributs modifiés
 *   - FEATURE_DELETED   : Route supprimée
 *   - GEOMETRY_UPDATED  : Géométrie modifiée
 *   - AUDIT_LOGGED      : Entrée d'audit ajoutée
 *   - STATS_CHANGED     : Statistiques modifiées
 *   - DASHBOARD_REFRESH : Demande de rafraîchissement dashboard
 *   - PERSISTENCE_SAVED : Données persistées en localStorage
 *
 * Dépend : aucune (module autonome, sans dépendance OL)
 * =================================================================== */
var SIGEventBus = (function() {
  'use strict';

  /* ===== TYPES D'ÉVÉNEMENTS ===== */
  var EVENTS = {
    FEATURE_CREATED: 'sig:feature:created',
    FEATURE_UPDATED: 'sig:feature:updated',
    FEATURE_DELETED: 'sig:feature:deleted',
    GEOMETRY_UPDATED: 'sig:geometry:updated',
    AUDIT_LOGGED: 'sig:audit:logged',
    STATS_CHANGED: 'sig:stats:changed',
    DASHBOARD_REFRESH: 'sig:dashboard:refresh',
    PERSISTENCE_SAVED: 'sig:persistence:saved'
  };

  /* ===== STOCKAGE DES LISTENERS ===== */
  var _listeners = {};

  /* Compteur pour le débogage et la performance */
  var _emitCount = 0;
  var _lastEmitTime = 0;
  var _lastEventType = null;
  var _lastEmitDataId = '';

  /* ===================================================================
   * API PUBLIQUE
   * =================================================================== */

  /**
   * Enregistre un listener pour un événement.
   * @param {string} eventType - Type d'événement (voir EVENTS)
   * @param {function} callback - function(data) appelé à chaque émission
   * @param {string} [id] - Identifiant optionnel pour le retrait ciblé
   * @returns {string} Identifiant du listener (pour off())
   */
  function on(eventType, callback, id) {
    if (!eventType || typeof callback !== 'function') return null;
    if (!_listeners[eventType]) _listeners[eventType] = [];

    var listenerId = id || ('listener_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    _listeners[eventType].push({ id: listenerId, fn: callback });
    return listenerId;
  }

  /**
   * Enregistre un listener qui s'exécute une seule fois.
   * @param {string} eventType
   * @param {function} callback
   * @returns {string} Identifiant du listener
   */
  function once(eventType, callback) {
    var id = 'once_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    var wrapper = function(data) {
      off(eventType, id);
      callback(data);
    };
    wrapper._originalCallback = callback;
    return on(eventType, wrapper, id);
  }

  /**
   * Supprime un listener par identifiant.
   * @param {string} eventType - Type d'événement
   * @param {string} listenerId - Identifiant retourné par on()
   */
  function off(eventType, listenerId) {
    if (!_listeners[eventType]) return;
    if (listenerId) {
      _listeners[eventType] = _listeners[eventType].filter(function(l) {
        return l.id !== listenerId;
      });
    } else {
      /* Supprimer tous les listeners de ce type */
      delete _listeners[eventType];
    }
  }

  /**
   * Supprime tous les listeners de tous les types.
   */
  function offAll() {
    _listeners = {};
  }

  /**
   * Émet un événement avec des données.
   * Les erreurs dans les callbacks sont capturées pour ne pas
   * casser la chaîne d'émission.
   *
   * @param {string} eventType - Type d'événement
   * @param {Object} [data] - Données associées à l'événement
   */
  function emit(eventType, data) {
    var now = Date.now();
    _emitCount++;

    /* Anti-doublon strict : même type + même identifiant de feature en < 10ms */
    var dataId = (data && data.featureId) ? data.featureId : '';
    if (eventType === _lastEventType && dataId === _lastEmitDataId && now - _lastEmitTime < 10) {
      return;
    }
    _lastEventType = eventType;
    _lastEmitDataId = dataId;
    _lastEmitTime = now;

    var listeners = _listeners[eventType];
    if (!listeners || listeners.length === 0) return;

    /* Copier le tableau pour éviter les problèmes si un callback modifie la liste */
    var snapshot = listeners.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i].fn(data);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[SIGEventBus] Erreur dans le listener "' + eventType + '":', err);
        }
      }
    }
  }

  /* Anti-doublon state */

  /**
   * Retourne le nombre de listeners enregistrés pour un type.
   * @param {string} eventType
   * @returns {number}
   */
  function listenerCount(eventType) {
    if (!_listeners[eventType]) return 0;
    return _listeners[eventType].length;
  }

  /**
   * Retourne des statistiques sur l'utilisation du bus.
   * @returns {{ totalEvents: number, emitCount: number, byType: Object }}
   */
  function getStats() {
    var byType = {};
    Object.keys(_listeners).forEach(function(evt) {
      byType[evt] = _listeners[evt].length;
    });
    return {
      totalListeners: Object.keys(_listeners).reduce(function(sum, evt) {
        return sum + _listeners[evt].length;
      }, 0),
      emitCount: _emitCount,
      byType: byType
    };
  }

  /* ===== API PUBLIQUE ===== */
  return {
    EVENTS: EVENTS,
    on: on,
    once: once,
    off: off,
    offAll: offAll,
    emit: emit,
    listenerCount: listenerCount,
    getStats: getStats
  };
})();

/* ===================================================================
 * GeoROAD TOGO — SIG Spatial Calculator (V3.0 SIG Core)
 *
 * Calculs spatiaux réels pour les données du réseau routier.
 * Utilise ol.sphere pour les calculs géodésiques et fournit
 * des fonctions de validation et d'analyse géométrique.
 *
 * Dépend : OpenLayers (ol) pour ol.sphere et ol.format.GeoJSON
 *          SIGEventBus (optionnel, pour émettre les événements de calcul)
 * =================================================================== */
var SIGSpatialCalculator = (function() {
  'use strict';

  /* ===== CONSTANTES ===== */
  var WGS84_A = 6378137;           /* Demi-grand axe WGS84 en mètres */
  var WGS84_B = 6356752.314245;    /* Demi-petit axe WGS84 en mètres */

  /* Zones UTM supportées (Afrique de l'Ouest et au-delà) */
  var SUPPORTED_UTM_ZONES = {
    'EPSG:32630': { zone: 30, label: 'UTM Zone 30N' },
    'EPSG:32631': { zone: 31, label: 'UTM Zone 31N' },
    'EPSG:32632': { zone: 32, label: 'UTM Zone 32N' }
  };

  /* Références géographiques (information uniquement, jamais utilisé pour déplacer ou rejeter des données) */
  var GEO_REFS = {
    togo:  { minLon: -0.2, maxLon: 1.9, minLat: 6.0, maxLat: 11.2, label: 'Togo' },
    benin: { minLon: 0.8, maxLon: 3.9, minLat: 6.0, maxLat: 12.4, label: 'Bénin' },
    ghana: { minLon: -3.3, maxLon: 1.2, minLat: 4.5, maxLat: 11.2, label: 'Ghana' },
    burkina: { minLon: -5.5, maxLon: 2.4, minLat: 9.4, maxLat: 15.1, label: 'Burkina Faso' },
    coteivoire: { minLon: -8.6, maxLon: -2.5, minLat: 4.3, maxLat: 10.7, label: 'Côte d\'Ivoire' }
  };

  /* Compatibilité : TOGO_BOUNDS conservé comme alias */
  var TOGO_BOUNDS = GEO_REFS.togo;

  /* ===================================================================
   * CALCULS DE LONGUEUR
   * =================================================================== */

  /**
   * Calcule la longueur géodésique d'une géométrie GeoJSON.
   * Utilise ol.sphere.getLength pour une précision WGS84.
   *
   * @param {Object} geometry - Géométrie GeoJSON (LineString ou MultiLineString)
   * @returns {number} Longueur en mètres
   */
  function calculateLength(geometry) {
    if (!geometry || !geometry.type || !geometry.coordinates) return 0;

    if (typeof ol !== 'undefined' && ol.sphere && ol.format) {
      try {
        var format = new ol.format.GeoJSON();
        var olGeom = format.readGeometry(geometry, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:4326'
        });
        return ol.sphere.getLength(olGeom);
      } catch (e) {
        /* Fallback sur le calcul haversine */
      }
    }

    /* Fallback : somme des distances haversine entre sommets consécutifs */
    return haversineLength(geometry);
  }

  /**
   * Calcule la longueur via haversine (fallback si OL indisponible).
   * @param {Object} geometry - GeoJSON geometry
   * @returns {number} Longueur en mètres
   */
  function haversineLength(geometry) {
    var coords = extractCoords(geometry);
    var total = 0;
    for (var i = 1; i < coords.length; i++) {
      total += haversine(coords[i - 1], coords[i]);
    }
    return total;
  }

  /* ===================================================================
   * BOUNDING BOX & CENTROID
   * =================================================================== */

  /**
   * Calcule la bounding box d'une géométrie GeoJSON.
   * @param {Object} geometry - GeoJSON geometry
   * @returns {{ minX, minY, maxX, maxY, width, height }} en degrés
   */
  function calculateBoundingBox(geometry) {
    var coords = extractCoords(geometry);
    if (coords.length === 0) return null;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < coords.length; i++) {
      var lon = coords[i][0], lat = coords[i][1];
      if (lon < minX) minX = lon;
      if (lon > maxX) maxX = lon;
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }

    return {
      minX: Math.round(minX * 1000000) / 1000000,
      minY: Math.round(minY * 1000000) / 1000000,
      maxX: Math.round(maxX * 1000000) / 1000000,
      maxY: Math.round(maxY * 1000000) / 1000000,
      width: Math.round((maxX - minX) * 1000000) / 1000000,
      height: Math.round((maxY - minY) * 1000000) / 1000000
    };
  }

  /**
   * Calcule le centroïde d'une géométrie GeoJSON.
   * Méthode : moyenne arithmétique des sommets (centroïde non pondéré).
   *
   * @param {Object} geometry - GeoJSON geometry
   * @returns {{ lon, lat } | null}
   */
  function calculateCentroid(geometry) {
    var coords = extractCoords(geometry);
    if (coords.length === 0) return null;

    var sumLon = 0, sumLat = 0;
    for (var i = 0; i < coords.length; i++) {
      sumLon += coords[i][0];
      sumLat += coords[i][1];
    }

    return {
      lon: Math.round((sumLon / coords.length) * 1000000) / 1000000,
      lat: Math.round((sumLat / coords.length) * 1000000) / 1000000
    };
  }

  /* ===================================================================
   * VALIDATION GÉOMÉTRIQUE
   * =================================================================== */

  /**
   * Valide une géométrie GeoJSON pour le réseau routier.
   *
   * @param {Object} geometry - GeoJSON geometry
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  function validateGeometry(geometry) {
    var errors = [];
    var warnings = [];

    if (!geometry) {
      errors.push('La géométrie est nulle.');
      return { valid: false, errors: errors, warnings: warnings };
    }

    /* Type */
    var validTypes = ['LineString', 'MultiLineString'];
    if (validTypes.indexOf(geometry.type) === -1) {
      errors.push('Type de géométrie invalide : ' + geometry.type + '. Attendu : LineString ou MultiLineString.');
      return { valid: false, errors: errors, warnings: warnings };
    }

    /* Coordonnées */
    var coords = extractCoords(geometry);
    if (coords.length < 2) {
      errors.push('La géométrie doit contenir au moins 2 sommets (actuel : ' + coords.length + ').');
    }

    /* Vérifier les coordonnées aberrantes */
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i];
      if (isNaN(c[0]) || isNaN(c[1])) {
        errors.push('Le sommet ' + (i + 1) + ' contient des coordonnées non numériques.');
      }
      if (c[0] < -180 || c[0] > 180 || c[1] < -90 || c[1] > 90) {
        errors.push('Le sommet ' + (i + 1) + ' a des coordonnées hors limites géographiques.');
      }
    }

    /* Vérifier la localisation (information uniquement, jamais un rejet) */
    var bbox = calculateBoundingBox(geometry);
    if (bbox) {
      var detectedAreas = detectLocation(bbox);
      if (detectedAreas.length > 0) {
        warnings.push('Localisation détectée : ' + detectedAreas.join(', ') + '.');
      }
    }

    /* Vérifier les doublons de sommets consécutifs */
    for (var j = 1; j < coords.length; j++) {
      if (coords[j][0] === coords[j - 1][0] && coords[j][1] === coords[j - 1][1]) {
        warnings.push('Doublon de sommet détecté à l\'index ' + j + '.');
      }
    }

    /* Longueur minimale (10m) */
    var len = calculateLength(geometry);
    if (len < 10) {
      warnings.push('La géométrie est très courte (' + len.toFixed(1) + ' m). Vérifiez qu\'il ne s\'agit pas d\'une erreur de saisie.');
    }

    /* Auto-intersections */
    var selfIntersections = detectSelfIntersections(geometry);
    if (selfIntersections.length > 0) {
      warnings.push(selfIntersections.length + ' auto-intersection(s) détectée(s) dans la géométrie.');
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  /* ===================================================================
   * DÉTECTION D'AUTO-INTERSECTIONS
   * =================================================================== */

  /**
   * Détecte les auto-intersections dans une LineString.
   * Algorithme : comparaison par paires de segments non adjacents.
   *
   * @param {Object} geometry - GeoJSON geometry (LineString)
   * @returns {Array<{ segment1: [i, j], segment2: [k, l], point: [lon, lat] }>}
   */
  function detectSelfIntersections(geometry) {
    var coords = extractCoords(geometry);
    if (coords.length < 4) return [];

    var intersections = [];

    for (var i = 0; i < coords.length - 1; i++) {
      for (var j = i + 2; j < coords.length - 1; j++) {
        /* Sauter les segments adjacents (partagent un sommet) */
        if (i === 0 && j === coords.length - 2) continue; /* Fermeture éventuelle */

        var inter = segmentIntersection(coords[i], coords[i + 1], coords[j], coords[j + 1]);
        if (inter) {
          intersections.push({
            segment1: [i, i + 1],
            segment2: [j, j + 1],
            point: inter
          });
        }
      }
    }

    return intersections;
  }

  /**
   * Calcule l'intersection de deux segments 2D.
   * @returns {[number, number] | null} Point d'intersection ou null
   */
  function segmentIntersection(a1, a2, b1, b2) {
    var d1x = a2[0] - a1[0], d1y = a2[1] - a1[1];
    var d2x = b2[0] - b1[0], d2y = b2[1] - b1[1];

    var cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-12) return null; /* Parallèles ou colinéaires */

    var t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / cross;
    var u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / cross;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [
        Math.round((a1[0] + t * d1x) * 1000000) / 1000000,
        Math.round((a1[1] + t * d1y) * 1000000) / 1000000
      ];
    }
    return null;
  }

  /* ===================================================================
   * STATISTIQUES SPATIALES AVANCÉES
   * =================================================================== */

  /**
   * Calcule la densité routière pour une région donnée.
   * @param {number} totalLengthKm - Longueur totale des routes dans la région (km)
   * @param {number} areaKm2 - Superficie de la région (km²)
   * @returns {number} Densité en km/km²
   */
  function roadDensity(totalLengthKm, areaKm2) {
    if (!areaKm2 || areaKm2 <= 0) return 0;
    return Math.round((totalLengthKm / areaKm2) * 100) / 100;
  }

  /**
   * Calcule des statistiques agrégées sur un ensemble de features GeoJSON.
   *
   * @param {Object[]} features - Array de features GeoJSON
   * @returns {Object} { totalLength, byCategory, byRegion, avgLength, maxLength, minLength }
   */
  function computeAggregatedStats(features) {
    var stats = {
      totalLength: 0,
      count: 0,
      byCategory: {},
      byRegion: {},
      avgLength: 0,
      maxLength: 0,
      maxLengthName: '',
      minLength: Infinity,
      minLengthName: ''
    };

    if (!features || !features.length) return stats;

    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f || !f.geometry) continue;

      var len = calculateLength(f.geometry);
      var lenKm = len / 1000;

      stats.totalLength += lenKm;
      stats.count++;

      if (lenKm > stats.maxLength) {
        stats.maxLength = lenKm;
        stats.maxLengthName = (f.properties && f.properties.Name) || 'Route ' + i;
      }
      if (lenKm < stats.minLength) {
        stats.minLength = lenKm;
        stats.minLengthName = (f.properties && f.properties.Name) || 'Route ' + i;
      }

      /* Par catégorie */
      var cls = (f.properties && f.properties.CLASSE) || 'Non défini';
      if (!stats.byCategory[cls]) stats.byCategory[cls] = { count: 0, km: 0 };
      stats.byCategory[cls].count++;
      stats.byCategory[cls].km += lenKm;

      /* Par région */
      var reg = (f.properties && f.properties.REGIONS) || 'Non défini';
      if (!stats.byRegion[reg]) stats.byRegion[reg] = { count: 0, km: 0 };
      stats.byRegion[reg].count++;
      stats.byRegion[reg].km += lenKm;
    }

    stats.avgLength = stats.count > 0 ? stats.totalLength / stats.count : 0;

    /* Arrondir */
    stats.totalLength = Math.round(stats.totalLength * 100) / 100;
    stats.avgLength = Math.round(stats.avgLength * 100) / 100;
    stats.maxLength = Math.round(stats.maxLength * 100) / 100;
    stats.minLength = stats.minLength === Infinity ? 0 : Math.round(stats.minLength * 100) / 100;

    return stats;
  }

  /* ===================================================================
   * UTILITAIRES INTERNES
   * =================================================================== */

  /**
   * Extrait un tableau plat de coordonnées [lon, lat] depuis une géométrie GeoJSON.
   * Gère LineString, MultiLineString, Polygon, MultiPolygon.
   */
  function extractCoords(geometry) {
    if (!geometry || !geometry.coordinates) return [];
    var result = [];

    switch (geometry.type) {
      case 'Point':
        result.push(geometry.coordinates);
        break;
      case 'LineString':
        geometry.coordinates.forEach(function(c) { result.push(c); });
        break;
      case 'MultiLineString':
        geometry.coordinates.forEach(function(line) {
          line.forEach(function(c) { result.push(c); });
        });
        break;
      case 'Polygon':
        geometry.coordinates[0].forEach(function(c) { result.push(c); });
        break;
      case 'MultiPolygon':
        geometry.coordinates.forEach(function(poly) {
          poly[0].forEach(function(c) { result.push(c); });
        });
        break;
    }
    return result;
  }

  /**
   * Distance haversine entre deux points [lon, lat] en mètres.
   */
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
   * DÉTECTION DE LOCALISATION
   * =================================================================== */

  /**
   * Détecte dans quelle(s) zone(s) géographiques se trouve une bounding box.
   * Ne déplace jamais les données — uniquement informatif.
   *
   * @param {Object} bbox — { minX, minY, maxX, maxY }
   * @returns {string[]} Noms des zones détectées
   */
  function detectLocation(bbox) {
    var detected = [];
    var keys = Object.keys(GEO_REFS);
    for (var i = 0; i < keys.length; i++) {
      var ref = GEO_REFS[keys[i]];
      /* Vérifier si les boîtes se chevauchent */
      if (bbox.maxX >= ref.minLon && bbox.minX <= ref.maxLon &&
          bbox.maxY >= ref.minLat && bbox.minY <= ref.maxLat) {
        detected.push(ref.label);
      }
    }
    return detected;
  }

  /* ===================================================================
   * REPROJECTION UNIVERSELLE
   * =================================================================== */

  /**
   * Reprojette des coordonnées d'un CRS vers un autre.
   * Utilise ol.proj.transform si disponible, sinon proj4.
   * Gère automatiquement tout EPSG enregistré dans proj4 ou ol.proj.
   *
   * @param {Array} coords — [x, y]
   * @param {string} fromCRS — ex: 'EPSG:32631', 'EPSG:4326'
   * @param {string} toCRS — ex: 'EPSG:4326'
   * @returns {Array} [x, y] reprojetées
   */
  function reproject(coords, fromCRS, toCRS) {
    if (typeof ol !== 'undefined' && ol.proj && ol.proj.transform) {
      /* Vérifier que le CRS source est enregistré, sinon l'enregistrer via proj4 */
      try {
        return ol.proj.transform(coords, fromCRS, toCRS);
      } catch (e) {
        /* Tenter d'enregistrer le CRS via proj4 si disponible */
        if (typeof proj4 !== 'undefined' && fromCRS.indexOf('326') >= 0) {
          var zone = fromCRS.replace('EPSG:', '');
          if (zone.indexOf('326') === 0) {
            var utmZone = parseInt(zone.replace('326', ''), 10);
            if (utmZone >= 1 && utmZone <= 60) {
              var def = '+proj=utm +zone=' + utmZone + ' +datum=WGS84 +units=m +no_defs';
              proj4.defs(fromCRS, def);
              try { ol.proj.proj4.register(proj4); } catch(e2) {}
              return ol.proj.transform(coords, fromCRS, toCRS);
            }
          }
        }
        throw e;
      }
    }
    throw new Error('Aucun moteur de reprojection disponible (ol.proj requis).');
  }

  /**
   * Détecte automatiquement le CRS d'un ensemble de coordonnées.
   * @param {number[]} coords — [x, y]
   * @returns {string} CRS détecté ('EPSG:4326' ou 'EPSG:326xx')
   */
  function detectCRS(x, y) {
    /* UTM : Easting ~100k-900k, Northing ~0-10M */
    if (x > 100000 && x < 900000 && y > 0 && y < 10000000) {
      /* Tester les zones UTM 30, 31, 32 (couverture Togo) */
      var zones = [30, 31, 32];
      for (var i = 0; i < zones.length; i++) {
        var epsg = 'EPSG:326' + zones[i];
        try {
          var reproj = reproject([x, y], epsg, 'EPSG:4326');
          if (reproj[1] >= -90 && reproj[1] <= 90 && reproj[0] >= -180 && reproj[0] <= 180) {
            return epsg;
          }
        } catch(e) { /* essayer la suivante */ }
      }
      /* Par défaut, UTM 31N */
      return 'EPSG:32631';
    }
    /* Géographique (lat/lon) */
    if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
      return 'EPSG:4326';
    }
    return 'EPSG:4326';
  }

  /* ===== API PUBLIQUE ===== */
  return {
    calculateLength: calculateLength,
    calculateBoundingBox: calculateBoundingBox,
    calculateCentroid: calculateCentroid,
    validateGeometry: validateGeometry,
    detectSelfIntersections: detectSelfIntersections,
    roadDensity: roadDensity,
    computeAggregatedStats: computeAggregatedStats,
    haversine: haversine,
    TOGO_BOUNDS: TOGO_BOUNDS,
    GEO_REFS: GEO_REFS,
    SUPPORTED_UTM_ZONES: SUPPORTED_UTM_ZONES,
    detectLocation: detectLocation,
    reproject: reproject,
    detectCRS: detectCRS
  };
})();

/* ===================================================================
 * GeoROAD TOGO — SIG Persistence Layer (V3.0 SIG Core)
 *
 * Couche de persistance localStorage structurée comme une future
 * base de données PostgreSQL/PostGIS.
 *
 * Structure de stockage (clés localStorage) :
 *   georoad_sig.layers.routes      → FeatureCollection routes
 *   georoad_sig.layers.emprises    → FeatureCollection emprises
 *   georoad_sig.layers.pk          → FeatureCollection points kilométriques
 *   georoad_sig.meta.version       → Version du schéma
 *   georoad_sig.meta.lastSync      → Dernière synchronisation
 *   georoad_sig.meta.schema        → Description du schéma de données
 *
 * Architecture PostGIS future :
 *   - Remplacer les appels localStorage par des requêtes
 *     SQL via un backend REST API
 *   - La structure JSON reste identique pour la compatibilité
 *
 * Dépend : SIGEventBus (pour émettre PERSISTENCE_SAVED)
 * =================================================================== */
var SIGPersistence = (function() {
  'use strict';

  /* ===== PRÉFIXE DE STOCKAGE ===== */
  var PREFIX = 'georoad_sig.';

  /* ===== VERSION DU SCHÉMA ===== */
  var SCHEMA_VERSION = '3.0';
  var SCHEMA_KEY = PREFIX + 'meta.version';

  /* ===== COUCHES GÉRÉES ===== */
  var LAYERS = {
    ROUTES: 'layers.routes',
    EMPRISES: 'layers.emprises',
    PK: 'layers.pk',
  };

  function cloneFeatureCollection(featureCollection) {
    if (!featureCollection) return null;
    try {
      return JSON.parse(JSON.stringify(featureCollection));
    } catch (e) {
      return featureCollection;
    }
  }

  /* ===================================================================
   * SAUVEGARDE
   * =================================================================== */

  /**
   * Sauvegarde un FeatureCollection dans une couche.
   *
   * @param {string} layerKey - Clé de la couche (LAYERS.ROUTES, etc.)
   * @param {Object} featureCollection - GeoJSON FeatureCollection
   * @returns {boolean} true si succès
   */
  function saveLayer(layerKey, featureCollection) {
    var fullKey = PREFIX + layerKey;
    try {
      localStorage.setItem(fullKey, JSON.stringify(featureCollection));

      /* Émettre l'événement de persistance */
      if (typeof SIGEventBus !== 'undefined') {
        SIGEventBus.emit(SIGEventBus.EVENTS.PERSISTENCE_SAVED, {
          layer: layerKey,
          featureCount: (featureCollection && featureCollection.features) ? featureCollection.features.length : 0,
          timestamp: new Date().toISOString()
        });
      }

      return true;
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[SIGPersistence] Erreur de sauvegarde ' + layerKey + ':', e);
      }
      return false;
    }
  }

  /**
   * Sauvegarde l'état complet du SIG (toutes les couches).
   * Appelé automatiquement après chaque modification.
   *
   * @param {Object} data
   * @param {Object} [data.routes] - FeatureCollection des routes
   * @param {Object} [data.emprises] - FeatureCollection des emprises
   * @param {Object} [data.pk] - FeatureCollection des PK
   * @returns {{ routes: boolean, emprises: boolean, pk: boolean }}
   */
  function saveAll(data) {
    data = data || {};
    var results = {};

    results.routes = saveLayer(LAYERS.ROUTES, data.routes);
    results.emprises = saveLayer(LAYERS.EMPRISES, data.emprises);
    results.pk = saveLayer(LAYERS.PK, data.pk);

    /* Mettre à jour le timestamp de dernière synchronisation */
    setMeta('lastSync', new Date().toISOString());

    return results;
  }

  /**
   * Sauvegarde une feature individuelle dans une couche.
   * Si la feature existe (même id), elle est remplacée.
   *
   * @param {string} layerKey - Clé de la couche
   * @param {Object} feature - GeoJSON Feature
   * @returns {boolean}
   */
  function saveFeature(layerKey, feature) {
    var fc = loadLayer(layerKey);
    if (!fc) {
      fc = { type: 'FeatureCollection', features: [] };
    }

    var existingIdx = -1;
    if (feature.id !== undefined) {
      for (var i = 0; i < fc.features.length; i++) {
        if (fc.features[i].id === feature.id) {
          existingIdx = i;
          break;
        }
      }
    }

    if (existingIdx >= 0) {
      fc.features[existingIdx] = feature;
    } else {
      fc.features.push(feature);
    }

    return saveLayer(layerKey, fc);
  }

  /* ===================================================================
   * CHARGEMENT
   * =================================================================== */

  /**
   * Charge un FeatureCollection depuis une couche.
   *
   * @param {string} layerKey - Clé de la couche
   * @returns {Object|null} FeatureCollection ou null si inexistant
   */
  function loadLayer(layerKey) {
    var fullKey = PREFIX + layerKey;
    try {
      var data = localStorage.getItem(fullKey);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Charge l'état complet du SIG.
   *
   * @returns {{ routes: Object|null, emprises: Object|null, pk: Object|null, meta: Object }}
   */
  function loadAll() {
    return {
      routes: loadLayer(LAYERS.ROUTES),
      emprises: loadLayer(LAYERS.EMPRISES),
      pk: loadLayer(LAYERS.PK),
      meta: {
        version: getMeta('version'),
        lastSync: getMeta('lastSync'),
        schema: getMeta('schema')
      }
    };
  }

  function restoreLayerToMemory(layerKey, globalName, fallbackData) {
    var persisted = loadLayer(layerKey);
    if (persisted && typeof window !== 'undefined') {
      window[globalName] = cloneFeatureCollection(persisted);
      return persisted;
    }

    if (!persisted && fallbackData) {
      saveLayer(layerKey, fallbackData);
      if (typeof window !== 'undefined') {
        window[globalName] = cloneFeatureCollection(fallbackData);
      }
      return fallbackData;
    }

    return persisted;
  }

  /**
   * Supprime une couche complète.
   * @param {string} layerKey
   */
  function deleteLayer(layerKey) {
    try {
      localStorage.removeItem(PREFIX + layerKey);
    } catch (e) {}
  }

  /**
   * Supprime toutes les données SIG du localStorage.
   */
  function deleteAll() {
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function(key) {
      localStorage.removeItem(key);
    });
  }

  /* ===================================================================
   * MÉTADONNÉES
   * =================================================================== */

  /**
   * Stocke une métadonnée.
   * @param {string} key
   * @param {string} value
   */
  function setMeta(key, value) {
    try {
      localStorage.setItem(PREFIX + 'meta.' + key, String(value));
    } catch (e) {}
  }

  /**
   * Lit une métadonnée.
   * @param {string} key
   * @returns {string|null}
   */
  function getMeta(key) {
    try {
      return localStorage.getItem(PREFIX + 'meta.' + key);
    } catch (e) {
      return null;
    }
  }

  /* ===================================================================
   * INITIALISATION
   * =================================================================== */

  /**
   * Initialise le schéma de persistance.
   * Sauvegarde les données en mémoire (variables globales GeoJSON)
   * vers localStorage pour la première fois.
   */
  function initialize() {
    /* Vérifier si le schéma est déjà initialisé */
    var version = getMeta('version');
    if (version === SCHEMA_VERSION) {
      restoreLayerToMemory(
        LAYERS.ROUTES,
        'json_Rseauroutier_6',
        (typeof json_Rseauroutier_6 !== 'undefined') ? json_Rseauroutier_6 : null
      );
      restoreLayerToMemory(
        LAYERS.EMPRISES,
        'json_Emprise_5',
        (typeof json_Emprise_5 !== 'undefined') ? json_Emprise_5 : null
      );

      var persistedPK = loadLayer(LAYERS.PK);
      if (!persistedPK) {
        persistedPK = { type: 'FeatureCollection', features: [] };
        saveLayer(LAYERS.PK, persistedPK);
      }
      if (typeof window !== 'undefined') {
        window.json_PK = cloneFeatureCollection(persistedPK);
      }
      return;
    }

    /* Sauvegarder le schéma */
    setMeta('version', SCHEMA_VERSION);
    setMeta('schema', JSON.stringify(getSchemaDescription()));

    /* Sauvegarder les données GeoJSON existantes vers localStorage */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      saveLayer(LAYERS.ROUTES, json_Rseauroutier_6);
    }
    if (typeof json_Emprise_5 !== 'undefined') {
      saveLayer(LAYERS.EMPRISES, json_Emprise_5);
    }
    /* Initialiser PK vide si non existant */
    if (!loadLayer(LAYERS.PK)) {
      saveLayer(LAYERS.PK, { type: 'FeatureCollection', features: [] });
    }
    if (typeof window !== 'undefined') {
      window.json_PK = cloneFeatureCollection(loadLayer(LAYERS.PK));
    }

    setMeta('lastSync', new Date().toISOString());
  }

  /**
   * Retourne la description du schéma de données.
   * Préparation pour la future migration vers PostgreSQL/PostGIS.
   */
  function getSchemaDescription() {
    return {
      version: SCHEMA_VERSION,
      layers: {
        routes: {
          type: 'FeatureCollection',
          geometryType: 'LineString|MultiLineString',
          description: 'Réseau routier national du Togo',
          properties: [
            'id', 'Name', 'Code', 'CLASSE', 'REGIONS', 'Prefecture',
            'LONGEUR', 'Largeur', 'EMPRISE', 'Etat', 'Revetement',
            'Origine', 'Destination', 'Pop_Dessertie', 'Communes',
            'PK_DEB_X', 'PK_DEB_Y', 'PK_FIN_X', 'PK_FIN_Y',
            'Observations', 'status', 'createdAt', 'lastModified', 'modifiedBy'
          ]
        },
        emprises: {
          type: 'FeatureCollection',
          geometryType: 'Polygon',
          description: 'Zones tampon d\'emprise routière'
        },
        pk: {
          type: 'FeatureCollection',
          geometryType: 'Point',
          description: 'Points kilométriques de référence'
        }
      },
      audit: {
        table: 'audit_trail',
        columns: ['id', 'user', 'action', 'feature_id', 'timestamp', 'before_json', 'after_json']
      }
    };
  }

  /**
   * Synchronise les données GeoJSON globales vers le localStorage.
   * À appeler après chaque modification via SIGDataEngine.
   */
  function syncFromMemory() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      saveLayer(LAYERS.ROUTES, json_Rseauroutier_6);
    }
    if (typeof json_Emprise_5 !== 'undefined') {
      saveLayer(LAYERS.EMPRISES, json_Emprise_5);
    }
    if (typeof window !== 'undefined' && typeof window.json_PK !== 'undefined') {
      saveLayer(LAYERS.PK, window.json_PK);
    }
    setMeta('lastSync', new Date().toISOString());
  }

  /**
   * Vérifie si des données persistées existent et sont plus récentes
   * que les données en mémoire (pour restauration future).
   * @returns {boolean}
   */
  function hasPersistedData() {
    var routes = loadLayer(LAYERS.ROUTES);
    return routes && routes.features && routes.features.length > 0;
  }

  /**
   * Retourne la taille estimée du stockage en octets.
   * @returns {number}
   */
  function getStorageSize() {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) {
        total += (localStorage.getItem(key) || '').length * 2; /* UTF-16 = 2 octets/char */
      }
    }
    return total;
  }

  /* ===== API PUBLIQUE ===== */
  return {
    LAYERS: LAYERS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    saveLayer: saveLayer,
    saveAll: saveAll,
    saveFeature: saveFeature,
    loadLayer: loadLayer,
    loadAll: loadAll,
    deleteLayer: deleteLayer,
    deleteAll: deleteAll,
    setMeta: setMeta,
    getMeta: getMeta,
    initialize: initialize,
    syncFromMemory: syncFromMemory,
    hasPersistedData: hasPersistedData,
    getStorageSize: getStorageSize,
    getSchemaDescription: getSchemaDescription
  };
})();


/* ===================================================================
 * GeoROAD TOGO — SIG Audit Trail (V3.0 SIG Core)
 *
 * Système d'audit obligatoire pour le ministère des Travaux Publics.
 * Enregistre chaque action de modification du SIG avec :
 *   - Utilisateur (depuis la session AdminAuth)
 *   - Type d'action (CREATE, UPDATE, DELETE, EDIT_GEOMETRY)
 *   - Identifiant de la feature modifiée
 *   - Horodatage précis
 *   - État avant/après modification
 *
 * Stockage : localStorage (préparation pour future table PostgreSQL
 *   audit_trail avec colonnes : id, user, action, feature_id,
 *   timestamp, before_json, after_json, ip_address)
 *
 * Dépend : SIGEventBus (pour la propagation des événements d'audit)
 *           AdminAuth (optionnel, pour l'identification de l'utilisateur)
 * =================================================================== */
var SIGAuditTrail = (function() {
  'use strict';

  /* ===== STOCKAGE LOCAL ===== */
  var STORAGE_KEY = 'georoad_audit_trail';
  var MAX_ENTRIES = 500; /* Limiter à 500 entrées pour les performances */

  /* ===== TYPES D'ACTIONS ===== */
  var ACTIONS = {
    CREATE_ROUTE: 'CREATE_ROUTE',
    UPDATE_ROUTE: 'UPDATE_ROUTE',
    DELETE_ROUTE: 'DELETE_ROUTE',
    CREATE_PK: 'CREATE_PK',
    UPDATE_PK: 'UPDATE_PK',
    DELETE_PK: 'DELETE_PK',
    CREATE_EMPRISE: 'CREATE_EMPRISE',
    UPDATE_EMPRISE: 'UPDATE_EMPRISE',
    DELETE_EMPRISE: 'DELETE_EMPRISE',
    EDIT_GEOMETRY: 'EDIT_GEOMETRY',
    LOGIN: 'LOGIN',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT: 'LOGOUT',
    EXPORT: 'EXPORT',
    IMPORT: 'IMPORT',
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DELETED: 'USER_DELETED',
    SETTINGS_UPDATED: 'SETTINGS_UPDATED',
    ROUTE_EDITOR_OPENED: 'ROUTE_EDITOR_OPENED',
    ROUTE_DRAWN: 'ROUTE_DRAWN',
    VALIDATE_ROUTE: 'VALIDATE_ROUTE',
    PUBLISH_ROUTE: 'PUBLISH_ROUTE'
  };

  /* ===================================================================
   * ENREGISTREMENT D'AUDIT
   * =================================================================== */

  /**
   * Ajoute une entrée d'audit.
   *
   * @param {string} action - Type d'action (voir ACTIONS)
   * @param {Object} options
   * @param {string|number} [options.featureId] - ID de la feature concernée
   * @param {string} [options.featureName] - Nom de la route (pour lisibilité)
   * @param {Object} [options.before] - État avant modification (JSON sérialisable)
   * @param {Object} [options.after] - État après modification (JSON sérialisable)
   * @param {string} [options.details] - Description textuelle libre
   * @returns {Object} L'entrée d'audit créée
   */
  function normalizeLegacyOptions(options, legacyDetails) {
    if (typeof options === 'string') {
      return {
        source: options,
        details: legacyDetails || ''
      };
    }

    options = options || {};
    if (legacyDetails && !options.details) {
      options.details = legacyDetails;
    }
    return options;
  }

  function log(action, options, legacyDetails) {
    options = normalizeLegacyOptions(options, legacyDetails);

    /* Identifier l'utilisateur courant */
    var user = options.user || 'Anonyme';
    if (!options.user && typeof AdminAuth !== 'undefined') {
      var session = AdminAuth.getSession();
      if (session) {
        user = session.name || session.user || 'Inconnu';
      }
    }

    var entry = {
      id: generateId(),
      action: action,
      user: user,
      featureId: options.featureId !== undefined ? String(options.featureId) : null,
      featureName: options.featureName || null,
      timestamp: new Date().toISOString(),
      before: options.before || null,
      after: options.after || null,
      details: options.details || '',
      result: options.result || null,
      entityType: options.entityType || null,
      source: options.source || null
    };

    /* Stocker */
    var entries = loadEntries();
    entries.unshift(entry); /* Les plus récentes en premier */

    /* Limiter la taille */
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(0, MAX_ENTRIES);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      /* localStorage plein ou indisponible */
      if (typeof console !== 'undefined') {
        console.warn('[SIGAuditTrail] Impossible de sauvegarder l\'audit :', e);
      }
    }

    /* Émettre l'événement sur le bus */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.AUDIT_LOGGED, entry);
    }

    return entry;
  }

  /* ===================================================================
   * LECTURE DES ENTRÉES
   * =================================================================== */

  /**
   * Retourne toutes les entrées d'audit.
   * @returns {Object[]}
   */
  function getAll() {
    return loadEntries();
  }

  /**
   * Retourne les entrées filtrées par critères.
   *
   * @param {Object} filters
   * @param {string} [filters.action] - Filtrer par type d'action
   * @param {string} [filters.user] - Filtrer par utilisateur
   * @param {string} [filters.featureId] - Filtrer par ID de feature
   * @param {string} [filters.from] - Date ISO de début
   * @param {string} [filters.to] - Date ISO de fin
   * @param {number} [filters.limit] - Nombre max de résultats
   * @returns {Object[]}
   */
  function query(filters) {
    filters = filters || {};
    var entries = loadEntries();

    if (filters.action) {
      entries = entries.filter(function(e) { return e.action === filters.action; });
    }
    if (filters.user) {
      var userLower = filters.user.toLowerCase();
      entries = entries.filter(function(e) { return (e.user || '').toLowerCase().indexOf(userLower) !== -1; });
    }
    if (filters.featureId !== undefined && filters.featureId !== null) {
      entries = entries.filter(function(e) { return e.featureId === String(filters.featureId); });
    }
    if (filters.from) {
      var fromTime = new Date(filters.from).getTime();
      entries = entries.filter(function(e) { return new Date(e.timestamp).getTime() >= fromTime; });
    }
    if (filters.to) {
      var toTime = new Date(filters.to).getTime();
      entries = entries.filter(function(e) { return new Date(e.timestamp).getTime() <= toTime; });
    }
    if (filters.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  /**
   * Retourne les entrées d'audit pour une feature spécifique.
   * @param {string|number} featureId
   * @returns {Object[]}
   */
  function getFeatureHistory(featureId) {
    return query({ featureId: featureId });
  }

  /**
   * Retourne le nombre d'entrées par type d'action.
   * @returns {Object} { CREATE_ROUTE: 5, UPDATE_ROUTE: 12, ... }
   */
  function getActionCounts() {
    var entries = loadEntries();
    var counts = {};
    entries.forEach(function(e) {
      counts[e.action] = (counts[e.action] || 0) + 1;
    });
    return counts;
  }

  /**
   * Retourne les N modifications les plus récentes.
   * @param {number} [limit=10]
   * @returns {Object[]}
   */
  function getRecentChanges(limit) {
    return query({ limit: limit || 10 });
  }

  /**
   * Purge toutes les entrées d'audit.
   */
  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  /**
   * Retourne le nombre total d'entrées.
   * @returns {number}
   */
  function count() {
    return loadEntries().length;
  }

  /* ===================================================================
   * FORMATAGE POUR AFFICHAGE
   * =================================================================== */

  /**
   * Retourne le libellé français d'un type d'action.
   * @param {string} action
   * @returns {string}
   */
  function getActionLabel(action) {
    var labels = {
      'CREATE_ROUTE': 'Création de route',
      'UPDATE_ROUTE': 'Modification de route',
      'DELETE_ROUTE': 'Suppression de route',
      'CREATE_PK': 'Création de PK',
      'UPDATE_PK': 'Modification de PK',
      'DELETE_PK': 'Suppression de PK',
      'CREATE_EMPRISE': 'Création d\'emprise',
      'UPDATE_EMPRISE': 'Modification d\'emprise',
      'DELETE_EMPRISE': 'Suppression d\'emprise',
      'EDIT_GEOMETRY': 'Édition géométrique',
      'LOGIN': 'Connexion',
      'LOGIN_FAILED': 'Échec de connexion',
      'LOGOUT': 'Déconnexion',
      'EXPORT': 'Export de données',
      'IMPORT': 'Import de données',
      'USER_CREATED': 'Création d\'utilisateur',
      'USER_UPDATED': 'Modification d\'utilisateur',
      'USER_DELETED': 'Suppression d\'utilisateur',
      'SETTINGS_UPDATED': 'Mise à jour des paramètres',
      'ROUTE_EDITOR_OPENED': 'Ouverture de l\'éditeur',
      'ROUTE_DRAWN': 'Tracé de route',
      'VALIDATE_ROUTE': 'Validation de route',
      'PUBLISH_ROUTE': 'Publication de route'
    };
    if (labels[action]) return labels[action];
    return String(action || '')
      .toLowerCase()
      .split('_')
      .filter(Boolean)
      .map(function(part) { return part.charAt(0).toUpperCase() + part.slice(1); })
      .join(' ');
  }

  /**
   * Retourne l'icône Font Awesome pour un type d'action.
   * @param {string} action
   * @returns {string}
   */
  function getActionIcon(action) {
    var icons = {
      'CREATE_ROUTE': 'fa-plus-circle',
      'UPDATE_ROUTE': 'fa-pen',
      'DELETE_ROUTE': 'fa-trash',
      'CREATE_PK': 'fa-map-pin',
      'UPDATE_PK': 'fa-location-dot',
      'DELETE_PK': 'fa-trash',
      'CREATE_EMPRISE': 'fa-draw-polygon',
      'UPDATE_EMPRISE': 'fa-vector-square',
      'DELETE_EMPRISE': 'fa-trash',
      'EDIT_GEOMETRY': 'fa-draw-polygon',
      'LOGIN': 'fa-sign-in-alt',
      'LOGIN_FAILED': 'fa-user-lock',
      'LOGOUT': 'fa-sign-out-alt',
      'EXPORT': 'fa-download',
      'IMPORT': 'fa-upload',
      'USER_CREATED': 'fa-user-plus',
      'USER_UPDATED': 'fa-user-pen',
      'USER_DELETED': 'fa-user-xmark',
      'SETTINGS_UPDATED': 'fa-gear',
      'ROUTE_EDITOR_OPENED': 'fa-compass-drafting',
      'ROUTE_DRAWN': 'fa-road',
      'VALIDATE_ROUTE': 'fa-check-circle',
      'PUBLISH_ROUTE': 'fa-globe'
    };
    return icons[action] || 'fa-circle';
  }

  /* ===================================================================
   * UTILITAIRES INTERNES
   * =================================================================== */

  function loadEntries() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function generateId() {
    return 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /* ===== API PUBLIQUE ===== */
  return {
    ACTIONS: ACTIONS,
    log: log,
    getAll: getAll,
    query: query,
    getFeatureHistory: getFeatureHistory,
    getActionCounts: getActionCounts,
    getRecentChanges: getRecentChanges,
    clear: clear,
    count: count,
    getActionLabel: getActionLabel,
    getActionIcon: getActionIcon
  };
})();


/* ===================================================================
 * GeoROAD TOGO — SIG Data Engine (V3.0 SIG Core)
 *
 * Moteur central de données pour le système SIG ministériel.
 * Toute modification de route passe obligatoirement par ce moteur.
 *
 * Structure RouteFeature :
 * {
 *   id: string,
 *   geometry: { type: "LineString", coordinates: [[lon,lat], ...] },
 *   properties: {
 *     name, code, region, category, length, width, emprise,
 *     state, pavement, origin, destination, population,
 *     pk_start, pk_end, ...
 *   },
 *   metadata: {
 *     createdAt, updatedAt, createdBy, version
 *   }
 * }
 *
 * Architecture PostGIS future :
 *   - addFeature  → INSERT INTO routes (geometry, properties) VALUES (ST_GeomFromGeoJSON($1), $2)
 *   - updateFeature → UPDATE routes SET geometry = ST_GeomFromGeoJSON($1), properties = $2 WHERE id = $3
 *   - deleteFeature → DELETE FROM routes WHERE id = $1
 *   - getFeatureById → SELECT * FROM routes WHERE id = $1
 *   - getAllFeatures  → SELECT * FROM routes ORDER BY created_at DESC
 *
 * Dépend : SIGEventBus, SIGAuditTrail, SIGSpatialCalculator, SIGPersistence
 * =================================================================== */
var SIGDataEngine = (function() {
  'use strict';

  /* ===== ÉTAT INTERNE ===== */
  var _initialized = false;
  var _featureCounter = 0;

  /* ===================================================================
   * INITIALISATION
   * =================================================================== */

  /**
   * Initialise le moteur de données.
   * Charge les données GeoJSON globales et les enrichit avec
   * les métadonnées SIG (metadata).
   */
  function initialize() {
    if (_initialized) return;
    _initialized = true;

    /* Initialiser la persistance localStorage */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.initialize();
    }

    /* Enrichir les features existantes avec metadata si nécessaire */
    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      _featureCounter = json_Rseauroutier_6.features.length;
      var now = new Date().toISOString();

      json_Rseauroutier_6.features.forEach(function(f, idx) {
        if (!f.id) f.id = 'route_' + idx;
        if (!f.properties) f.properties = {};

        /* Initialiser les métadonnées */
        if (!f.properties.createdAt) f.properties.createdAt = now;
        if (!f.properties.lastModified) f.properties.lastModified = now;
        if (!f.properties.status) f.properties.status = 'published';
        if (!f.properties.modifiedBy) f.properties.modifiedBy = 'Système';
        if (!f.properties.version) f.properties.version = 1;
      });

      /* Persister l'état initial */
      if (typeof SIGPersistence !== 'undefined') {
        SIGPersistence.syncFromMemory();
      }
    }

    /* Écouter les événements du bus pour la persistance automatique */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, onFeatureChanged);
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, onFeatureChanged);
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, onFeatureChanged);
      SIGEventBus.on(SIGEventBus.EVENTS.GEOMETRY_UPDATED, onFeatureChanged);
    }
  }

  /**
   * Callback interne : à chaque modification de feature,
   * synchroniser la persistance.
   */
  function onFeatureChanged() {
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.syncFromMemory();
    }
  }

  /* ===================================================================
   * CRUD — CREATE
   * =================================================================== */

  /**
   * Ajoute une nouvelle route au SIG.
   * Passe obligatoirement par ce moteur (pas de modification directe
   * des données UI ou de la variable globale).
   *
   * @param {Object} route - Données de la route
   * @param {Object} route.geometry - Géométrie GeoJSON
   * @param {Object} route.properties - Propriétés de la route
   * @returns {Object} La feature créée (format enrichi)
   */
  function addFeature(route) {
    if (!route || !route.geometry) {
      throw new Error('SIGDataEngine.addFeature : geometry requise.');
    }

    /* Validation géométrique */
    if (typeof SIGSpatialCalculator !== 'undefined') {
      var validation = SIGSpatialCalculator.validateGeometry(route.geometry);
      if (!validation.valid) {
        throw new Error('SIGDataEngine.addFeature : géométrie invalide — ' + validation.errors.join(', '));
      }
    }

    /* Calculer la longueur si non fournie */
    var props = Object.assign({}, route.properties || {});
    if (!props.LONGEUR && typeof SIGSpatialCalculator !== 'undefined') {
      props.LONGEUR = Math.round(SIGSpatialCalculator.calculateLength(route.geometry));
    }

    /* Enrichir les métadonnées */
    var now = new Date().toISOString();
    var user = getCurrentUser();
    var featureId = 'route_' + Date.now() + '_' + (++_featureCounter);

    var feature = {
      type: 'Feature',
      id: featureId,
      geometry: route.geometry,
      properties: Object.assign({}, props, {
        createdAt: now,
        lastModified: now,
        modifiedBy: user,
        status: 'draft',
        version: 1
      })
    };

    /* Ajouter au GeoJSON global */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      json_Rseauroutier_6.features.push(feature);
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.CREATE_ROUTE, {
        featureId: featureId,
        featureName: props.Name,
        after: { properties: props, geometryType: route.geometry.type }
      });
    }

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_CREATED, {
        featureId: featureId,
        feature: feature
      });
    }

    return feature;
  }

  /* ===================================================================
   * CRUD — READ
   * =================================================================== */

  /**
   * Retourne une feature par son ID.
   * @param {string|number} id - ID de la feature
   * @returns {Object|null} Feature GeoJSON ou null
   */
  function getFeatureById(id) {
    if (typeof json_Rseauroutier_6 === 'undefined') return null;
    var strId = String(id);

    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var f = json_Rseauroutier_6.features[i];
      if (f.id === strId) {
        return f;
      }
    }
    return null;
  }

  /**
   * Retourne l'index d'une feature dans le GeoJSON global par son ID.
   * @param {string|number} id
   * @returns {number} Index ou -1
   */
  function getFeatureIndex(id) {
    if (typeof json_Rseauroutier_6 === 'undefined') return -1;
    var strId = String(id);

    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var f = json_Rseauroutier_6.features[i];
      if (f.id === strId) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Retourne toutes les features du réseau routier.
   * @returns {Object[]} Array de features GeoJSON
   */
  function getAllFeatures() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      return json_Rseauroutier_6.features || [];
    }
    return [];
  }

  /**
   * Retourne le FeatureCollection complet.
   * @returns {Object}
   */
  function getFeatureCollection() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      return json_Rseauroutier_6;
    }
    return { type: 'FeatureCollection', features: [] };
  }

  /* ===================================================================
   * CRUD — UPDATE
   * =================================================================== */

  /**
   * Met à jour une feature existante.
   * Passe obligatoirement par ce moteur.
   *
   * @param {string|number} id - ID de la feature
   * @param {Object} newData - Nouvelles données (propriétés et/ou géométrie)
   * @param {Object} [newData.properties] - Nouvelles propriétés (fusionnées)
   * @param {Object} [newData.geometry] - Nouvelle géométrie (remplacement)
   * @returns {Object|null} La feature mise à jour ou null si non trouvée
   */
  function updateFeature(id, newData) {
    if (!newData) return null;

    var idx = getFeatureIndex(id);
    if (idx < 0) return null;

    var feature = json_Rseauroutier_6.features[idx];

    /* Sauvegarder l'état avant (pour l'audit) */
    var before = {
      properties: Object.assign({}, feature.properties),
      geometryType: feature.geometry ? feature.geometry.type : null
    };

    /* Mettre à jour les propriétés (fusion) */
    if (newData.properties) {
      Object.keys(newData.properties).forEach(function(key) {
        feature.properties[key] = newData.properties[key];
      });
    }

    /* Mettre à jour la géométrie (remplacement) */
    if (newData.geometry) {
      feature.geometry = newData.geometry;
    }

    /* Recalculer la longueur si la géométrie a changé */
    if (newData.geometry && typeof SIGSpatialCalculator !== 'undefined') {
      feature.properties.LONGEUR = Math.round(
        SIGSpatialCalculator.calculateLength(feature.geometry)
      );
    }

    /* Mettre à jour les métadonnées */
    var now = new Date().toISOString();
    feature.properties.lastModified = now;
    feature.properties.modifiedBy = getCurrentUser();
    feature.properties.version = (feature.properties.version || 1) + 1;

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.UPDATE_ROUTE, {
        featureId: id,
        featureName: feature.properties.Name,
        before: before,
        after: {
          properties: Object.assign({}, feature.properties),
          geometryType: feature.geometry ? feature.geometry.type : null
        }
      });
    }

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_UPDATED, {
        featureId: id,
        feature: feature,
        index: idx
      });
    }

    return feature;
  }

  /* ===================================================================
   * CRUD — DELETE
   * =================================================================== */

  /**
   * Supprime une feature du SIG.
   * Passe obligatoirement par ce moteur.
   *
   * @param {string|number} id - ID de la feature
   * @returns {boolean} true si supprimée
   */
  function deleteFeature(id) {
    var idx = getFeatureIndex(id);
    if (idx < 0) return false;

    var feature = json_Rseauroutier_6.features[idx];

    /* Sauvegarder l'état avant (pour l'audit) */
    var before = {
      properties: Object.assign({}, feature.properties),
      geometryType: feature.geometry ? feature.geometry.type : null
    };

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.DELETE_ROUTE, {
        featureId: id,
        featureName: feature.properties.Name,
        before: before
      });
    }

    /* Supprimer du GeoJSON global */
    json_Rseauroutier_6.features.splice(idx, 1);

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_DELETED, {
        featureId: id,
        index: idx
      });
    }

    return true;
  }

  /* ===================================================================
   * STATISTIQUES SPATIALES
   * =================================================================== */

  /**
   * Calcule les statistiques spatiales globales du réseau.
   * Utilise SIGSpatialCalculator pour les calculs géodésiques.
   *
   * @returns {Object}
   *   - totalLength (km)
   *   - totalFeatures
   *   - byCategory { RN: { count, km }, RR: { count, km }, ... }
   *   - byRegion { Centre: { count, km }, Kara: { count, km }, ... }
   *   - avgLength (km)
   *   - auditCount
   */
  function computeSpatialStats() {
    var stats = {
      totalLength: 0,
      totalFeatures: 0,
      byCategory: {},
      byRegion: {},
      avgLength: 0,
      auditCount: 0
    };

    var features = getAllFeatures();
    stats.totalFeatures = features.length;

    /* Utiliser SIGSpatialCalculator si disponible */
    if (typeof SIGSpatialCalculator !== 'undefined') {
      var agg = SIGSpatialCalculator.computeAggregatedStats(features);
      stats.totalLength = agg.totalLength;
      stats.byCategory = agg.byCategory;
      stats.byRegion = agg.byRegion;
      stats.avgLength = agg.avgLength;
    } else {
      /* Fallback : calcul simple */
      features.forEach(function(f) {
        var len = (f.properties && f.properties.LONGEUR) || 0;
        var lenKm = len / 1000;
        stats.totalLength += lenKm;

        var cls = (f.properties && f.properties.CLASSE) || 'Non défini';
        if (!stats.byCategory[cls]) stats.byCategory[cls] = { count: 0, km: 0 };
        stats.byCategory[cls].count++;
        stats.byCategory[cls].km += lenKm;

        var reg = (f.properties && f.properties.REGIONS) || 'Non défini';
        if (!stats.byRegion[reg]) stats.byRegion[reg] = { count: 0, km: 0 };
        stats.byRegion[reg].count++;
        stats.byRegion[reg].km += lenKm;
      });
      stats.avgLength = stats.totalFeatures > 0 ? stats.totalLength / stats.totalFeatures : 0;
    }

    /* Arrondir */
    stats.totalLength = Math.round(stats.totalLength * 100) / 100;
    stats.avgLength = Math.round(stats.avgLength * 100) / 100;

    /* Nombre d'entrées d'audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      stats.auditCount = SIGAuditTrail.count();
    }

    /* Émettre l'événement de stats */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.STATS_CHANGED, stats);
    }

    return stats;
  }

  /* ===================================================================
   * UTILITAIRES INTERNES
   * =================================================================== */

  /**
   * Retourne le nom de l'utilisateur courant depuis AdminAuth.
   */
  function getCurrentUser() {
    if (typeof AdminAuth !== 'undefined') {
      var session = AdminAuth.getSession();
      if (session) return session.name || session.user || 'Utilisateur';
    }
    return 'Utilisateur';
  }

  /**
   * Génère un ID unique pour une nouvelle feature.
   * @returns {string}
   */
  function generateId() {
    return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  /* ===================================================================
   * MISE À JOUR DE GÉOMÉTRIE SPÉCIFIQUE
   * =================================================================== */

  /**
   * Met à jour uniquement la géométrie d'une feature.
   * Variante optimisée de updateFeature pour les modifications géométriques.
   *
   * @param {string|number} id - ID de la feature
   * @param {Object} newGeometry - Nouvelle géométrie GeoJSON
   * @returns {Object|null}
   */
  function updateGeometry(id, newGeometry) {
    if (!newGeometry) return null;

    var idx = getFeatureIndex(id);
    if (idx < 0) return null;

    var feature = json_Rseauroutier_6.features[idx];

    /* Sauvegarder l'état avant */
    var beforeGeom = feature.geometry ? JSON.parse(JSON.stringify(feature.geometry)) : null;

    /* Mettre à jour */
    feature.geometry = newGeometry;

    /* Recalculer la longueur */
    if (typeof SIGSpatialCalculator !== 'undefined') {
      feature.properties.LONGEUR = Math.round(
        SIGSpatialCalculator.calculateLength(newGeometry)
      );
    }

    /* Mettre à jour les métadonnées */
    var now = new Date().toISOString();
    feature.properties.lastModified = now;
    feature.properties.modifiedBy = getCurrentUser();
    feature.properties.version = (feature.properties.version || 1) + 1;

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.EDIT_GEOMETRY, {
        featureId: id,
        featureName: feature.properties.Name,
        before: { geometry: beforeGeom },
        after: { geometry: newGeometry }
      });
    }

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.GEOMETRY_UPDATED, {
        featureId: id,
        feature: feature,
        index: idx
      });
    }

    return feature;
  }

  /* ===== API PUBLIQUE ===== */
  return {
    initialize: initialize,
    addFeature: addFeature,
    getFeatureById: getFeatureById,
    getFeatureIndex: getFeatureIndex,
    getAllFeatures: getAllFeatures,
    getFeatureCollection: getFeatureCollection,
    updateFeature: updateFeature,
    updateGeometry: updateGeometry,
    deleteFeature: deleteFeature,
    computeSpatialStats: computeSpatialStats,
    generateId: generateId
  };
})();