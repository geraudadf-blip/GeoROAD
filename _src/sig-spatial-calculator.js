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