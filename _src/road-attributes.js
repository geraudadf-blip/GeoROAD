/* ===================================================================
 * GeoROAD TOGO — Formulaire d'Attributs Routiers (étendu)
 *
 * Génère le formulaire complet avec hiérarchie administrative,
 * attributs SIG, et champs métier.
 *
 * Architecture préparée pour PostgreSQL/PostGIS :
 *   - Les listes (sens, statut, type, précision) peuvent être
 *     chargées depuis des tables de référence via /api/references
 *   - Le champ "Agent" sera alimenté par la session JWT
 *
 * Dépend : AdministrativeHierarchy
 * =================================================================== */
var RoadAttributes = (function() {
  'use strict';

  /* ===== RÉFÉRENTIELS ===== */
  /* Futur : charger depuis /api/references */
  var CATEGORIES = [
    ['CU', 'Route Communautaire'],
    ['RN', 'Route Nationale'],
    ['RR', 'Route R\u00e9gionale'],
    ['RC', 'Route Communale'],
    ['RL', 'Route Locale']
  ];

  var TYPES_ROUTE = [
    ['Nationale', 'Nationale'],
    ['R\u00e9gionale', 'R\u00e9gionale'],
    ['Départementale', 'D\u00e9partementale'],
    ['Rurale', 'Rurale'],
    ['Urbaine', 'Urbaine'],
    ['Piste', 'Piste']
  ];

  var CLASSES_ADMIN = [
    ['Classe 1', 'Classe 1 (Autoroute)'],
    ['Classe 2', 'Classe 2 (Route à 2 voies)'],
    ['Classe 3', 'Classe 3 (Route bitumée)'],
    ['Classe 4', 'Classe 4 (Route en terre)'],
    ['Classe 5', 'Classe 5 (Piste)']
  ];

  var STATUTS = [
    ['En service', 'En service'],
    ['En travaux', 'En travaux'],
    ['Ferme', 'Ferm\u00e9'],
    ['Projet', 'Projet'],
    ['Abandonne', 'Abandonn\u00e9']
  ];

  var SENS_CIRCULATION = [
    ['Double sens', 'Double sens'],
    ['Sens unique', 'Sens unique'],
    ['Sens alterné', 'Sens altern\u00e9']
  ];

  var REVETEMENTS = [
    ['Bitume', 'Bitume'],
    ['Béton', 'B\u00e9ton'],
    ['Terre', 'Terre'],
    ['Gravier', 'Gravier'],
    ['Non revetu', 'Non rev\u00eatu']
  ];

  var ETATS = [
    ['Bon', 'Bon'],
    ['Moyen', 'Moyen'],
    ['Mauvais', 'Mauvais'],
    ['En travaux', 'En travaux']
  ];

  var PRECISION_GNSS = [
    ['Centimétrique', 'Centim\u00e9trique (RTK)'],
    ['Décimétrique', 'D\u00e9cim\u00e9trique'],
    ['Métrique', 'M\u00e9trique'],
    ['Décamétrique', 'D\u00e9cam\u00e9trique'],
    ['Héritage', 'H\u00e9ritage (donn\u00e9es existantes)']
  ];

  var SOURCES = [
    ['Levé GNSS', 'Lev\u00e9 GNSS terrain'],
    ['Photo-aérienne', 'Photo a\u00e9rienne / Orthophoto'],
    ['Satellite', 'Imagerie satellite'],
    ['OpenStreetMap', 'OpenStreetMap'],
    ['DGMRTP', 'DGMRTP / Ministère des Travaux Publics'],
    ['Héritage SIG', 'H\u00e9ritage SIG existant']
  ];

  /* ===== CHAMPS INFO GÉOMÉTRIE (calculés, non éditables) ===== */
  var GEO_FIELDS = ['Longueur_calculee', 'Nb_sommets'];

  /* ===================================================================
   * CONSTRUCTION DU FORMULAIRE
   * =================================================================== */

  /**
   * Génère le formulaire complet des attributs d'une route.
   * @param {Object} existingProps - Propriétés existantes (édition) ou {} (création)
   * @param {Object} geoInfo - { length: number, vertices: number } (infos calculées)
   * @returns {string} HTML du formulaire
   */
  function renderForm(existingProps, geoInfo) {
    var p = existingProps || {};
    geoInfo = geoInfo || {};

    /* Agent : futur depuis session JWT */
    var agent = p.Agent || '';
    if (!agent && typeof AdminAuth !== 'undefined') {
      var session = AdminAuth.getSession();
      if (session) agent = session.name || session.username || '';
    }

    var html = '<form id="sig-route-form" onsubmit="return false;">';

    /* --- Section 1 : Identification --- */
    html += sectionTitle('Identification de la route');
    html += formRow(
      formGroup('Nom de la route *', '<input type="text" name="Name" required value="' + ea(p.Name) + '" placeholder="Ex: Lom\u00e9-Sokod\u00e9">'),
      formGroup('Code officiel', '<input type="text" name="Code" value="' + ea(p.Code) + '" placeholder="Ex: RN1">')
    );
    html += formRow(
      formGroup('Origine', '<input type="text" name="Origine" value="' + ea(p.Origine) + '" placeholder="Ex: Lom\u00e9">'),
      formGroup('Destination', '<input type="text" name="Destination" value="' + ea(p.Destination) + '" placeholder="Ex: Sokod\u00e9">')
    );

    /* --- Section 2 : Classification --- */
    html += sectionTitle('Classification');
    html += formRow(
      formGroup('Cat\u00e9gorie (CLASSE) *', buildSelect('CLASSE', CATEGORIES, p.CLASSE)),
      formGroup('Type de route', buildSelect('Type_route', TYPES_ROUTE, p.Type_route))
    );
    html += formRow(
      formGroup('Classe administrative', buildSelect('Classe_admin', CLASSES_ADMIN, p.Classe_admin)),
      formGroup('Statut', buildSelect('Statut', STATUTS, p.Statut))
    );

    /* --- Section 3 : Localisation administrative --- */
    html += sectionTitle('Localisation administrative');
    if (typeof AdministrativeHierarchy !== 'undefined') {
      html += formRow(
        formGroup('R\u00e9gion *', AdministrativeHierarchy.renderRegionSelect(p.REGIONS)),
        formGroup('Pr\u00e9fecture *', AdministrativeHierarchy.renderPrefectureSelect(p.REGIONS, p.Prefecture))
      );
      html += formRow(
        formGroup('Canton', AdministrativeHierarchy.renderCantonSelect(p.Prefecture, p.Canton)),
        formGroup('Localit\u00e9(s) desservie(s)', '<input type="text" name="Localites" value="' + ea(p.Localites) + '" placeholder="Ex: Agbandi, Blitta-Gare">')
      );
    } else {
      html += formRow(
        formGroup('R\u00e9gion *', '<input type="text" name="REGIONS" required value="' + ea(p.REGIONS) + '">'),
        formGroup('Pr\u00e9fecture *', '<input type="text" name="Prefecture" required value="' + ea(p.Prefecture) + '">')
      );
    }

    /* --- Section 4 : Caractéristiques physiques --- */
    html += sectionTitle('Caract\u00e9ristiques physiques');
    html += formRow(
      formGroup('Longueur (m)', '<input type="number" name="LONGEUR" step="0.01" value="' + (geoInfo.length ? (geoInfo.length).toFixed(1) : (p.LONGEUR || '')) + '" ' + (geoInfo.length ? 'readonly style="background:var(--cream-2)"' : '') + ' id="sig-field-longueur">'),
      formGroup('Largeur de chauss\u00e9e (m)', '<input type="number" name="Largeur" step="0.1" value="' + ea(p.Largeur) + '" placeholder="Ex: 7">')
    );
    html += formRow(
      formGroup('Emprise r\u00e9glementaire (m)', '<input type="number" name="EMPRISE" step="1" value="' + (p.EMPRISE || '') + '" placeholder="Ex: 70">'),
      formGroup('Nombre de sommets', '<input type="number" name="Nb_sommets" value="' + (geoInfo.vertices || p.Nb_sommets || '') + '" readonly style="background:var(--cream-2)">')
    );
    html += formRow(
      formGroup('Type de rev\u00eatement', buildSelect('Revetement', REVETEMENTS, p.Revetement)),
      formGroup('\u00c9tat', buildSelect('Etat', ETATS, p.Etat))
    );
    html += formRow(
      formGroup('Sens de circulation', buildSelect('Sens_circulation', SENS_CIRCULATION, p.Sens_circulation)),
      formGroup('Population desservie', '<input type="number" name="Pop_Dessertie" value="' + ea(p.Pop_Dessertie) + '" placeholder="Ex: 15000">')
    );

    /* --- Section 5 : PK et coordonnées --- */
    html += sectionTitle('Points kilom\u00e9triques');
    html += formRow(
      formGroup('PK D\u00e9but X', '<input type="number" name="PK_DEB_X" step="0.001" value="' + (p.PK_DEB_X || '') + '">'),
      formGroup('PK D\u00e9but Y', '<input type="number" name="PK_DEB_Y" step="0.001" value="' + (p.PK_DEB_Y || '') + '">')
    );
    html += formRow(
      formGroup('PK Fin X', '<input type="number" name="PK_FIN_X" step="0.001" value="' + (p.PK_FIN_X || '') + '">'),
      formGroup('PK Fin Y', '<input type="number" name="PK_FIN_Y" step="0.001" value="' + (p.PK_FIN_Y || '') + '">')
    );

    /* --- Section 6 : Métadonnées --- */
    html += sectionTitle('M\u00e9tadonn\u00e9es');
    html += formRow(
      formGroup('Source des donn\u00e9es', buildSelect('Source', SOURCES, p.Source)),
      formGroup('Pr\u00e9cision GNSS', buildSelect('Precision_GNSS', PRECISION_GNSS, p.Precision_GNSS))
    );
    html += formRow(
      formGroup('Agent (modificateur)', '<input type="text" name="Agent" value="' + ea(agent) + '" placeholder="Nom de l\'agent">'),
      formGroup('Date de cr\u00e9ation', '<input type="date" name="Date_creation" value="' + (p.Date_creation || new Date().toISOString().slice(0, 10)) + '">')
    );
    html += formRow(
      formGroup('Derni\u00e8re MAJ', '<input type="date" name="Date_maj" value="' + (p.Date_maj || new Date().toISOString().slice(0, 10)) + '" readonly style="background:var(--cream-2)">'),
      formGroup('', '')
    );

    /* --- Section 7 : Commentaires --- */
    html += sectionTitle('Commentaires');
    html += '<div class="sig-form-row-single">';
    html += formGroup('Commentaires', '<textarea name="Observations" rows="3" placeholder="Remarques, notes techniques...">' + eh(p.Observations) + '</textarea>');
    html += '</div>';

    html += '</form>';
    return html;
  }

  /**
   * Extrait les données du formulaire DOM.
   * @returns {Object} Propriétés prêtes à enregistrer
   */
  function getFormData() {
    var form = document.getElementById('sig-route-form');
    if (!form) return {};
    var data = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(function(el) {
      var v = el.value;
      if (el.type === 'number' && v !== '') v = parseFloat(v);
      if (GEO_FIELDS.indexOf(el.name) !== -1) return; /* Champs calculés, on les garde read-only */
      data[el.name] = v;
    });
    /* Auto-fill Origine/Destination depuis le nom si vides */
    if (data.Name && !data.Origine) {
      var parts = data.Name.split('-');
      data.Origine = parts[0] ? parts[0].trim() : '';
      data.Destination = parts[1] ? parts[1].trim() : '';
    }
    /* Date de MAJ auto */
    data.Date_maj = new Date().toISOString().slice(0, 10);
    return data;
  }

  /**
   * Met en place les événements de cascade sur les selects hiérarchiques.
   * Doit être appelé après renderForm() et insertion dans le DOM.
   */
  function initHierarchyEvents() {
    if (typeof AdministrativeHierarchy === 'undefined') return;

    var regionSelect = document.getElementById('sig-hierarchy-region');
    var prefSelect = document.getElementById('sig-hierarchy-prefecture');
    var cantonSelect = document.getElementById('sig-hierarchy-canton');

    if (regionSelect) {
      regionSelect.addEventListener('change', function() {
        var region = this.value;
        /* Mettre à jour les préfectures */
        if (prefSelect) {
          prefSelect.outerHTML = AdministrativeHierarchy.renderPrefectureSelect(region, '', 'Prefecture');
          var newPref = document.getElementById('sig-hierarchy-prefecture');
          if (newPref) newPref.addEventListener('change', onPrefectureChange);
        }
        /* Vider les cantons */
        if (cantonSelect) {
          cantonSelect.outerHTML = AdministrativeHierarchy.renderCantonSelect('', '', 'Canton');
        }
      });
    }

    if (prefSelect) {
      prefSelect.addEventListener('change', onPrefectureChange);
    }
  }

  function onPrefectureChange() {
    var prefSelect = document.getElementById('sig-hierarchy-prefecture');
    var cantonSelect = document.getElementById('sig-hierarchy-canton');
    if (prefSelect && cantonSelect) {
      var pref = prefSelect.value;
      cantonSelect.outerHTML = AdministrativeHierarchy.renderCantonSelect(pref, '', 'Canton');
    }
  }

  /* ===== HELPERS HTML ===== */

  function sectionTitle(title) {
    return '<div class="sig-form-section-title"><i class="fas fa-chevron-right"></i> ' + title + '</div>';
  }

  function formGroup(label, inputHtml) {
    return '<div class="sig-fm-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function formRow(left, right) {
    return '<div class="sig-form-row">' + left + right + '</div>';
  }

  function buildSelect(name, options, current) {
    var html = '<select name="' + name + '">';
    html += '<option value="">-- Non d\u00e9fini --</option>';
    options.forEach(function(o) {
      var val = o[0], label = o[1];
      var sel = String(val) === String(current) ? ' selected' : '';
      html += '<option value="' + ea(val) + '"' + sel + '>' + eh(label) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function ea(s) { return escAttr(s); }
  function eh(s) { return escHtml(s); }
  function escAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ===== API PUBLIQUE ===== */
  return {
    renderForm: renderForm,
    getFormData: getFormData,
    initHierarchyEvents: initHierarchyEvents,
    CATEGORIES: CATEGORIES,
    ETATS: ETATS,
    REVETEMENTS: REVETEMENTS,
    STATUTS: STATUTS
  };
})();