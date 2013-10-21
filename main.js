// Our namespace.
var topluTasima = {
    "baseUrl": "http://apicitysdk.ibb.gov.tr/",
    "stops": {},
    "lines": {}
};

function initialize() {
    $(".loading").show();
    google.maps.visualRefresh = true;
    var mapcon = document.getElementById("mapcon");
    var tStops = topluTasima.stops;
    var tLines;
    topluTasima.$mapcon = $(mapcon);

    topluTasima.mapOptions = mapOptions = {
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
        console.log("got position from geo api", position.coords);
        mapOptions.center = new google.maps.LatLng(position.coords.latitude,
                position.coords.longitude);
        initMap();
    }

    function geoError() {
        // Woot? No geolocation. Use taksim.
        console.log("got position from ip");
        mapOptions.center = new google.maps.LatLng(41.037413, 28.985017);
        initMap();
    }

    function getNearbyStops() {
        // Gets nearby stops from citysdk api.
        curPos = topluTasima.map.getCenter();
        stopParameters = {
            "radius": 400,  // Get data around 400m radius
            "lat": curPos.lat(),
            "lon": curPos.lng(),
            "geom": true,  // Get lat long values of POI as well.
        };
        (function getPage(page) {
            params = $.param(stopParameters);
            params += "&page=" + page;
            $.get(topluTasima.baseUrl + "ptstops", params, function(data) {
                console.log(data);
                for (var i = 0; i < data.results.length; i++) {
                    var stop = data.results[i];
                    tStops[stop.cdk_id] = {
                        // IETT uses long,lat format so reverse it to become
                        // compatible with maps.
                        "location": stop.geom.coordinates.reverse(),
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

    function getLinesThrough(stop, page) {
        var tLines = tStops[stop].lines;
        return $.get(topluTasima.baseUrl + stop + "/select/ptlines", function(data) {
            for (var i = 0; i < data.results.length; i++) {
                var line = data.results[i];
                var gtfs = line.layers.gtfs.data;
                tLines[line.cdk_id] = {
                    "name": gtfs.route_short_name,
                    "long_name": gtfs.route_long_name,
                    "from": gtfs.route_from,
                    "to": gtfs.route_to,
                    "schedule": []
                };
                topluTasima.lines[line.cdk_id] = true;
            }
            if (data.next_page && data.next_page > 1) {
                getLinesThrough(stop, ++page);
            }
        }).fail(function() {
            console.log("fail at lines!");
        });
    }

    function getSchedule(line) {
        $.get(topluTasima.baseUrl + line + "/select/schedule", function(data) {
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

    function getLines() {
        var requests = [];
        for (var stop in topluTasima.stops) {
            requests.push(getLinesThrough(stop, 0));
        }
        // After all lines are retrieved, get schedules.
        var defer = $.when.apply($, requests);
        defer.done(function(){
            for (var line in topluTasima.lines) {
                getSchedule(line);
            }
        });
    }

    function initMap() {
        $(".loading").remove();
        topluTasima.map = new google.maps.Map(mapcon, mapOptions);
        getNearbyStops();
        // getSchedules();
        // drawMap();
    }
}

google.maps.event.addDomListener(window, 'load', initialize);
