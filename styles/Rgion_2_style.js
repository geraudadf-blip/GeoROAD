var size = 0;
var placement = 'point';

// Per-region colors for transparency
var regionColors = {
  'Centre': { fill: 'rgba(0,106,78,0.08)', stroke: 'rgba(0,106,78,0.6)' },
  'Kara': { fill: 'rgba(255,215,0,0.06)', stroke: 'rgba(255,215,0,0.5)' },
  'Savanes': { fill: 'rgba(210,16,52,0.06)', stroke: 'rgba(210,16,52,0.5)' }
};

var style_Rgion_2 = function(feature, resolution){
    var name = feature.get("NAME_1") || '';
    var colors = regionColors[name] || { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.2)' };
    
    var style = [ new ol.style.Style({
        stroke: new ol.style.Stroke({color: colors.stroke, lineDash: null, lineCap: 'butt', lineJoin: 'miter', width: 1.5}),
        fill: new ol.style.Fill({color: colors.fill}),
        text: new ol.style.Text({
          text: name,
          font: '600 13px Outfit, sans-serif',
          fill: new ol.style.Fill({ color: colors.stroke }),
          stroke: new ol.style.Stroke({ color: 'rgba(0,0,0,0.8)', width: 3 }),
          placement: 'point'
        })
    })];

    return style;
};