var BB_STRINGS = {
  de: {
    impressum: "Impressum",
    metaDescription: "Karte von Bänken und Picknicktischen, mit Link zum Bearbeiten bei OpenStreetMap und zur Fußroute.",
    bench: "Bankerl",
    picnicTable: "Picknicktisch",
    youAreHere: "Du bist ungefähr hier.",
    copied: "Kopiert",
    share: "Teilen",
    missingBench: "Des Bankerl Nummer {id} gibts nicht!",
    loadFailed: "Die Bankerl-Daten konnten nicht geladen werden.",
    photo: "Foto",
    viewOn: "Auf {name} ansehen",
    addPhoto: "Foto hinzufügen",
    editOsm: "Bei OpenStreetMap bearbeiten",
    route: "Route",
    appleMaps: "Apple Karten",
    chooseApp: "App wählen",
    onSite: "Vor Ort",
    details: "Details",
    noLayer: "Keine Ebene",
    zoomHint: "Bitte weiter hineinzoomen (ab Stufe {level}).",
    zoomIn: "Hineinzoomen",
    zoomOut: "Herauszoomen"
  },
  en: {
    impressum: "Legal notice",
    metaDescription: "Map of benches and picnic tables, with a link to edit them on OpenStreetMap and a walking route.",
    bench: "Bench",
    picnicTable: "Picnic table",
    youAreHere: "You are roughly here.",
    copied: "Copied",
    share: "Share",
    missingBench: "Bench number {id} doesn't exist.",
    loadFailed: "The bench data could not be loaded.",
    photo: "Photo",
    viewOn: "View on {name}",
    addPhoto: "Add a photo",
    editOsm: "Edit on OpenStreetMap",
    route: "Directions",
    appleMaps: "Apple Maps",
    chooseApp: "Choose app",
    onSite: "Street level",
    details: "Details",
    noLayer: "No layer",
    zoomHint: "Please zoom in further (from level {level}).",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out"
  }
};

function bbDetectLang() {
  var query = location.search.match(/[?&]lang=(de|en)\b/i);
  if (query) return query[1].toLowerCase();
  var list = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || navigator.userLanguage || "en"];
  for (var i = 0; i < list.length; i++) {
    var code = String(list[i] || "").toLowerCase().split("-")[0];
    if (code === "de" || code === "en") return code;
  }
  return "en";
}

var BB_LANG = bbDetectLang();

function t(key, vars) {
  var pack = BB_STRINGS[BB_LANG] || BB_STRINGS.en;
  var text = pack[key] != null ? pack[key] : BB_STRINGS.en[key];
  if (text == null) return key;
  if (!vars) return text;
  return String(text).replace(/\{(\w+)\}/g, function (_, name) {
    return vars[name] != null ? String(vars[name]) : "";
  });
}

document.documentElement.lang = BB_LANG;
var bbMeta = document.querySelector('meta[name="description"]');
if (bbMeta) bbMeta.setAttribute("content", t("metaDescription"));

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

function commonsFileName(value) {
  return String(value).replace(/^(File|Datei):/i, "").trim().replace(/ /g, "_");
}

function commonsThumb(name) {
  return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(name) + "?width=640";
}

function commonsPage(name) {
  return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name);
}

function addPhoto(photos, seen, src, href, label) {
  if (!src || seen[src]) return;
  seen[src] = true;
  photos.push({ src: src, href: href || src, label: label || t("photo") });
}

function addCommonsPhoto(photos, seen, fileValue) {
  if (/^category:/i.test(fileValue)) return;
  var name = commonsFileName(fileValue);
  if (!name) return;
  addPhoto(photos, seen, commonsThumb(name), commonsPage(name), "Wikimedia Commons");
}

function addPhotoValue(photos, seen, value) {
  if (value == null) return;
  var text = String(value).trim();
  if (!text || /^category:/i.test(text)) return;
  if (/^(file|datei):/i.test(text)) {
    addCommonsPhoto(photos, seen, text);
    return;
  }
  var media = text.match(/\/media\/(?:Datei|File):([^#?\s]+)/i);
  if (media) {
    var fileName = media[1];
    try { fileName = decodeURIComponent(fileName); } catch (e) {}
    addCommonsPhoto(photos, seen, "File:" + fileName);
    return;
  }
  if (/^https?:\/\/\S+$/i.test(text) && /\.(jpe?g|png|gif|webp)(?:$|\?)/i.test(text)) {
    addPhoto(photos, seen, text, text, t("photo"));
  }
}

function photoEntries(tags) {
  var photos = [];
  var seen = {};
  if (tags.wikimedia_commons) addPhotoValue(photos, seen, tags.wikimedia_commons);
  var imageKeys = [];
  for (var key in tags) {
    if (!Object.prototype.hasOwnProperty.call(tags, key)) continue;
    if (key === "image" || /^image:\d+$/.test(key)) imageKeys.push(key);
  }
  imageKeys.sort();
  for (var i = 0; i < imageKeys.length; i++) addPhotoValue(photos, seen, tags[imageKeys[i]]);
  var pano = panoramaxLink(tags);
  if (pano) {
    addPhoto(
      photos,
      seen,
      "https://api.panoramax.xyz/api/pictures/" + pano.id + "/thumb.jpg",
      pano.href,
      "Panoramax"
    );
  }
  return photos.slice(0, 4);
}

function mapillaryLink(tags) {
  var id = String(tags.mapillary || "").trim();
  if (!/^[0-9]+$/.test(id)) return null;
  return {
    label: "Mapillary",
    href: "https://www.mapillary.com/app/?pKey=" + encodeURIComponent(id) + "&focus=photo"
  };
}

function panoramaxLink(tags) {
  var match = String(tags.panoramax || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) return null;
  return {
    label: "Panoramax",
    id: match[0],
    href: "https://api.panoramax.xyz/#pic=" + match[0]
  };
}

function streetLevelLinks(tags) {
  var links = [];
  var mapillary = mapillaryLink(tags);
  var panoramax = panoramaxLink(tags);
  if (mapillary) links.push(mapillary);
  if (panoramax) links.push(panoramax);
  return links;
}

function tagText(tags, key) {
  if (!tags || tags[key] == null) return "";
  return String(tags[key]).trim();
}

function shareIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 16V4"/><path d="M7 8l5-5 5 5"/></svg>';
}

function editIcon() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
}

function photoAddLinks(tags, lat, lon) {
  var caption = tagText(tags, "description") || tagText(tags, "name") || (tags.leisure === "picnic_table" ? t("picnicTable") : t("bench"));
  var commons = "https://commons.wikimedia.org/wiki/Special:UploadWizard?lat=" + encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon) + "&descriptionlang=" + BB_LANG + "&captionlang=" + BB_LANG + "&description=" + encodeURIComponent(caption) + "&caption=" + encodeURIComponent(caption);
  var links = [
    { label: "Wikimedia Commons", href: commons },
    {
      label: "Panoramax",
      href: "https://panoramax.openstreetmap.fr/#focus=map&map=18/" + encodeURIComponent(lat) + "/" + encodeURIComponent(lon)
    }
  ];
  if (!mapillaryLink(tags)) {
    links.push({ label: "Mapillary", href: "https://www.mapillary.com/apps" });
  }
  return links;
}

function photoHtml(tags, lat, lon) {
  var photos = photoEntries(tags);
  var html = "";
  if (photos.length) {
    html += '<div class="bb-photos">';
    for (var i = 0; i < photos.length; i++) {
      var photo = photos[i];
      var viewer = photo.label === "Mapillary" || photo.label === "Panoramax";
      html += '<a href="' + escapeHtml(photo.href) + '" target="_blank" rel="noopener">';
      html += '<img src="' + escapeHtml(photo.src) + '" alt="' + escapeHtml(viewer ? t("viewOn", { name: photo.label }) : photo.label) + '" loading="lazy" onerror="this.parentNode.remove()">';
      if (viewer) html += '<span class="bb-photo-label">' + escapeHtml(t("viewOn", { name: photo.label })) + "</span>";
      html += "</a>";
    }
    html += "</div>";
    return html;
  }
  var adds = photoAddLinks(tags, lat, lon);
  html += '<p class="bb-route-label">' + escapeHtml(t("addPhoto")) + "</p>";
  html += '<div class="bb-route">';
  for (var a = 0; a < adds.length; a++) {
    html += '<a href="' + escapeHtml(adds[a].href) + '" target="_blank" rel="noopener">' + escapeHtml(adds[a].label) + "</a>";
  }
  html += "</div>";
  return html;
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
      this._container.textContent = t("noLayer");
      this._container.style.display = "block";
      return;
    }
    this._container.textContent = t("zoomHint", { level: minzoomlevel });
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
        marker._baseStyle = {
          radius: marker.options.radius,
          color: marker.options.color,
          fillColor: marker.options.fillColor,
          fillOpacity: marker.options.fillOpacity,
          weight: marker.options.weight
        };
        marker.bindPopup(this.instance._poiInfo(tags, e.id, e.lat, e.lon), {
          minWidth: 220,
          maxWidth: 320,
          autoPan: false,
          keepInView: false
        });
        this.instance.addLayer(marker);
        this.instance._markersById[String(e.id)] = marker;
        if (String(e.id) === this.instance._focusId) this.instance._select(marker);
      }
    }
  },

  initialize: function (options) {
    L.Util.setOptions(this, options);
    this._layers = {};
    this._ids = {};
    this._markersById = {};
    this._requested = {};
    this._focusId = null;
    this._selected = null;
    this._overpassWarned = false;
  },

  setFocus: function (id) {
    this._focusId = String(id);
    var marker = this._markersById[this._focusId];
    if (marker) this._select(marker);
  },

  _select: function (marker) {
    if (this._selected && this._selected !== marker && this._selected._baseStyle) {
      this._selected.setStyle(this._selected._baseStyle);
    }
    marker.setStyle({
      radius: 13,
      color: "#ffffff",
      weight: 4,
      fillColor: "#d00000",
      fillOpacity: 1
    });
    if (marker.bringToFront) marker.bringToFront();
    this._selected = marker;
    var self = this;
    setTimeout(function () {
      if (self._map && self._selected === marker) marker.openPopup();
    }, 0);
  },

  _poiInfo: function (tags, id, lat, lon) {
    var isTable = tags.leisure === "picnic_table";
    var typeLabel = isTable ? t("picnicTable") : t("bench");
    var description = tagText(tags, "description");
    var name = tagText(tags, "name");
    var heading = description || name || typeLabel;
    var pair = lat + "," + lon;
    var shareUrl = location.origin + location.pathname + "?bankerl=" + encodeURIComponent(id);
    var html = '<div class="bb-popup">';
    html += '<div class="bb-head">';
    html += '<div class="bb-titles">';
    if (!description && heading !== typeLabel) html += '<p class="bb-kind">' + escapeHtml(typeLabel) + "</p>";
    html += '<p class="bb-title">' + escapeHtml(heading) + "</p>";
    html += "</div>";
    html += '<div class="bb-actions">';
    html += '<button type="button" class="bb-icon bb-share" data-url="' + escapeHtml(shareUrl) + '" data-title="' + escapeHtml(heading) + '" data-copied="' + escapeHtml(t("copied")) + '" aria-label="' + escapeHtml(t("share")) + '">' + shareIcon() + "</button>";
    html += '<a class="bb-icon" href="https://www.openstreetmap.org/edit?editor=id&amp;node=' + encodeURIComponent(id) + '" target="_blank" rel="noopener" aria-label="' + escapeHtml(t("editOsm")) + '">' + editIcon() + "</a>";
    html += "</div></div>";
    html += photoHtml(tags, lat, lon);
    html += '<p class="bb-route-label">' + escapeHtml(t("route")) + "</p>";
    html += '<div class="bb-route">';
    html += '<a href="https://www.google.com/maps/dir/?api=1&amp;destination=' + encodeURIComponent(pair) + '&amp;travelmode=walking" target="_blank" rel="noopener">Google Maps</a>';
    html += '<a href="https://maps.apple.com/?daddr=' + encodeURIComponent(pair) + '&amp;dirflg=w" target="_blank" rel="noopener">' + escapeHtml(t("appleMaps")) + "</a>";
    html += '<a href="https://www.komoot.com/plan/@' + lat + "," + lon + ',16z?sport=hike" target="_blank" rel="noopener">Komoot</a>';
    html += '<a href="geo:' + lat + "," + lon + "?q=" + encodeURIComponent(pair) + '">' + escapeHtml(t("chooseApp")) + "</a>";
    html += "</div>";
    html += '<p class="bb-route-label">' + escapeHtml(t("onSite")) + "</p>";
    html += '<div class="bb-route">';
    html += '<a href="https://www.google.com/maps/@?api=1&amp;map_action=pano&amp;viewpoint=' + encodeURIComponent(pair) + '" target="_blank" rel="noopener">Google Street View</a>';
    html += '<a href="https://maps.apple.com/look-around?coordinate=' + encodeURIComponent(pair) + '" target="_blank" rel="noopener">Apple Look Around</a>';
    var street = streetLevelLinks(tags);
    for (var s = 0; s < street.length; s++) {
      html += '<a href="' + escapeHtml(street[s].href) + '" target="_blank" rel="noopener">' + escapeHtml(street[s].label) + "</a>";
    }
    html += "</div>";
    html += '<details class="bb-details"><summary>' + escapeHtml(t("details")) + "</summary>";
    html += '<div class="bb-tags-wrap"><table class="bb-tags">';
    for (var key in tags) {
      if (!Object.prototype.hasOwnProperty.call(tags, key)) continue;
      html += "<tr><th>" + escapeHtml(key) + "</th><td>" + escapeHtml(tags[key]) + "</td></tr>";
    }
    html += "</table></div></details></div>";
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
