/* ===================================================================
 * GeoROAD TOGO — Module de Validation des Routes
 *
 * Vérifie les données d'une route avant enregistrement.
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Les vérifications de doublon utiliseront un futur
 *     SELECT COUNT(*) FROM routes WHERE name = $1
 *   - Les vérifications géométriques utiliseront ST_IsValid()
 *
 * Dépend : aucune (module autonome)
 * =================================================================== */
var RoadValidator = (function() {
  'use strict';

  /**
   * Valide l'ensemble des données d'une route avant enregistrement.
   * @param {Object} attrs - Propriétés de la route
   * @param {Object|null} geometry - Géométrie GeoJSON (peut être null en mode formulaire seul)
   * @param {Object} context - { allRoutes: Array, existingId: number|null }
   * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
   */
  function validate(attrs, geometry, context) {
    var errors = [];
    var warnings = [];

    /* --- GÉOMÉTRIE --- */
    if (geometry !== null && geometry !== undefined) {
      if (!geometry || !geometry.type) {
        errors.push('La g\u00e9om\u00e9trie est vide ou invalide.');
      } else {
        /* Vérifier les coordonnées */
        var coords = geometry.coordinates;
        if (geometry.type === 'LineString' && (!coords || coords.length < 2)) {
          errors.push('La polyligne doit contenir au moins 2 sommets.');
        } else if (geometry.type === 'MultiLineString') {
          var hasValidLine = false;
          if (coords && coords.length > 0) {
            for (var i = 0; i < coords.length; i++) {
              if (coords[i] && coords[i].length >= 2) { hasValidLine = true; break; }
            }
          }
          if (!hasValidLine) errors.push('La multiligne doit contenir au moins une ligne avec 2 sommets.');
        }

        /* Vérifier les coordonnées Togo (lon: ~0.0 à 1.8, lat: ~6.0 à 11.0) */
        var allCoords = extractAllCoords(geometry);
        for (var j = 0; j < allCoords.length; j++) {
          var c = allCoords[j];
          if (c[0] < -1 || c[0] > 3 || c[1] < 5 || c[1] > 12) {
            warnings.push('Le sommet ' + (j + 1) + ' (' + c[1].toFixed(4) + ', ' + c[0].toFixed(4) + ') semble hors du territoire togolais.');
          }
        }
      }
    }

    /* --- ATTRIBUTS OBLIGATOIRES --- */
    if (!attrs.Name || !attrs.Name.trim()) {
      errors.push('Le nom de la route est obligatoire.');
    }
    if (!attrs.CLASSE || !attrs.CLASSE.trim()) {
      errors.push('La cat\u00e9gorie de la route est obligatoire.');
    }
    if (!attrs.REGIONS || !attrs.REGIONS.trim()) {
      errors.push('La r\u00e9gion est obligatoire.');
    }
    if (!attrs.Prefecture || !attrs.Prefecture.trim()) {
      errors.push('La pr\u00e9fecture est obligatoire.');
    }

    /* --- DOUBLONS --- */
    if (context && context.allRoutes && attrs.Name) {
      var name = attrs.Name.trim().toLowerCase();
      for (var k = 0; k < context.allRoutes.length; k++) {
        var existing = context.allRoutes[k];
        /* Ignorer la route elle-même en cas de modification — comparaison par index ou Name */
        if (context.existingId !== undefined) {
          if (existing.id === context.existingId) continue;
          /* Les features GeoJSON de ce projet n'ont pas toujours de champ id ;
             fallback : comparer par nom si existingId est un nom (string) */
          if (typeof context.existingId === 'string' &&
              (existing.properties.Name || '').trim().toLowerCase() === context.existingId.trim().toLowerCase()) continue;
        }
        var existingName = (existing.properties.Name || '').trim().toLowerCase();
        if (existingName === name) {
          errors.push('Une route nommée "' + existing.properties.Name + '" existe déjà.');
          break;
        }
      }
    }

    /* --- COHÉRENCE ADMINISTRATIVE --- */
    if (typeof AdministrativeHierarchy !== 'undefined') {
      if (attrs.REGIONS && attrs.Prefecture) {
        if (!AdministrativeHierarchy.isPrefectureInRegion(attrs.Prefecture, attrs.REGIONS)) {
          warnings.push('La pr\u00e9fecture "' + attrs.Prefecture + '" ne semble pas appartenir \u00e0 la r\u00e9gion "' + attrs.REGIONS + '".');
        }
      }
      if (attrs.Prefecture && attrs.Canton) {
        if (!AdministrativeHierarchy.isCantonInPrefecture(attrs.Canton, attrs.Prefecture)) {
          warnings.push('Le canton "' + attrs.Canton + '" ne semble pas appartenir \u00e0 la pr\u00e9fecture "' + attrs.Prefecture + '".');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    };
  }

  /**
   * Extrait toutes les coordonnées plates d'une géométrie GeoJSON.
   * @param {Object} geom
   * @returns {Array[]} [[lon, lat], ...]
   */
  function extractAllCoords(geom) {
    var result = [];
    if (!geom || !geom.coordinates) return result;
    if (geom.type === 'Point') {
      result.push(geom.coordinates);
    } else if (geom.type === 'LineString') {
      geom.coordinates.forEach(function(c) { result.push(c); });
    } else if (geom.type === 'MultiLineString') {
      geom.coordinates.forEach(function(line) {
        line.forEach(function(c) { result.push(c); });
      });
    } else if (geom.type === 'Polygon') {
      geom.coordinates[0].forEach(function(c) { result.push(c); });
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(function(poly) {
        poly[0].forEach(function(c) { result.push(c); });
      });
    }
    return result;
  }

  /**
   * Calcule la longueur d'une géométrie en mètres.
   * @param {Object} geom - Géométrie GeoJSON
   * @returns {number} Longueur en mètres
   */
  function computeLength(geom) {
    if (!geom || !geom.coordinates) return 0;
    if (typeof ol !== 'undefined' && ol.sphere) {
      var format = new ol.format.GeoJSON();
      var olGeom = format.readGeometry(geom, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
      return ol.sphere.getLength(olGeom);
    }
    /* Fallback : distance haversine sommaire sur LineString */
    var total = 0;
    var coords = geom.coordinates;
    if (geom.type === 'LineString' && coords.length > 1) {
      for (var i = 1; i < coords.length; i++) {
        total += haversine(coords[i - 1], coords[i]);
      }
    }
    return total;
  }

  /**
   * Compte le nombre total de sommets d'une géométrie.
   * @param {Object} geom
   * @returns {number}
   */
  function countVertices(geom) {
    return extractAllCoords(geom).length;
  }

  /* Haversine distance en mètres entre deux points [lon, lat] */
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

  /* ===== API PUBLIQUE ===== */
  return {
    validate: validate,
    computeLength: computeLength,
    countVertices: countVertices,
    extractAllCoords: extractAllCoords
  };
})();