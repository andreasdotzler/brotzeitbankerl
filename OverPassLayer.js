function fetchJson(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  return fetch(url, { signal: controller.signal }).then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then(function (data) {
    clearTimeout(timer);
    return data;
  }, function (err) {
    clearTimeout(timer);
    throw err;
  });
}

function fetchOverpass(url, primaryTimeout, fallbackTimeout) {
  return fetchJson(url, primaryTimeout || 10000).catch(function () {
    var fallback = url.replace("https://overpass-api.de/", "https://overpass.openstreetmap.fr/");
    if (fallback === url) throw new Error("overpass failed");
    return fetchJson(fallback, fallbackTimeout || 20000);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[ch];
  });
}

L.Control.MinZoomIdenticator = L.Control.extend({
  options: {
    position: "bottomleft"
  },

  _layers: {},

  initialize: function (options) {
    L.Util.setOptions(this, options);
    this._layers = {};
  },

  _addLayer: function (layer) {
    var minzoom = 15;
    if (layer.options.minzoom) minzoom = layer.options.minzoom;
    this._layers[layer._leaflet_id || L.stamp(layer)] = minzoom;
    this._updateBox(null);
  },

  _removeLayer: function (layer) {
    this._layers[layer._leaflet_id || L.stamp(layer)] = null;
    this._updateBox(null);
  },

  _getMinZoomLevel: function () {
    var minZoomlevel = -1;
    for (var key in this._layers) {
      if (this._layers[key] != null && this._layers[key] > minZoomlevel) {
        minZoomlevel = this._layers[key];
      }
    }
    return minZoomlevel;
  },

  onAdd: function (map) {
    this._map = map;
    map.zoomIndecator = this;
    var container = this._container = L.DomUtil.create("div", "bb-zoom-hint");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    map.on("zoomend moveend", this._updateBox, this);
    this._updateBox(null);
    return container;
  },

  onRemove: function (map) {
    map.off("zoomend moveend", this._updateBox, this);
    this._map = null;
  },

  _updateBox: function () {
    if (!this._container || !this._map) return;
    var minzoomlevel = this._getMinZoomLevel();
    if (minzoomlevel === -1) {
      this._container.textContent = "Keine Ebene";
      this._container.style.display = "block";
      return;
    }
    this._container.textContent = "Bitte weiter hineinzoomen (ab Stufe " + minzoomlevel + ").";
    this._container.style.display = this._map.getZoom() >= minzoomlevel ? "none" : "block";
  }
});

L.LatLngBounds.prototype.toOverpassBBoxString = function () {
  var a = this.getSouthWest();
  var b = this.getNorthEast();
  return [a.lat, a.lng, b.lat, b.lng].join(",");
};

L.OverPassLayer = L.FeatureGroup.extend({
  options: {
    minzoom: 15,
    query: "[out:json][timeout:25];(node(BBOX)[amenity=bench];node(BBOX)[leisure=picnic_table];);out;",
    callback: function (data) {
      var elements = data && data.elements ? data.elements : [];
      for (var i = 0; i < elements.length; i++) {
        var e = elements[i];
        if (e.type && e.type !== "node") continue;
        if (e.lat == null || e.lon == null) continue;
        if (e.id in this.instance._ids) continue;
        this.instance._ids[e.id] = true;
        var tags = e.tags || {};
        var isTable = tags.leisure === "picnic_table";
        var marker = L.circleMarker([e.lat, e.lon], {
          radius: isTable ? 8 : 6,
          color: isTable ? "#8a5a00" : "#1d4e89",
          fillColor: isTable ? "#f0a202" : "#4c8ed9",
          fillOpacity: 0.9,
          weight: 2
        });
        marker.bindPopup(this.instance._poiInfo(tags, e.id, e.lat, e.lon), {
          minWidth: 220,
          maxWidth: 320,
          keepInView: true,
          autoPanPaddingTopLeft: L.point(16, 24),
          autoPanPaddingBottomRight: L.point(16, 72)
        });
        this.instance.addLayer(marker);
      }
    }
  },

  initialize: function (options) {
    L.Util.setOptions(this, options);
    this._layers = {};
    this._ids = {};
    this._requested = {};
    this._overpassWarned = false;
  },

  _poiInfo: function (tags, id, lat, lon) {
    var isTable = tags.leisure === "picnic_table";
    var pair = lat + "," + lon;
    var html = '<div class="bb-popup">';
    html += '<p class="bb-type">' + (isTable ? "Picknicktisch" : "Bankerl") + "</p>";
    html += '<div class="bb-actions">';
    html += '<a href="https://www.brotzeitbankerl.de/index.html?bankerl=' + encodeURIComponent(id) + '">Direkter Link</a>';
    html += '<a href="https://www.openstreetmap.org/edit?editor=id&amp;node=' + encodeURIComponent(id) + '" target="_blank" rel="noopener">Bei OpenStreetMap bearbeiten</a>';
    html += "</div>";
    html += '<p class="bb-route-label">Route</p>';
    html += '<div class="bb-route">';
    html += '<a href="https://www.google.com/maps/dir/?api=1&amp;destination=' + encodeURIComponent(pair) + '&amp;travelmode=walking" target="_blank" rel="noopener">Google Maps</a>';
    html += '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(pair) + '&amp;dirflg=w" target="_blank" rel="noopener">Apple Karten</a>';
    html += '<a href="https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&amp;to=' + encodeURIComponent(pair) + '" target="_blank" rel="noopener">OpenStreetMap</a>';
    html += '<a href="https://www.komoot.com/plan/@' + encodeURIComponent(lat) + "," + encodeURIComponent(lon) + ',16z?sport=hike" target="_blank" rel="noopener">Komoot Planer</a>';
    html += "</div>";
    html += '<div class="bb-tags-wrap"><table class="bb-tags">';
    for (var key in tags) {
      if (!Object.prototype.hasOwnProperty.call(tags, key)) continue;
      html += "<tr><th>" + escapeHtml(key) + "</th><td>" + escapeHtml(tags[key]) + "</td></tr>";
    }
    html += "</table></div></div>";
    return html;
  },

  long2tile: function (lon, zoom) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  },
  lat2tile: function (lat, zoom) {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  },
  tile2long: function (x, z) {
    return x / Math.pow(2, z) * 360 - 180;
  },
  tile2lat: function (y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  },

  _view2BBoxes: function (l, b, r, t) {
    var requestZoomLevel = 14;
    var lidx = this.long2tile(l, requestZoomLevel);
    var ridx = this.long2tile(r, requestZoomLevel);
    var tidx = this.lat2tile(t, requestZoomLevel);
    var bidx = this.lat2tile(b, requestZoomLevel);
    var result = [];
    for (var x = lidx; x <= ridx; x++) {
      for (var y = tidx; y <= bidx; y++) {
        var left = Math.round(this.tile2long(x, requestZoomLevel) * 1000000) / 1000000;
        var right = Math.round(this.tile2long(x + 1, requestZoomLevel) * 1000000) / 1000000;
        var top = Math.round(this.tile2lat(y, requestZoomLevel) * 1000000) / 1000000;
        var bottom = Math.round(this.tile2lat(y + 1, requestZoomLevel) * 1000000) / 1000000;
        result.push(L.latLngBounds(L.latLng(bottom, left), L.latLng(top, right)));
      }
    }
    return result;
  },

  _overpassUrl: function (query) {
    return "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
  },

  onMoveEnd: function () {
    if (!this._map || this._map.getZoom() < this.options.minzoom) return;
    var bounds = this._map.getBounds();
    var bboxList = this._view2BBoxes(
      bounds.getSouthWest().lng,
      bounds.getSouthWest().lat,
      bounds.getNorthEast().lng,
      bounds.getNorthEast().lat
    );
    var self = this;
    for (var i = 0; i < bboxList.length; i++) {
      var bbox = bboxList[i];
      var x = bbox.getSouthWest().lng;
      var y = bbox.getNorthEast().lat;
      if (!this._requested[x]) this._requested[x] = {};
      if (this._requested[x][y]) continue;
      this._requested[x][y] = "pending";
      var url = this._overpassUrl(this.options.query.replace(/BBOX/g, bbox.toOverpassBBoxString()));
      (function (tileX, tileY, requestUrl) {
        fetchOverpass(requestUrl).then(function (data) {
          self._requested[tileX][tileY] = true;
          if (self._map == null) return;
          self.options.callback.call({ instance: self }, data);
        }).catch(function () {
          delete self._requested[tileX][tileY];
          if (!self._overpassWarned) {
            self._overpassWarned = true;
            console.error("Overpass request failed");
          }
          if (!self._retried) {
            self._retried = true;
            setTimeout(function () {
              if (self._map) self.onMoveEnd();
            }, 3000);
          }
        });
      })(x, y, url);
    }
  },

  onAdd: function (map) {
    this._map = map;
    if (map.zoomIndecator) {
      this._zoomControl = map.zoomIndecator;
      this._zoomControl._addLayer(this);
    } else {
      this._zoomControl = new L.Control.MinZoomIdenticator();
      map.addControl(this._zoomControl);
      this._zoomControl._addLayer(this);
    }
    this.onMoveEnd();
    if (this.options.query.indexOf("(BBOX)") !== -1) {
      map.on("moveend", this.onMoveEnd, this);
    }
  },

  onRemove: function (map) {
    L.LayerGroup.prototype.onRemove.call(this, map);
    this._ids = {};
    this._requested = {};
    this._zoomControl._removeLayer(this);
    map.off("moveend", this.onMoveEnd, this);
    this._map = null;
  }
});
