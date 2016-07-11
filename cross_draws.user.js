// ==UserScript==
// @id             iitc-plugin-cross-draws@Jormund
// @name           IITC plugin: cross draws
// @category       Layer
// @version        1.1.3.20160711.1630
// @namespace      https://github.com/jonatkins/ingress-intel-total-conversion
// @downloadURL    https://raw.githubusercontent.com/Jormund/cross_draws/master/cross_draws.user.js
// @description    [2016-07-11-1630] Checks for planned links that cross other planned links. Requires draw-tools plugin.
// @include        https://www.ingress.com/intel*
// @include        http://www.ingress.com/intel*
// @match          https://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// @include        https://www.ingress.com/mission/*
// @include        http://www.ingress.com/mission/*
// @match          https://www.ingress.com/mission/*
// @match          http://www.ingress.com/mission/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if (typeof window.plugin !== 'function') window.plugin = function () { };

    // PLUGIN START ////////////////////////////////////////////////////////


    window.plugin.crossDraws = function () { };

    //exact copy from cross_link
    window.plugin.crossDraws.greatCircleArcIntersect = function (a0, a1, b0, b1) {
        // based on the formula at http://williams.best.vwh.net/avform.htm#Int

        // method:
        // check to ensure no line segment is zero length - if so, cannot cross
        // check to see if either of the lines start/end at the same point. if so, then they cannot cross
        // check to see if the line segments overlap in longitude. if not, no crossing
        // if overlap, clip each line to the overlapping longitudes, then see if latitudes cross 

        // anti-meridian handling. this code will not sensibly handle a case where one point is
        // close to -180 degrees and the other +180 degrees. unwrap coordinates in this case, so one point
        // is beyond +-180 degrees. this is already true in IITC
        // FIXME? if the two lines have been 'unwrapped' differently - one positive, one negative - it will fail

        // zero length line tests
        if (a0.equals(a1)) return false;
        if (b0.equals(b1)) return false;

        // lines have a common point
        if (a0.equals(b0) || a0.equals(b1)) return false;
        if (a1.equals(b0) || a1.equals(b1)) return false;


        // check for 'horizontal' overlap in lngitude
        if (Math.min(a0.lng, a1.lng) > Math.max(b0.lng, b1.lng)) return false;
        if (Math.max(a0.lng, a1.lng) < Math.min(b0.lng, b1.lng)) return false;


        // ok, our two lines have some horizontal overlap in longitude
        // 1. calculate the overlapping min/max longitude
        // 2. calculate each line latitude at each point
        // 3. if latitudes change place between overlapping range, the lines cross


        // class to hold the pre-calculated maths for a geodesic line
        // TODO: move this outside this function, so it can be pre-calculated once for each line we test
        var GeodesicLine = function (start, end) {
            var d2r = Math.PI / 180.0;
            var r2d = 180.0 / Math.PI;

            // maths based on http://williams.best.vwh.net/avform.htm#Int

            if (start.lng == end.lng) {
                throw 'Error: cannot calculate latitude for meridians';
            }

            // only the variables needed to calculate a latitude for a given longitude are stored in 'this'
            this.lat1 = start.lat * d2r;
            this.lat2 = end.lat * d2r;
            this.lng1 = start.lng * d2r;
            this.lng2 = end.lng * d2r;

            var dLng = this.lng1 - this.lng2;

            var sinLat1 = Math.sin(this.lat1);
            var sinLat2 = Math.sin(this.lat2);
            var cosLat1 = Math.cos(this.lat1);
            var cosLat2 = Math.cos(this.lat2);

            this.sinLat1CosLat2 = sinLat1 * cosLat2;
            this.sinLat2CosLat1 = sinLat2 * cosLat1;

            this.cosLat1CosLat2SinDLng = cosLat1 * cosLat2 * Math.sin(dLng);
        }

        GeodesicLine.prototype.isMeridian = function () {
            return this.lng1 == this.lng2;
        }

        GeodesicLine.prototype.latAtLng = function (lng) {
            lng = lng * Math.PI / 180; //to radians

            var lat;
            // if we're testing the start/end point, return that directly rather than calculating
            // 1. this may be fractionally faster, no complex maths
            // 2. there's odd rounding issues that occur on some browsers (noticed on IITC MObile) for very short links - this may help
            if (lng == this.lng1) {
                lat = this.lat1;
            } else if (lng == this.lng2) {
                lat = this.lat2;
            } else {
                lat = Math.atan((this.sinLat1CosLat2 * Math.sin(lng - this.lng2) - this.sinLat2CosLat1 * Math.sin(lng - this.lng1))
                       / this.cosLat1CosLat2SinDLng);
            }
            return lat * 180 / Math.PI; // return value in degrees
        }



        // calculate the longitude of the overlapping region
        var leftLng = Math.max(Math.min(a0.lng, a1.lng), Math.min(b0.lng, b1.lng));
        var rightLng = Math.min(Math.max(a0.lng, a1.lng), Math.max(b0.lng, b1.lng));

        // calculate the latitudes for each line at left + right longitudes
        // NOTE: need a special case for meridians - as GeodesicLine.latAtLng method is invalid in that case
        var aLeftLat, aRightLat;
        if (a0.lng == a1.lng) {
            // 'left' and 'right' now become 'top' and 'bottom' (in some order) - which is fine for the below intersection code
            aLeftLat = a0.lat;
            aRightLat = a1.lat;
        } else {
            var aGeo = new GeodesicLine(a0, a1);
            aLeftLat = aGeo.latAtLng(leftLng);
            aRightLat = aGeo.latAtLng(rightLng);
        }

        var bLeftLat, bRightLat;
        if (b0.lng == b1.lng) {
            // 'left' and 'right' now become 'top' and 'bottom' (in some order) - which is fine for the below intersection code
            bLeftLat = b0.lat;
            bRightLat = b1.lat;
        } else {
            var bGeo = new GeodesicLine(b0, b1);
            bLeftLat = bGeo.latAtLng(leftLng);
            bRightLat = bGeo.latAtLng(rightLng);
        }

        // if both a are less or greater than both b, then lines do not cross

        if (aLeftLat < bLeftLat && aRightLat < bRightLat) return false;
        if (aLeftLat > bLeftLat && aRightLat > bRightLat) return false;

        // latitudes cross between left and right - so geodesic lines cross
        return true;
    }


    //exact copy from cross_link
    window.plugin.crossDraws.testPolyIntersect = function (polyA, polyB) {

        var a = polyA.getLatLngs();
        var b = polyB.getLatLngs();

        var endOfA = polyA instanceof L.GeodesicPolygon ? a.length - 1 : a.length; //when polygon, test for the line between last coordinate and first
        var endOfB = polyB instanceof L.GeodesicPolygon ? b.length - 1 : b.length; //when polygon, test for the line between last coordinate and first

        for (var i = 0; i < endOfA; ++i) {
            var a1 = a[j];
            var a2 = (i == a.length - 1) ? a[0] : a[i + 1];
            for (var j = 0; j < endOfB; ++j) {
                var b1 = b[j];
                var b2 = i == b.length - 1 ? b[0] : b[j + 1];

                if (window.plugin.crossDraws.greatCircleArcIntersect(a1, a2, b[i], b[i + 1])) //the actual test
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
        if (window.plugin.crossDraws.disabled) return;
        if (layer instanceof L.GeodesicPolyline) {
            window.plugin.drawTools.drawnItems.eachLayer(function (layer2) {
                //if (layer2 instanceof L.GeodesicPolyline) {
                if (plugin.crossDraws.testPolyIntersect(layer, layer2)) {
                    plugin.crossDraws.showLink(layer);
                    plugin.crossDraws.showLink(layer2);
                }
                //}
            });
        }
        //        if (layer instanceof L.GeodesicPolygon) {
        //            window.plugin.drawTools.drawnItems.eachLayer(function (layer2) {
        //                if (layer2 instanceof L.GeodesicPolyline) {
        //                    if (plugin.crossDraws.testPolyLine(layer, layer2, true)) {
        //                        plugin.crossDraws.showLink(layer);
        //                        plugin.crossDraws.showLink(layer2);
        //                    }
        //                }
        //            }
        // $.each(window.links, function(guid, link) {
        // if (!plugin.crossDraws.linkLayerGuids[link.options.guid])
        // {
        // if (layer instanceof L.GeodesicPolygon) {
        // if (plugin.crossDraws.testPolyLine(layer, link,true)) {
        // plugin.crossDraws.showLink(link);
        // }
        // } else if (layer instanceof L.GeodesicPolyline) {
        // if (plugin.crossDraws.testPolyLine(layer, link)) {
        // plugin.crossDraws.showLink(link);
        // }
        // }
        // }
        // });
    }

    // window.plugin.crossDraws.testForDeletedLinks = function () {
    // window.plugin.crossDraws.linkLayer.eachLayer( function(layer) {
    // var guid = layer.options.guid;
    // if (!window.links[guid]) {
    // console.log("link removed");
    // plugin.crossDraws.linkLayer.removeLayer(layer);
    // delete plugin.crossDraws.linkLayerGuids[guid];
    // }
    // });
    // }

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
