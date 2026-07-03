var size = 0;
var placement = 'point';

var style_Canton_4 = function(feature, resolution){
    var style = [ new ol.style.Style({
        stroke: new ol.style.Stroke({color: 'rgba(255,215,0,0.25)', lineDash: [2,1], lineCap: 'butt', lineJoin: 'miter', width: 0.6}),
        fill: new ol.style.Fill({color: 'rgba(255,215,0,0.02)'})
    })];

    return style;
};