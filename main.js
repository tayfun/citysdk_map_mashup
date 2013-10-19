// Our namespace.
var topluTasima = {};

// We can start using ymaps on ready.
ymaps.ready(function() {
  if (navigator.geolocation) {
    $(".loading").show();
    navigator.geolocation.getCurrentPosition(geoSuccess, geoError);

  }
  function geoSuccess(position) {
    console.log("got position from geo api", position.coords);
    initMap(position.coords.latitude, position.coords.longitude);
  }
  function geoError() {
    console.log("got position from yandex using ip", ymaps.geolocation);
    initMap(ymaps.geolocation.latitude, ymaps.geolocation.longitude);
  }
  function initMap(lat, lng) {
    $(".loading").remove();
    topluTasima.map = new ymaps.Map('mapcon', {
      center: [lat, lng],
      zoom: 15,
      // behaviors: ["drag", "dblClickZoom", "multiTouch"]
      behaviors: ["default"]
    });
    topluTasima.mapcon = $("#mapcon");
    if (topluTasima.mapcon.width() > 500) {
        // For higher resolution devices, add a zoom control.
        topluTasima.map.controls.add('smallZoomControl');
    }
  }
});
