var size = 0;
var placement = 'point';

var style_Prfecture_3 = function(feature, resolution){
    var style = [ new ol.style.Style({
        stroke: new ol.style.Stroke({color: 'rgba(147,197,253,0.45)', lineDash: [5,3], lineCap: 'butt', lineJoin: 'miter', width: 1}),
        fill: new ol.style.Fill({color: 'rgba(147,197,253,0.04)'})
    })];

    return style;
};