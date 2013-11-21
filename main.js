// Our namespace.
var topluTasima = {
    "baseUrl": "http://apicitysdk.ibb.gov.tr/",
    // stops is the main data store we have. It has stops, lines and schedules
    "stops": {},
    // lines is used as a set of lines whose schedules will be requested
    "lines": {},
    // locationToMarker is used to find which marker is clicked
    "locationToMarker": {},
    "map": null,
    "template": _.template($("#stop-template").html()),
    // lineKeyToStops is the data structure we use in indexing stops. It's a
    // map with keys being search keywords and values are stop arrays.
    "lineKeyToStops": {}
};

topluTasima.initialize = function() {
    "use strict";

    var mapcon = document.getElementById("mapcon");
    var tStops = topluTasima.stops;
    var tLines;
    $(".loading").show();
    google.maps.visualRefresh = true;
    topluTasima.$mapcon = $(mapcon);

    var mapOptions = topluTasima.mapOptions = {
        // center is added later through geolocation.
        // 16 is the smallest zoom that shows bus stops.
        zoom: 16,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        streetViewControl: false,
        mapTypeControl: false,
        overviewMapControl: false,
        scaleControl: false,
        panControl: false,
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(geoSuccess, geoError);
    } else {
        geoError();
    }

    function geoSuccess(position) {
        mapOptions.center = new google.maps.LatLng(position.coords.latitude,
                position.coords.longitude);
        initMap();
    }

    function geoError() {
        // Woot? No geolocation. Use taksim.
        mapOptions.center = new google.maps.LatLng(41.037413, 28.985017);
        initMap();
    }

    function getNearbyStops() {
        // Gets nearby stops from citysdk api.
        var curPos = topluTasima.map.getCenter();
        var stopParameters = {
            "radius": 400,  // Get data around 400m radius
            "lat": curPos.lat(),
            "lon": curPos.lng(),
            "geom": true,  // Get lat long values of POI as well.
        };
        (function getPage(page) {
            var params = $.param(stopParameters);
            params += "&page=" + page;
            $.get(topluTasima.baseUrl + "ptstops", params, function(data) {
                for (var i = 0; i < data.results.length; i++) {
                    var stop = data.results[i];
                    // IETT uses long,lat format so reverse it to become
                    // compatible with maps.
                    var location = new google.maps.LatLng(stop.geom.coordinates[1], stop.geom.coordinates[0]);
                    tStops[stop.cdk_id] = {
                        "location": location,
                        "name": stop.name,
                        "lines": {}
                    };
                }
                // If we have more pages, get them as well.
                if (data.next_page && data.next_page > 1) {
                    getPage(++page);
                }
                else {
                    getLines();
                }
            }).fail(function() {
                console.log("fail at stops!");
            });
        })(1);
    }

    function getLinesThrough(stopCid, page) {
        var tLines = tStops[stopCid].lines;
        var stop = tStops[stopCid];
        return $.get(topluTasima.baseUrl + stopCid + "/select/ptlines", function(data) {
            for (var i = 0; i < data.results.length; i++) {
                var line = data.results[i];
                var gtfs = line.layers.gtfs.data;
                var lineKey = gtfs.route_short_name + " " + gtfs.route_long_name;
                tLines[line.cdk_id] = {
                    "name": gtfs.route_short_name,
                    "long_name": gtfs.route_long_name,
                    "from": gtfs.route_from,
                    "to": gtfs.route_to,
                    "schedule": []
                };
                topluTasima.lines[line.cdk_id] = true;

                if (topluTasima.lineKeyToStops[lineKey]) {
                    topluTasima.lineKeyToStops[lineKey].push(stop);
                } else {
                    topluTasima.lineKeyToStops[lineKey] = [stop];
                }
            }
            if (data.next_page && data.next_page > 1) {
                getLinesThrough(stopCid, ++page);
            }
        }).fail(function() {
            console.log("fail at lines!");
        });
    }

    function getSchedule(line) {
        return $.get(topluTasima.baseUrl + line + "/select/schedule", function(data) {
            var trips = data.results[0].trips;
            for (var i = 0; i < trips.length; i++) {
                var route = trips[i];
                for (var j = 0; j < route.length; j++) {
                    var stop = route[j][0];
                    var time = route[j][1];
                    if (tStops[stop]) {
                        tStops[stop].lines[line].schedule.push(time);
                    }
                }
            }
        }).fail(function() {
            console.log("fail at schedule!");
        });
    }

    function showInfoWindow(event) {
        // Receives click from marker and shows an info window.
        var marker = topluTasima.locationToMarker[event.latLng];
        if (topluTasima.infoWindow) {
            // Remove previous window if there's one.
            topluTasima.infoWindow.close();
            delete topluTasima.infoWindow;
        }
        var content = topluTasima.template({"stop": marker.stop});
        topluTasima.infoWindow = new google.maps.InfoWindow({
            content: content
        });
        topluTasima.infoWindow.open(topluTasima.map, marker);
    }

    function renderMap() {
        for (var stopCid in tStops) {
            var stop = tStops[stopCid];
            var marker = topluTasima.locationToMarker[stop.location] = new google.maps.Marker({
                position: stop.location,
                map: topluTasima.map,
                title: stop.name,
                icon: "images/bus2.png",
                infoWindow: infoWindow,
                stop: stop
            });
            var infoWindow = new google.maps.InfoWindow({
                content: stop.name
            });
            google.maps.event.addListener(marker, "click", showInfoWindow);
        }
        topluTasima.search();
    }

    function getLines() {
        var requests = [];
        for (var stopCid in tStops) {
            requests.push(getLinesThrough(stopCid, 0));
        }
        // After all lines are retrieved, get schedules.
        var defer = $.when.apply($, requests);
        defer.done(function(){
            var requests = [];
            for (var line in topluTasima.lines) {
                requests.push(getSchedule(line));
            }
            var defer = $.when.apply($, requests);
            defer.done(renderMap());
        });
    }

    function initMap() {
        $(".loading").remove();
        topluTasima.map = new google.maps.Map(mapcon, mapOptions);
        $(mapcon).append("<input type='text' id='search'>");
        // Show where we are.
        new google.maps.Marker({
            "position": mapOptions.center,
            "map": topluTasima.map,
            "title": "Buradasınız"
        });
        getNearbyStops();
    }
};

google.maps.event.addDomListener(window, 'load', topluTasima.initialize);

topluTasima.index = lunr(function () {
    this.field('title');
    this.ref('title');
});

topluTasima.search = function() {
    for (var lineKey in topluTasima.lineKeyToStops) {
        topluTasima.index.add({
            "title": lineKey
        });
    }
};
