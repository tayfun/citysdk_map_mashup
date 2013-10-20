// Our namespace.
var topluTasima = {
    "baseUrl": "http://apicitysdk.ibb.gov.tr/",
    "ptstops": {}
};

function initialize() {
    $(".loading").show();
    google.maps.visualRefresh = true;
    mapcon = document.getElementById("mapcon");
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
        data = {
            "radius": 400,  // Get data around 400m radius
            "lat": curPos.lat(),
            "lon": curPos.lng(),
            "geom": true  // Get lat long values of POI as well.
        };
        $.get(topluTasima.baseUrl + "ptstops", data, function(data) {
                console.log(data);
                for (var i = 0; i < data.results.length; i++) {
                    var stop = data.results[i];
                    topluTasima.ptstops[stop.cdk_id] = {
                        "location": stop.geom.coordinates
                    };
                }
            }).fail(function() {
                alert("fail at ptstops!");
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
