var size = 0;
var placement = 'point';

var empriseColors = {
  'RN': 'rgba(210,16,52,0.60)',
  'RR': 'rgba(0,106,78,0.60)',
  'RL': 'rgba(255,215,0,0.60)',
  'RC': 'rgba(59,130,246,0.60)',
  'CU': 'rgba(148,163,184,0.60)'
};

var empriseStrokes = {
  'RN': 'rgba(210,16,52,0.80)',
  'RR': 'rgba(0,106,78,0.80)',
  'RL': 'rgba(255,215,0,0.80)',
  'RC': 'rgba(59,130,246,0.80)',
  'CU': 'rgba(148,163,184,0.80)'
};

var style_Emprise_5 = function(feature, resolution){
    var cls = feature.get("CLASSE") || 'CU';
    var fillColor = empriseColors[cls] || 'rgba(148,163,184,0.60)';
    var strokeColor = empriseStrokes[cls] || 'rgba(148,163,184,0.80)';

    var style = [ new ol.style.Style({
        fill: new ol.style.Fill({color: fillColor}),
        stroke: new ol.style.Stroke({color: strokeColor, width: 1})
    })];

    return style;
};