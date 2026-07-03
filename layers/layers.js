ol.proj.proj4.register(proj4);
//ol.proj.get("EPSG:4326").setExtent([-0.540169, 7.893265, 2.320078, 9.917615]);
var wms_layers = [];


        var baseTileGrid = ol.tilegrid.createXYZ({maxZoom: 21});
        var lyr_GoogleSatellite_0 = new ol.layer.Tile({
            'title': 'Google Satellite',
            'type':'base',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
            attributions: ' ',
                crossOrigin: 'anonymous',
                projection: 'EPSG:3857',
                tileGrid: baseTileGrid,
                url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'
            })
        });

        var lyr_OpenStreetMap_1 = new ol.layer.Tile({
            'title': 'OpenStreetMap',
            'type':'base',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
            attributions: ' ',
                crossOrigin: 'anonymous',
                projection: 'EPSG:3857',
                tileGrid: baseTileGrid,
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            })
        });

        var lyr_GoogleHybrid_2 = new ol.layer.Tile({
            'title': 'Google Hybrid',
            'type':'base',
            'opacity': 1.000000,
            visible: false,
            source: new ol.source.XYZ({
            attributions: ' ',
                crossOrigin: 'anonymous',
                projection: 'EPSG:3857',
                tileGrid: baseTileGrid,
                url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
            })
        });
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

lyr_GoogleSatellite_0.setVisible(true);lyr_OpenStreetMap_1.setVisible(true);lyr_GoogleHybrid_2.setVisible(false);lyr_Rgion_2.setVisible(true);lyr_Prfecture_3.setVisible(true);lyr_Canton_4.setVisible(true);lyr_Emprise_5.setVisible(true);lyr_Rseauroutier_6.setVisible(true);
var layersList = [lyr_GoogleSatellite_0,lyr_OpenStreetMap_1,lyr_GoogleHybrid_2,lyr_Rgion_2,lyr_Prfecture_3,lyr_Canton_4,lyr_Emprise_5,lyr_Rseauroutier_6];
lyr_Rgion_2.set('fieldAliases', {'fid': 'ID', 'COUNTRY': 'Pays', 'NAME_1': 'Région', 'POP_2022': 'Population (2022)', 'POP_RU_TOT': 'Pop. rurale totale', 'POP_RU_IMP': 'Pop. rurale impactée', 'POP_IMAPCT': 'Pop. impactée (2km)', 'IAR_%': 'IAR (%)', 'TAUX_HUBN': 'Taux urbanisation (%)' });
lyr_Prfecture_3.set('fieldAliases', {'fid': 'ID', 'NAME_1': 'Région', 'NAME_2': 'Préfecture', 'POP_2022': 'Population (2022)', 'POP_IMPACT': 'Population impactée (2km)' });
lyr_Canton_4.set('fieldAliases', {'fid': 'ID', 'NAME_1': 'Région', 'NAME_2': 'Préfecture', 'NAME_3': 'Canton' });
lyr_Emprise_5.set('fieldAliases', {'Name': 'Nom', 'CLASSE': 'Catégorie', 'EMPRISE': 'Emprise (m)' });
lyr_Rseauroutier_6.set('fieldAliases', {'Name': 'Nom', 'REGIONS': 'Région', 'CLASSE': 'Catégorie', 'EMPRISE': 'Emprise (m)', 'LONGEUR': 'Longueur (m)', 'PK_DEB_X': 'PK Début X', 'PK_DEB_Y': 'PK Début Y', 'PK_FIN_X': 'PK Fin X', 'PK_FIN_Y': 'PK Fin Y' });
lyr_Rgion_2.set('fieldImages', {'fid': 'TextEdit', 'COUNTRY': 'TextEdit', 'NAME_1': 'TextEdit', 'POP_2022': 'TextEdit', 'POP_RU_TOT': 'TextEdit', 'POP_RU_IMP': 'TextEdit', 'POP_IMAPCT': 'TextEdit', 'IAR_%': 'TextEdit', 'TAUX_HUBN': 'TextEdit', });
lyr_Prfecture_3.set('fieldImages', {'fid': 'TextEdit', 'NAME_1': 'TextEdit', 'NAME_2': 'TextEdit', 'POP_2022': 'TextEdit', 'POP_IMPACT': 'TextEdit', });
lyr_Canton_4.set('fieldImages', {'fid': 'TextEdit', 'NAME_1': 'TextEdit', 'NAME_2': 'TextEdit', 'NAME_3': 'TextEdit', });
lyr_Emprise_5.set('fieldImages', {'Name': 'TextEdit', 'CLASSE': 'TextEdit', 'EMPRISE': 'TextEdit', });
lyr_Rseauroutier_6.set('fieldImages', {'Name': 'TextEdit', 'REGIONS': 'TextEdit', 'CLASSE': 'TextEdit', 'EMPRISE': 'TextEdit', 'LONGEUR': 'TextEdit', 'PK_DEB_X': 'TextEdit', 'PK_DEB_Y': 'TextEdit', 'PK_FIN_X': 'TextEdit', 'PK_FIN_Y': 'TextEdit', });
lyr_Rgion_2.set('fieldLabels', {'fid': 'inline label - always visible', 'COUNTRY': 'inline label - always visible', 'NAME_1': 'inline label - always visible', 'POP_2022': 'inline label - always visible', 'POP_RU_TOT': 'inline label - always visible', 'POP_RU_IMP': 'inline label - always visible', 'POP_IMAPCT': 'inline label - always visible', 'IAR_%': 'inline label - always visible', 'TAUX_HUBN': 'inline label - always visible', });
lyr_Prfecture_3.set('fieldLabels', {'fid': 'inline label - always visible', 'NAME_1': 'inline label - always visible', 'NAME_2': 'inline label - always visible', 'POP_2022': 'inline label - always visible', 'POP_IMPACT': 'inline label - always visible', });
lyr_Canton_4.set('fieldLabels', {'fid': 'inline label - always visible', 'NAME_1': 'inline label - always visible', 'NAME_2': 'inline label - always visible', 'NAME_3': 'inline label - always visible', });
lyr_Emprise_5.set('fieldLabels', {'Name': 'inline label - always visible', 'CLASSE': 'inline label - always visible', 'EMPRISE': 'inline label - always visible', });
lyr_Rseauroutier_6.set('fieldLabels', {'Name': 'inline label - always visible', 'REGIONS': 'inline label - always visible', 'CLASSE': 'inline label - always visible', 'EMPRISE': 'inline label - always visible', 'LONGEUR': 'inline label - always visible', 'PK_DEB_X': 'inline label - always visible', 'PK_DEB_Y': 'inline label - always visible', 'PK_FIN_X': 'inline label - always visible', 'PK_FIN_Y': 'inline label - always visible', });
lyr_Rseauroutier_6.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});