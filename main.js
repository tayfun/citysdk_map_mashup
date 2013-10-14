ymaps.ready(function() {
  if (navigator.geolocation) {
    $(".loading").show();
    navigator.geolocation.getCurrentPosition(geoSuccess, geoError);

  }
  function geoSuccess(position) {
    console.log("got position from geo api");
    initMap(position.coords.latitude, position.coords.longitude);
  }
  function geoError() {
    console.log("got position from yandex ip map");
    initMap(ymaps.geolocation.latitude, ymaps.geolocation.longitude);
  }
  function initMap(lat, lng) {
    $(".loading").remove();
    var myMap = new ymaps.Map('mapcon', {
      center: [lat, lng],
      zoom: 15,
      behaviors: ["drag", "dblClickZoom", "multiTouch"]
    });
  }
});
