// ==UserScript==
// @id             iitc-plugin-cross-draws@Jormund
// @name           IITC plugin: cross draws
// @category       Layer
// @version        1.2.2.20201122.2300
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @updateURL      https://raw.githubusercontent.com/Jormund/cross_draws/master/cross_draws.meta.js
// @downloadURL    https://raw.githubusercontent.com/Jormund/cross_draws/master/cross_draws.user.js
// @description    [2020-11-22-2300] Checks for planned links that cross other planned links. Requires draw-tools plugin.
// @include        https://*.ingress.com/intel*
// @include        https://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @match          https://*.ingress.com/intel*
// @grant          none
// ==/UserScript==
//Changelog
//1.2.2	Activate on intel.ingress.com
//1.2.1	Activate on intel.ingress.com, changed download url to github
//1.2.0 Cross detection from "Cross link fixed" plugin, improves speed (about x2) and detection accross International Date Line
//1.1.3 Handle https://ingress.com/intel
//1.1.3	Initial release, handle polygons and polylines

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    // PLUGIN START ////////////////////////////////////////////////////////


    window.plugin.crossDraws = function () { };

    //copy from Cross Links fixed by @Hevne
     window.plugin.crossDraws.greatCircleArcIntersect = function (a0,a1,b0,b1) {
 
   // zero length line tests
   if (a0.equals(a1)) return false;
   if (b0.equals(b1)) return false;
 
   // lines have a common point
   if (a0.equals(b0) || a0.equals(b1)) return false;
   if (a1.equals(b0) || a1.equals(b1)) return false;
 
   // check for 'horizontal' overlap in lngitude
   if (Math.min(a0.lng,a1.lng) > Math.max(b0.lng,b1.lng)) return false;
   if (Math.max(a0.lng,a1.lng) < Math.min(b0.lng,b1.lng)) return false;
 
   // convert to 3d
   var ca0 = toCartesian(a0.lat, a0.lng),
       ca1 = toCartesian(a1.lat, a1.lng),
       cb0 = toCartesian(b0.lat, b0.lng),
       cb1 = toCartesian(b1.lat, b1.lng);
 
   // plane normales
   var da = cross(ca0, ca1); 
   var db = cross(cb0, cb1); 
   var da0 = cross(da, ca0); 
   var da1 = cross(da, ca1); 
   var db0 = cross(db, cb0);
   var db1 = cross(db, cb1);
 
   // the intersection line <=> collision point
   var p = cross(da, db); 
   normalize(p);
 
   // angels to positions
   var s = dot(p, da0);
   var d = dot(p, da1);
   var l = dot(p, db0);
   var f = dot(p, db1);
 
   if (s > 0 && d < 0 && l > 0 && f < 0) {
     return true;
   }
 
   if (s < 0 && d > 0 && l < 0 && f > 0) {
     // p inverted
     return true;
   }
 
   return false;
 };
 
 const d2r = Math.PI / 180;
 
 let toCartesian= function(lat,lng) {
   lat *=d2r;
   lng *=d2r;
   var o = Math.cos(lat);
   return [o * Math.cos(lng), o * Math.sin(lng), Math.sin(lat)]
 }
 
 let cross= function (t, n) {
   return [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]
 }
 
 let normalize = function (t) {
   var n = 1/Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]);
   t[0] *= n, t[1] *= n, t[2] *= n
 }
 
 let dot = function(t, n) {
   return t[0] * n[0] + t[1] * n[1] + t[2] * n[2]
 }

    //exact copy from cross_link
    window.plugin.crossDraws.testPolyIntersect = function (polyA, polyB) {

        var a = polyA.getLatLngs();
        var b = polyB.getLatLngs();

        var endOfA = polyA instanceof L.GeodesicPolygon ? a.length : a.length - 1; //when polygon, test for the line between last coordinate and first
        var endOfB = polyB instanceof L.GeodesicPolygon ? b.length : b.length - 1; //when polygon, test for the line between last coordinate and first

        for (var i = 0; i < endOfA; ++i) {
            var a1 = a[i];
            var a2 = (i == a.length - 1) ? a[0] : a[i + 1];
            for (var j = 0; j < endOfB; ++j) {
                var b1 = b[j];
                var b2 = j == b.length - 1 ? b[0] : b[j + 1];

                if (window.plugin.crossDraws.greatCircleArcIntersect(a1, a2, b1, b2)) //the actual test
                    return true;
            }
        }

        return false;
    }

    window.plugin.crossDraws.checkAllPlannedLinks = function () {
        if (window.plugin.crossDraws.disabled) return;

        console.debug("cross-draws: checking all links");
        plugin.crossDraws.linkLayer.clearLayers();
        plugin.crossDraws.linkLayerGuids = {};

        window.plugin.drawTools.drawnItems.eachLayer(function (link) {
            // console.log("link:"+plugin.crossDraws.makeGuid(link));
            plugin.crossDraws.testLink(link);
        }
	);
        // $.each(window.links, function(guid, link) {
        // plugin.crossDraws.testLink(link);
        // });
    }

    window.plugin.crossDraws.testLink = function (link) {
        if (!(link instanceof L.GeodesicPolygon) && !(link instanceof L.GeodesicPolyline)) return; //on n'est pas en présence d'un lien

        var guid = plugin.crossDraws.makeGuid(link);
        // console.log("testLink:"+guid);
        // console.log(!!plugin.crossDraws.linkLayerGuids[guid]);
        if (plugin.crossDraws.linkLayerGuids[guid]) return; //link already marked as crossing

        for (var i in plugin.drawTools.drawnItems._layers) {
            var layer = plugin.drawTools.drawnItems._layers[i];
            /*if (layer instanceof L.GeodesicPolygon) {
            if (plugin.crossDraws.testPolyLine(layer, link, true)) {
            plugin.crossDraws.showLink(link);
            break;
            }
            } else if (layer instanceof L.GeodesicPolyline) {*/
            if (plugin.crossDraws.testPolyIntersect(layer, link)) {
                plugin.crossDraws.showLink(link);
                break;
            }
            //}
        };
    }
    window.plugin.crossDraws.makeGuid = function (layer) {
        var linkLatLng = layer.getLatLngs();
        var guid = linkLatLng[0].toString() + '_' + linkLatLng[1].toString();
        //var guid = layer.options.guid;
        return guid;
    }

    window.plugin.crossDraws.showLink = function (link) {

        var linkLatLng = link.getLatLngs();
        if (link instanceof L.GeodesicPolygon) {
            linkLatLng.push(linkLatLng[0]);//close the loop
        }

        var guid = plugin.crossDraws.makeGuid(link);
        var poly = L.geodesicPolyline(linkLatLng, {
            color: '#d22',
            opacity: 0.7,
            weight: 5,
            clickable: false,
            dashArray: [8, 8],

            guid: guid
        });

        poly.addTo(plugin.crossDraws.linkLayer);
        plugin.crossDraws.linkLayerGuids[guid] = poly;
    }

    window.plugin.crossDraws.onMapDataRefreshEnd = function () {
        if (window.plugin.crossDraws.disabled) return;

        window.plugin.crossDraws.checkAllPlannedLinks(); //check everything, that's simpler
        window.plugin.crossDraws.linkLayer.bringToFront();
        //console.log('brought crossDraws to front');
    }

    window.plugin.crossDraws.testAllPlannedLinksAgainstLayer = function (layer) {
        try {
            if (window.plugin.crossDraws.disabled) return;
            if (layer instanceof L.GeodesicPolyline) {
                window.plugin.drawTools.drawnItems.eachLayer(function (layer2) {
                    if (plugin.crossDraws.testPolyIntersect(layer, layer2)) {
                        plugin.crossDraws.showLink(layer);
                        plugin.crossDraws.showLink(layer2);
                    }
                });
            }
        } catch (err) {
            alert(err.stack);
        }
    }

    window.plugin.crossDraws.createLayer = function () {
        window.plugin.crossDraws.linkLayer = new L.FeatureGroup();
        window.plugin.crossDraws.linkLayerGuids = {};
        window.addLayerGroup('Cross draws', window.plugin.crossDraws.linkLayer, true);

        map.on('layeradd', function (obj) {
            if (obj.layer === window.plugin.crossDraws.linkLayer) {
                delete window.plugin.crossDraws.disabled;
                window.plugin.crossDraws.checkAllPlannedLinks();
            }
        });
        map.on('layerremove', function (obj) {
            if (obj.layer === window.plugin.crossDraws.linkLayer) {
                window.plugin.crossDraws.disabled = true;
                window.plugin.crossDraws.linkLayer.clearLayers();
                plugin.crossDraws.linkLayerGuids = {};
            }
        });

        // ensure 'disabled' flag is initialised
        if (!map.hasLayer(window.plugin.crossDraws.linkLayer)) {
            window.plugin.crossDraws.disabled = true;
        }
    }

    var setup = function () {

        if (window.plugin.drawTools === undefined) {
            alert("'cross-draws' requires 'draw-tools'");
            return;
        }

        // this plugin also needs to create the draw-tools hook, in case it is initialised before draw-tools
        window.pluginCreateHook('pluginDrawTools');

        window.plugin.crossDraws.createLayer();

        // events
        window.addHook('pluginDrawTools', function (e) {
            if (e.event == 'layerCreated') {
                // we can just test the new layer in this case
                window.plugin.crossDraws.testAllPlannedLinksAgainstLayer(e.layer);
            } else {
                // all other event types - assume anything could have been modified and re-check all links
                window.plugin.crossDraws.checkAllPlannedLinks();
            }
        });

        // window.addHook('linkAdded', window.plugin.crossDraws.onLinkAdded);
        window.addHook('mapDataRefreshEnd', window.plugin.crossDraws.onMapDataRefreshEnd);


    }

    // PLUGIN END //////////////////////////////////////////////////////////


    setup.info = plugin_info; //add the script info data to the function as a property
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    // if IITC has already booted, immediately run the 'setup' function
    if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
