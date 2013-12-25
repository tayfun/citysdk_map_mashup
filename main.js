// Our namespace.
var topluTasima = {
    "baseUrl": "http://apicitysdk.ibb.gov.tr/",
    // stops is the main data store we have. It has stops, lines and schedules
    "stops": {},
    // lines is used as a set of lines whose schedules will be requested
    "lines": {},
    // locationToMarker is used to find which marker is clicked
    "locationToMarker": {},
    // one and only, our map.
    "map": null,
    // lineKeyToStops is the data structure we use in indexing stops. It's a
    // map with keys being search keywords and values are stop arrays.
    "lineKeyToStops": {},
    // is map data loaded already?
    "dataReady": false,
    // container for map controllers
    "controlcon": $("#controlcon"),
    // Search index utilizing lunr
    "index": null,
    "lineKeyToLineData": {},
    "selectedLineKey": null
};

// lunr index for searching bus lines.
topluTasima.index = lunr(function () {
    this.field('title');
    this.ref('title');
});

topluTasima.initialize = function() {
    "use strict";

    var mapcon = document.getElementById("mapcon"),
        tStops = topluTasima.stops,
        stopTemplate = _.template($("#stop-template").html()),
        timetableTemplate = _.template($("#timetable-template").html()),
        stopInfoTemplate = _.template($("#stop-info").html()),
        tLines, $timetable = $("#timetable");
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
            if (data.results.length === 0) {
                // If this stop has no bus lines, we don't wanna see it.
                delete tStops[stopCid];
            }
            for (var i = 0; i < data.results.length; i++) {
                var line = data.results[i];
                var gtfs = line.layers.gtfs.data;
                var lineKey = gtfs.route_short_name + " " + gtfs.route_long_name;
                tLines[line.cdk_id] = {
                    "short_name": gtfs.route_short_name,
                    "long_name": gtfs.route_long_name,
                    "from": gtfs.route_from,
                    "to": gtfs.route_to,
                    "schedule": []
                };
                topluTasima.lines[line.cdk_id] = true;

                // This part is really complicated but it makes it easier to group
                // stops with the same name that are across the street.
                if (topluTasima.lineKeyToStops[lineKey]) {
                    if (topluTasima.lineKeyToStops[lineKey][stop.name]) {
                        topluTasima.lineKeyToStops[lineKey][stop.name].push(stop);
                    } else {
                        topluTasima.lineKeyToStops[lineKey][stop.name] = [stop];
                    }
                } else {
                    topluTasima.lineKeyToStops[lineKey] = {};
                    topluTasima.lineKeyToStops[lineKey][stop.name] = [stop];
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
        var content = stopTemplate({"stop": marker.stop});
        topluTasima.infoWindow = new google.maps.InfoWindow({
            content: content
        });
        topluTasima.infoWindow.open(topluTasima.map, marker);
    }

    // Override tokenizer for a better one.
    lunr.tokenizer = function(str) {
        // Note that .trim is not available in IE < 9
        str = str.trim();
        // This makes sure we split according to dash characters as well
        // so that CEBECI-TAKSIM is tokenized into ["CEBECI", "TAKSIM"]
        return str.split(/\s*-\s*|\s+/);
    };

    var initIndex = function() {
        // Create index
        topluTasima.index = new lunr.Index();
        topluTasima.index.field("title");
        topluTasima.index.ref("title");
        // Add fullproof's pipeline function to process tokens.
        topluTasima.index.pipeline.add(function(token, tokenIndex, tokens) {
            return fullproof.normalizer.to_lowercase_nomark(token);
        });

        // Add stop data to index
        for (var lineKey in topluTasima.lineKeyToStops) {
            topluTasima.index.add({
                "title": lineKey
            });
        }
    };

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
        initIndex();
        // Like an event emitter; set dataReady flag.
        topluTasima.dataReady = true;
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

    function selectCallback(e) {
        // This function is called when a stop is selected from select
        // input. It displays the time table for the selected line and
        // selected stop and direction.
        // First and only argument e is either the event object when called
        // as a event callback or 0 or 1 if the user wants to change the
        // direction of the bus he wants to know more about.
        var stop = $("#stop-name").val(), myStop = null, stopNumber = 0,
            myLine = null;
        var stops = topluTasima.lineKeyToStops[topluTasima.selectedLineKey][stop];
        if ((typeof e).toLowerCase() == "number") {
            if (stops.length > e) {
                // If we can get info about the direction of the bus, do it.
                // Else we'll get info about the first direction we have.
                stopNumber = e;
            }
        }

        myStop = stops[stopNumber];
        for (var lineName in myStop.lines) {
            var line = myStop.lines[lineName];
            if (line.short_name + " " + line.long_name == topluTasima.selectedLineKey) {
                myLine = line;
                break;
            }
        }

        if (myLine === null) {
            // This should not happen. Maybe log it to crittercism or
            // sentry etc.
            console.log("There's an error as the line is not there");
            return;
        }

        var content = timetableTemplate({
            schedule: myLine.schedule,
            from: myLine.from,
            to: myLine.to,
            now: new Date()
        });
        $timetable.html(content);
        // Animate to the next bus
        var next_bus = $("#timetable-items .new-bus:first");
        var last_bus = $("#timetable-items span:last-child");
        var items = $("#timetable-items");
        if (next_bus) {
            items.animate({right: next_bus.position().left});
            next_bus.addClass("active");
        }
        $("#timetable-control-left").on("click", function(){
            if (items.position().left < 0) {
                items.animate({right: "-=10em"});
            }
        });
        $("#timetable-control-right").on("click", function(){
            if (-last_bus.position().left < items.position().left) {
                items.animate({right: "+=10em"});
            }
        });
        $("#direction").on("click", function(){
            selectCallback(++stopNumber);
        });
    }

    function initMap() {
        $(".loading").remove();
        topluTasima.map = new google.maps.Map(mapcon, mapOptions);
        // Show search button.
        topluTasima.map.controls[google.maps.ControlPosition.TOP_LEFT].push(
                topluTasima.controlcon.show()[0]
        );
        // initialize auto-complete
        topluTasima.controlcon.find("#search").autocomplete({
            minLength: 0,
            source: function(request, response) {
                var results = topluTasima.index.search(request.term);
                response(
                    results.map(function(result) { return result.ref;}).sort());
            },
            select: function(event, ui) {
                topluTasima.selectedLineKey = ui.item.value;
                var content = stopInfoTemplate(
                    {
                        stops: topluTasima.lineKeyToStops[ui.item.value]
                    }
                );
                $("#stops").html(content).parent().show();
                $("#stops select").focus();
                $("#stops select").change(selectCallback);
                // Trigger change element so that the default timetable
                // for the stop is shown at the beginning.
                $("#stops select").change();
            }
        });
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

