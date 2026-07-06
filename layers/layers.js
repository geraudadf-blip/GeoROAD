ol.proj.proj4.register(proj4);

/* ===== UTM Zones — Afrique de l'Ouest ===== */
proj4.defs('EPSG:32630', '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32631', '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs');
try { ol.proj.proj4.register(proj4); } catch(e) {}

var wms_layers = [];
var baseTileGrid = ol.tilegrid.createXYZ({maxZoom: 21});

/* ===== BASE LAYERS (only one visible at a time) ===== */
var lyr_GoogleSatellite_0 = new ol.layer.Tile({
    'title': 'Google Satellite',
    'type': 'base',
    'baseLayer': true,
    'opacity': 1.000000,
    visible: true,
    source: new ol.source.XYZ({
        attributions: '© Google',
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
        tileGrid: baseTileGrid,
        url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
    })
});

var lyr_OpenStreetMap_1 = new ol.layer.Tile({
    'title': 'OpenStreetMap',
    'type': 'base',
    'baseLayer': true,
    'opacity': 1.000000,
    visible: false,
    source: new ol.source.XYZ({
        attributions: '© OpenStreetMap contributors',
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
        tileGrid: baseTileGrid,
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    })
});

var lyr_GoogleHybrid_2 = new ol.layer.Tile({
    'title': 'Google Hybrid',
    'type': 'base',
    'baseLayer': true,
    'opacity': 1.000000,
    visible: false,
    source: new ol.source.XYZ({
        attributions: '© Google',
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
        tileGrid: baseTileGrid,
        url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
    })
});

/* ===== NEW: Light basemap (CartoDB Positron) ===== */
var lyr_Light_3 = new ol.layer.Tile({
    'title': 'Fond clair',
    'type': 'base',
    'baseLayer': true,
    'opacity': 1.000000,
    visible: false,
    source: new ol.source.XYZ({
        attributions: '© CartoDB © OpenStreetMap contributors',
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
        tileGrid: baseTileGrid,
        url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
    })
});

/* ===== NEW: Topographic basemap (OpenTopoMap) ===== */
var lyr_Topographic_4 = new ol.layer.Tile({
    'title': 'Topographique',
    'type': 'base',
    'baseLayer': true,
    'opacity': 1.000000,
    visible: false,
    source: new ol.source.XYZ({
        attributions: '© OpenStreetMap contributors © OpenTopoMap',
        crossOrigin: 'anonymous',
        projection: 'EPSG:3857',
        tileGrid: baseTileGrid,
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png'
    })
});

/* ===== VECTOR LAYERS ===== */
var format_Rgion_2 = new ol.format.GeoJSON();
var features_Rgion_2 = format_Rgion_2.readFeatures(json_Rgion_2, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'});
var jsonSource_Rgion_2 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Rgion_2.addFeatures(features_Rgion_2);
var lyr_Rgion_2 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Rgion_2, 
                style: style_Rgion_2,
                popuplayertitle: 'Région',
                interactive: true,
                title: 'Région'
            });
var format_Prfecture_3 = new ol.format.GeoJSON();
var features_Prfecture_3 = format_Prfecture_3.readFeatures(json_Prfecture_3, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'});
var jsonSource_Prfecture_3 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Prfecture_3.addFeatures(features_Prfecture_3);
var lyr_Prfecture_3 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Prfecture_3, 
                style: style_Prfecture_3,
                popuplayertitle: 'Préfecture',
                interactive: true,
                title: 'Préfecture'
            });
var format_Canton_4 = new ol.format.GeoJSON();
var features_Canton_4 = format_Canton_4.readFeatures(json_Canton_4, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'});
var jsonSource_Canton_4 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Canton_4.addFeatures(features_Canton_4);
var lyr_Canton_4 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Canton_4, 
                style: style_Canton_4,
                popuplayertitle: 'Canton',
                interactive: true,
                title: 'Canton'
            });
var format_Emprise_5 = new ol.format.GeoJSON();
var features_Emprise_5 = format_Emprise_5.readFeatures(json_Emprise_5, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'});
var jsonSource_Emprise_5 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Emprise_5.addFeatures(features_Emprise_5);
var lyr_Emprise_5 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Emprise_5, 
                style: style_Emprise_5,
                popuplayertitle: 'Emprise',
                interactive: true,
                title: 'Emprise'
            });
var format_Rseauroutier_6 = new ol.format.GeoJSON();
var features_Rseauroutier_6 = format_Rseauroutier_6.readFeatures(json_Rseauroutier_6, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326'});
var jsonSource_Rseauroutier_6 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_Rseauroutier_6.addFeatures(features_Rseauroutier_6);
var lyr_Rseauroutier_6 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_Rseauroutier_6, 
                style: style_Rseauroutier_6,
                popuplayertitle: 'Réseau routier',
                interactive: true,
                title: 'Réseau routier'
            });

/* Only satellite visible by default */
lyr_GoogleSatellite_0.setVisible(true);
lyr_OpenStreetMap_1.setVisible(false);
lyr_GoogleHybrid_2.setVisible(false);
lyr_Light_3.setVisible(false);
lyr_Topographic_4.setVisible(false);
lyr_Rgion_2.setVisible(true);
lyr_Prfecture_3.setVisible(true);
lyr_Canton_4.setVisible(true);
lyr_Emprise_5.setVisible(true);
lyr_Rseauroutier_6.setVisible(true);

var layersList = [lyr_GoogleSatellite_0,lyr_OpenStreetMap_1,lyr_GoogleHybrid_2,lyr_Light_3,lyr_Topographic_4,lyr_Rgion_2,lyr_Prfecture_3,lyr_Canton_4,lyr_Emprise_5,lyr_Rseauroutier_6];

lyr_Rgion_2.set('fieldAliases', {'fid': 'Identifiant', 'COUNTRY': 'Pays', 'NAME_1': 'Région', 'POP_2022': 'Population totale (2022)', 'POP_RU_TOT': 'Population rurale totale', 'POP_RU_IMP': 'Population rurale impactée', 'POP_IMAPCT': 'Population impactée (dans un rayon de 2 km)', 'IAR_%': 'Indice d\'accès rural en %', 'TAUX_HUBN': 'Taux d\'urbanisation en %' });
lyr_Prfecture_3.set('fieldAliases', {
    'fid': 'Identifiant', 'NAME_1': 'Région', 'NAME_2': 'Préfecture',
    'POP_2022': 'Population de la préfecture (2022)', 'POP_IMPACT': 'Population impactée de la préfecture (dans un rayon de 2 km)',
    'REG_POP_2022': 'Population de la région (2022)', 'REG_POP_RU_TOT': 'Population rurale totale de la région',
    'REG_POP_RU_IMP': 'Population rurale impactée de la région', 'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
    'REG_IAR_%': 'Indice d\'accès rural de la région en %', 'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
});
lyr_Canton_4.set('fieldAliases', {
    'fid': 'Identifiant', 'NAME_1': 'Région', 'NAME_2': 'Préfecture', 'NAME_3': 'Canton',
    'PREF_POP_2022': 'Population de la préfecture (2022)', 'PREF_POP_IMPACT': 'Population impactée de la préfecture (dans un rayon de 2 km)',
    'REG_POP_2022': 'Population de la région (2022)', 'REG_POP_RU_TOT': 'Population rurale totale de la région',
    'REG_POP_RU_IMP': 'Population rurale impactée de la région', 'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
    'REG_IAR_%': 'Indice d\'accès rural de la région en %', 'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
});
lyr_Emprise_5.set('fieldAliases', {
    'Name': 'Nom de la route', 'CLASSE': 'Classification routière', 'EMPRISE': 'Largeur d\'emprise en mètres',
    'REGIONS': 'Région desservie', 'RT_LONGEUR': 'Longueur du tronçon en mètres',
    'RT_PK_DEB_X': 'Point kilométrique de début — Coordonnée X', 'RT_PK_DEB_Y': 'Point kilométrique de début — Coordonnée Y',
    'RT_PK_FIN_X': 'Point kilométrique de fin — Coordonnée X', 'RT_PK_FIN_Y': 'Point kilométrique de fin — Coordonnée Y',
    'REG_POP_2022': 'Population de la région (2022)', 'REG_POP_RU_TOT': 'Population rurale totale de la région',
    'REG_POP_RU_IMP': 'Population rurale impactée de la région', 'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
    'REG_IAR_%': 'Indice d\'accès rural de la région en %', 'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
});
lyr_Rseauroutier_6.set('fieldAliases', {
    'Name': 'Nom de la route', 'REGIONS': 'Région', 'CLASSE': 'Classification routière', 'EMPRISE': 'Largeur d\'emprise en mètres',
    'LONGEUR': 'Longueur du tronçon en mètres', 'PK_DEB_X': 'Point kilométrique de début — Coordonnée X', 'PK_DEB_Y': 'Point kilométrique de début — Coordonnée Y',
    'PK_FIN_X': 'Point kilométrique de fin — Coordonnée X', 'PK_FIN_Y': 'Point kilométrique de fin — Coordonnée Y',
    'REG_POP_2022': 'Population de la région (2022)', 'REG_POP_RU_TOT': 'Population rurale totale de la région',
    'REG_POP_RU_IMP': 'Population rurale impactée de la région', 'REG_POP_IMAPCT': 'Population impactée de la région (dans un rayon de 2 km)',
    'REG_IAR_%': 'Indice d\'accès rural de la région en %', 'REG_TAUX_HUBN': 'Taux d\'urbanisation de la région en %'
});
lyr_Rgion_2.set('fieldImages', {'fid': 'TextEdit', 'COUNTRY': 'TextEdit', 'NAME_1': 'TextEdit', 'POP_2022': 'TextEdit', 'POP_RU_TOT': 'TextEdit', 'POP_RU_IMP': 'TextEdit', 'POP_IMAPCT': 'TextEdit', 'IAR_%': 'TextEdit', 'TAUX_HUBN': 'TextEdit', });
lyr_Prfecture_3.set('fieldImages', {
    'fid': 'TextEdit', 'NAME_1': 'TextEdit', 'NAME_2': 'TextEdit',
    'POP_2022': 'TextEdit', 'POP_IMPACT': 'TextEdit',
    'REG_POP_2022': 'TextEdit', 'REG_POP_RU_TOT': 'TextEdit', 'REG_POP_RU_IMP': 'TextEdit',
    'REG_POP_IMAPCT': 'TextEdit', 'REG_IAR_%': 'TextEdit', 'REG_TAUX_HUBN': 'TextEdit'
});
lyr_Canton_4.set('fieldImages', {
    'fid': 'TextEdit', 'NAME_1': 'TextEdit', 'NAME_2': 'TextEdit', 'NAME_3': 'TextEdit',
    'PREF_POP_2022': 'TextEdit', 'PREF_POP_IMPACT': 'TextEdit',
    'REG_POP_2022': 'TextEdit', 'REG_POP_RU_TOT': 'TextEdit', 'REG_POP_RU_IMP': 'TextEdit',
    'REG_POP_IMAPCT': 'TextEdit', 'REG_IAR_%': 'TextEdit', 'REG_TAUX_HUBN': 'TextEdit'
});
lyr_Emprise_5.set('fieldImages', {
    'Name': 'TextEdit', 'CLASSE': 'TextEdit', 'EMPRISE': 'TextEdit', 'REGIONS': 'TextEdit',
    'RT_LONGEUR': 'TextEdit', 'RT_PK_DEB_X': 'TextEdit', 'RT_PK_DEB_Y': 'TextEdit',
    'RT_PK_FIN_X': 'TextEdit', 'RT_PK_FIN_Y': 'TextEdit',
    'REG_POP_2022': 'TextEdit', 'REG_POP_RU_TOT': 'TextEdit', 'REG_POP_RU_IMP': 'TextEdit',
    'REG_POP_IMAPCT': 'TextEdit', 'REG_IAR_%': 'TextEdit', 'REG_TAUX_HUBN': 'TextEdit'
});
lyr_Rseauroutier_6.set('fieldImages', {
    'Name': 'TextEdit', 'REGIONS': 'TextEdit', 'CLASSE': 'TextEdit', 'EMPRISE': 'TextEdit',
    'LONGEUR': 'TextEdit', 'PK_DEB_X': 'TextEdit', 'PK_DEB_Y': 'TextEdit',
    'PK_FIN_X': 'TextEdit', 'PK_FIN_Y': 'TextEdit',
    'REG_POP_2022': 'TextEdit', 'REG_POP_RU_TOT': 'TextEdit', 'REG_POP_RU_IMP': 'TextEdit',
    'REG_POP_IMAPCT': 'TextEdit', 'REG_IAR_%': 'TextEdit', 'REG_TAUX_HUBN': 'TextEdit'
});
lyr_Rgion_2.set('fieldLabels', {'fid': 'inline label - always visible', 'COUNTRY': 'inline label - always visible', 'NAME_1': 'inline label - always visible', 'POP_2022': 'inline label - always visible', 'POP_RU_TOT': 'inline label - always visible', 'POP_RU_IMP': 'inline label - always visible', 'POP_IMAPCT': 'inline label - always visible', 'IAR_%': 'inline label - always visible', 'TAUX_HUBN': 'inline label - always visible', });
lyr_Prfecture_3.set('fieldLabels', {
    'fid': 'inline label - always visible', 'NAME_1': 'inline label - always visible', 'NAME_2': 'inline label - always visible',
    'POP_2022': 'inline label - always visible', 'POP_IMPACT': 'inline label - always visible',
    'REG_POP_2022': 'inline label - always visible', 'REG_POP_RU_TOT': 'inline label - always visible',
    'REG_POP_RU_IMP': 'inline label - always visible', 'REG_POP_IMAPCT': 'inline label - always visible',
    'REG_IAR_%': 'inline label - always visible', 'REG_TAUX_HUBN': 'inline label - always visible'
});
lyr_Canton_4.set('fieldLabels', {
    'fid': 'inline label - always visible', 'NAME_1': 'inline label - always visible', 'NAME_2': 'inline label - always visible', 'NAME_3': 'inline label - always visible',
    'PREF_POP_2022': 'inline label - always visible', 'PREF_POP_IMPACT': 'inline label - always visible',
    'REG_POP_2022': 'inline label - always visible', 'REG_POP_RU_TOT': 'inline label - always visible',
    'REG_POP_RU_IMP': 'inline label - always visible', 'REG_POP_IMAPCT': 'inline label - always visible',
    'REG_IAR_%': 'inline label - always visible', 'REG_TAUX_HUBN': 'inline label - always visible'
});
lyr_Emprise_5.set('fieldLabels', {
    'Name': 'inline label - always visible', 'CLASSE': 'inline label - always visible',
    'EMPRISE': 'inline label - always visible', 'REGIONS': 'inline label - always visible',
    'RT_LONGEUR': 'inline label - always visible', 'RT_PK_DEB_X': 'inline label - always visible',
    'RT_PK_DEB_Y': 'inline label - always visible', 'RT_PK_FIN_X': 'inline label - always visible',
    'RT_PK_FIN_Y': 'inline label - always visible',
    'REG_POP_2022': 'inline label - always visible', 'REG_POP_RU_TOT': 'inline label - always visible',
    'REG_POP_RU_IMP': 'inline label - always visible', 'REG_POP_IMAPCT': 'inline label - always visible',
    'REG_IAR_%': 'inline label - always visible', 'REG_TAUX_HUBN': 'inline label - always visible'
});
lyr_Rseauroutier_6.set('fieldLabels', {
    'Name': 'inline label - always visible', 'REGIONS': 'inline label - always visible',
    'CLASSE': 'inline label - always visible', 'EMPRISE': 'inline label - always visible',
    'LONGEUR': 'inline label - always visible', 'PK_DEB_X': 'inline label - always visible',
    'PK_DEB_Y': 'inline label - always visible', 'PK_FIN_X': 'inline label - always visible',
    'PK_FIN_Y': 'inline label - always visible',
    'REG_POP_2022': 'inline label - always visible', 'REG_POP_RU_TOT': 'inline label - always visible',
    'REG_POP_RU_IMP': 'inline label - always visible', 'REG_POP_IMAPCT': 'inline label - always visible',
    'REG_IAR_%': 'inline label - always visible', 'REG_TAUX_HUBN': 'inline label - always visible'
});
lyr_Rseauroutier_6.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});

/* ===== BASEMAP SWITCHER FUNCTION ===== */
function switchBaseLayer(layerKey) {
    var baseLayers = [lyr_GoogleSatellite_0, lyr_OpenStreetMap_1, lyr_GoogleHybrid_2, lyr_Light_3, lyr_Topographic_4];
    baseLayers.forEach(function(lyr) {
        var title = lyr.get('title');
        lyr.setVisible(title === layerKey);
    });
    /* Update sidebar toggles */
    document.querySelectorAll('[data-base-layer]').forEach(function(cb) {
        cb.checked = (cb.dataset.baseLayer === layerKey);
    });
}