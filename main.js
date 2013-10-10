ymaps.ready(function() {
    var myMap = new ymaps.Map('mapcon', {
    // center: [39.889847, 32.810152],
    center: [ymaps.geolocation.latitude, ymaps.geolocation.longitude],
    zoom: 13
  });
});
