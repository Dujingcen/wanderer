<script lang="ts">
    import { page } from "$app/stores";
    import directionCaret from "$lib/assets/svgs/caret-right-solid.svg";
    import type { Settings } from "$lib/models/settings";
    import type { Trail } from "$lib/models/trail";
    import type { Waypoint } from "$lib/models/waypoint";
    import { theme } from "$lib/stores/theme_store";
    import { findStartAndEndPoints } from "$lib/util/geojson_util";
    import { toGeoJson } from "$lib/util/gpx_util";
    import {
        createMarkerFromWaypoint,
        createPopupFromTrail,
        FontawesomeMarker,
    } from "$lib/util/maplibre_util";
    import type { ElevationProfileControl } from "$lib/vendor/maplibre-elevation-profile/elevationprofile-control";
    import { FullscreenControl } from "$lib/vendor/maplibre-fullscreen/fullscreen-control";
    import MaplibreGraticule from "$lib/vendor/maplibre-graticule/maplibre-graticule";
    import { StyleSwitcherControl } from "$lib/vendor/maplibre-style-switcher/style-switcher-control";
    import type { GeoJSON } from "geojson";
    import * as M from "maplibre-gl";
    import "maplibre-gl/dist/maplibre-gl.css";
    import { createEventDispatcher, onDestroy, onMount } from "svelte";

    export let trails: Trail[] = [];
    export let waypoints: Waypoint[] = [];
    export let markers: M.Marker[] = [];
    export let map: M.Map | null = null;
    export let drawing: boolean = false;
    export let showElevation: boolean = true;
    export let showInfoPopup: boolean = false;
    export let showGrid: boolean = false;
    export let showStyleSwitcher: boolean = true;
    export let showFullscreen: boolean = false;
    export let showTerrain: boolean = false;
    export let fitBounds: "animate" | "instant" | "off" = "instant";
    export let onMarkerDragEnd:
        | ((marker: M.Marker, wpId?: string) => void)
        | undefined = undefined;

    export let elevationProfileContainer: string | HTMLDivElement | undefined =
        undefined;
    export let mapOptions: Partial<M.MapOptions> | undefined = undefined;

    export let activeTrail: number | null = null;
    export let minZoom: number = 0;

    let mapContainer: HTMLDivElement;
    let epc: ElevationProfileControl | null = null;
    let graticule: MaplibreGraticule | null = null;

    let layers: Record<
        string,
        {
            startMarker: M.Marker | null;
            endMarker: M.Marker | null;
            source: M.GeoJSONSource | null;
            layer: M.LineLayerSpecification | null;
            listener: {
                onEnter: ((e: M.MapMouseEvent) => void) | null;
                onLeave: ((e: M.MapMouseEvent) => void) | null;
                onMouseUp: ((e: M.MapMouseEvent) => void) | null;
                onMouseDown: ((e: M.MapMouseEvent) => void) | null;
                onMouseMove: ((e: M.MapMouseEvent) => void) | null;
            };
        }
    > = {};

    let elevationMarker: FontawesomeMarker;

    let draggingSegment: number | null = null;

    let hoveringTrail: boolean = false;

    const dispatch = createEventDispatcher();

    const trailColors = [
        "#3549BB",
        "#592E9E",
        "#47A2CD",
        "#62D5BC",
        "#7DDE95",
        "#759E2E",
        "#BBA535",
        "#CD6F47",
        "#D5627B",
        "#DE7DC5",
    ];

    $: data = getData(trails);

    $: if (data && map) {
        initMap(map.loaded());
    }

    $: if (activeTrail !== null && trails[activeTrail] !== undefined) {
        if (
            !drawing &&
            fitBounds !== "off" &&
            data.some((d) => d.bbox !== undefined)
        ) {
            focusTrail(trails[activeTrail]);
        }
    } else if (activeTrail === null && trails.length) {
        unFocusTrail();
    }

    $: if ($theme == "dark") {
        epc?.toggleTheme({
            profileBackgroundColor: "#191b24",
            elevationGridColor: "#ddd2",
            labelColor: "#ddd8",
            crosshairColor: "#fff5",
            tooltipBackgroundColor: "#242734",
            tooltipTextColor: "#fff",
        });
    } else {
        epc?.toggleTheme({
            profileBackgroundColor: "#242734",
            elevationGridColor: "#0002",
            labelColor: "#0009",
            crosshairColor: "#0005",
            tooltipBackgroundColor: "#fff",
            tooltipTextColor: "#000",
        });
    }

    $: if (drawing && map) {
        startDrawing();
    } else if (!drawing && map) {
        stopDrawing();
    }

    $: if (showGrid) {
        if (!graticule) {
            graticule = new MaplibreGraticule({
                minZoom: 0,
                maxZoom: 20,
                showLabels: true,
                labelType: "hdms",
                labelSize: 10,
                labelColor: "#858585",
                longitudePosition: "top",
                latitudePosition: "right",
                paint: {
                    "line-opacity": 0.8,
                    "line-color": "rgba(0,0,0,0.2)",
                },
            });
        }
        map?.addControl(graticule);
    } else {
        if (graticule) {
            map?.removeControl(graticule);
        }
    }

    $: if (waypoints) {
        showWaypoints();
        refreshElevationProfile();
    }

    function getData(trails: Trail[]) {
        if (!trails.length) {
            return [];
        }

        const r: GeoJSON[] = [];
        trails.forEach((t) => {
            if (t.expand?.gpx_data) {
                r.push(toGeoJson(t.expand.gpx_data) as GeoJSON);
            } else if (t.lat && t.lon) {
                r.push({
                    id: "",
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Point",
                        coordinates: [t.lon ?? 0, t.lat ?? 0],
                    },
                } as GeoJSON);
            }
        });
        return r;
    }

    function initMap(mapLoaded: boolean) {
        if (!map) {
            return;
        }

        refreshElevationProfile();
        if (showElevation && data.length && activeTrail !== null) {
            epc?.showProfile();
        } else {
            epc?.hideProfile();
        }
        trails.forEach((t, i) => {
            const layerId = t.id!;
            addTrailLayer(t, layerId, i, data[i]);
        });

        Object.keys(layers).forEach((layerId) => {
            const isStillVisible = trails.some((t) => t.id === layerId);
            if (!isStillVisible) {
                removeCaretLayer();
                removeTrailLayer(layerId);
            }
        });

        if (
            !drawing &&
            fitBounds !== "off" &&
            data.some((d) => d.bbox !== undefined)
        ) {
            if (activeTrail !== null && mapLoaded) {
                focusTrail(trails[activeTrail]);
            } else {
                flyToBounds();
            }
        } else if (drawing && activeTrail !== null && mapLoaded) {
            addCaretLayer(trails[activeTrail]?.id);
        }
    }

    export function refreshElevationProfile() {
        if (activeTrail !== null && data[activeTrail]) {
            epc?.setData(data[activeTrail]!, waypoints);
        }
    }

    function getBounds() {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;

        for (const [xMin, yMin, xMax, yMax] of data
            .filter((d) => d.bbox !== undefined)
            .map((d) => d.bbox!)) {
            minX = Math.min(minX, xMin);
            minY = Math.min(minY, yMin);
            maxX = Math.max(maxX, xMax);
            maxY = Math.max(maxY, yMax);
        }

        return new M.LngLatBounds([minX, minY, maxX, maxY]);
    }

    function flyToBounds() {
        const bounds =
            activeTrail !== null && data[activeTrail]
                ? (data[activeTrail].bbox as M.LngLatBoundsLike)
                : getBounds();

        if (!bounds || !map) {
            return;
        }

        map!.fitBounds(bounds, {
            animate: fitBounds == "animate",
            padding: {
                top: 16,
                left: 16,
                right: 16,
                bottom:
                    16 +
                    (epc?.isProfileShown
                        ? map!.getContainer().clientHeight * 0.3
                        : 0),
            },
        });
    }

    function removeTrailLayer(id: string) {
        if (!layers[id]) {
            return;
        }
        const layer = layers[id];

        if (layer.layer) {
            map?.removeLayer(id);
        }
        if (layer.source) {
            map?.removeSource(id);
        }
        layer.startMarker?.remove();
        layer.endMarker?.remove();

        map?.off("mouseenter", id, layers[id].listener.onEnter!);
        map?.off("mouseleave", id, layers[id].listener.onLeave!);
        map?.off("mouseup", id, layers[id].listener.onMouseUp!);
        map?.off("mousemove", id, layers[id].listener.onMouseMove!);
        map?.off("mousedown", id, layers[id].listener.onMouseDown!);

        delete layers[id];
    }

    function createEmptyLayer(id: string) {
        if (!layers[id]) {
            layers[id] = {
                startMarker: null,
                endMarker: null,
                source: null,
                layer: null,
                listener: {
                    onMouseUp: null,
                    onMouseDown: null,
                    onEnter: null,
                    onLeave: null,
                    onMouseMove: null,
                },
            };
        }
    }

    function addTrailLayer(
        trail: Trail,
        id: string,
        index: number,
        geojson: GeoJSON | null | undefined,
    ) {
        if (!geojson || !map) {
            return;
        }

        createEmptyLayer(id);

        if (!layers[id].source) {
            try {
                map.addSource(id, {
                    type: "geojson",
                    data: geojson,
                });
                layers[id].source = map.getSource(id) as M.GeoJSONSource;
            } catch (e) {
                return;
            }
        } else {
            layers[id].source.setData(geojson);
        }

        if (!layers[id].layer) {
            map.addLayer({
                id: id,
                type: "line",
                source: id,
                minzoom: minZoom,
                paint: {
                    "line-color": trailColors[index % trailColors.length],
                    "line-width": 5,
                },
            });
            layers[id].layer = map.getLayer(id) as M.LineLayerSpecification;
            layers[id].listener.onEnter = (e) =>
                highlightTrail(id, trails[activeTrail ?? -1]?.id == id);
            layers[id].listener.onLeave = (e) => unHighlightTrail(id);
            layers[id].listener.onMouseUp = (e) => {
                activeTrail = trails.findIndex((t) => t.id == trail.id);
            };
            layers[id].listener.onMouseMove = moveCrosshairToCursorPosition;
            layers[id].listener.onMouseDown = (e) => handDragStart(e, id);

            map.on("mouseenter", id, layers[id].listener.onEnter);
            map.on("mouseleave", id, layers[id].listener.onLeave);
            map.on("mouseup", id, layers[id].listener.onMouseUp);
            map.on("mousemove", id, layers[id].listener.onMouseMove);
            map.on("mousedown", id, layers[id].listener.onMouseDown);
        }

        if (!drawing) {
            addStartEndMarkers(trail, id, geojson);
        }
    }

    function moveCrosshairToCursorPosition(e: M.MapMouseEvent) {
        epc?.moveCrosshair(e.lngLat.lat, e.lngLat.lng);
        moveElevationMarkerToCursorPosition(e);
    }

    function moveElevationMarkerToCursorPosition(e: M.MapMouseEvent) {
        elevationMarker.setLngLat(e.lngLat);
    }

    function handDragStart(e: M.MapMouseEvent, id: string) {
        if (
            !drawing ||
            (e.originalEvent.target as HTMLElement | null)?.classList.contains(
                "route-anchor",
            )
        ) {
            return;
        }
        e.preventDefault();

        const features = map?.queryRenderedFeatures(e.point, {
            layers: [id],
        });
        const segmentId = features?.at(0)?.properties.segmentId;
        if (segmentId !== null) {
            draggingSegment = segmentId;
        }

        map?.on("mousemove", moveElevationMarkerToCursorPosition);
        map?.once("mouseup", handleDragEnd);
    }

    function handleDragEnd(e: M.MapMouseEvent) {
        map?.off("mousemove", moveElevationMarkerToCursorPosition);
        epc?.hideCrosshair();
        dispatch("segmentDragEnd", { segment: draggingSegment, event: e });
        draggingSegment = null;
    }

    function addCaretLayer(id?: string) {
        if (!map || !id) {
            return;
        }
        if (map.getLayer("direction-carets")) {
            removeCaretLayer();
        }

        map.addLayer({
            id: "direction-carets",
            type: "symbol",
            source: id,
            layout: {
                "symbol-placement": "line",
                "symbol-spacing": [
                    "interpolate",
                    ["exponential", 1.5],
                    ["zoom"],
                    minZoom,
                    80,
                    18,
                    200,
                ],
                "icon-image": "direction-caret",
                "icon-size": [
                    "interpolate",
                    ["exponential", 1.5],
                    ["zoom"],
                    minZoom,
                    0.5,
                    18,
                    0.8,
                ],
            },
        });
    }

    function removeCaretLayer() {
        if (!map || !map.getLayer("direction-carets")) {
            return;
        }
        map.removeLayer("direction-carets");
    }

    export function highlightTrail(
        id: string,
        showElevationMarker: boolean = false,
    ) {
        if (showElevationMarker) {
            elevationMarker.setOpacity("1");
        }        
        map?.setPaintProperty(id, "line-width", 7);
        hoveringTrail = true;
        // map?.setPaintProperty(id, "line-color", "#2766e3");
    }

    export function unHighlightTrail(id: string | undefined) {
        if (!id || draggingSegment !== null) {
            return;
        }
        elevationMarker.setOpacity("0");
        epc?.hideCrosshair();
        hoveringTrail = false;
        map?.setPaintProperty(id, "line-width", 5);
        // map?.setPaintProperty(id, "line-color", "#648ad5");
    }

    function focusTrail(trail: Trail) {
        activeTrail = trails.findIndex((t) => t.id == trail.id);
        if (activeTrail < 0) {
            activeTrail = null;
            return;
        }
        dispatch("select", trail);

        try {
            refreshElevationProfile();
            if (showElevation) {
                epc?.showProfile();
            }
            showWaypoints();
            addCaretLayer(trail.id!);
            flyToBounds();
        } catch (e) {
            console.warn(e);
        }
    }

    function unFocusTrail(trail?: Trail) {
        if (trail) {
            dispatch("unselect", trail);
            unHighlightTrail(trail.id!);
        }

        activeTrail = null;
        flyToBounds();

        if (showElevation) {
            epc?.hideProfile();
        }
        hideWaypoints();
        removeCaretLayer();
    }

    function startDrawing() {
        if (!map) {
            return;
        }
        activeTrail ??= 0;
        map.getCanvas().style.cursor = "crosshair";
        if (trails[activeTrail]) {
            removeStartEndMarkers(trails[activeTrail].id);
        }
    }

    function stopDrawing() {
        if (!map) {
            return;
        }
        map.getCanvas().style.cursor = "inherit";

        if (activeTrail !== null && trails[activeTrail]) {
            addStartEndMarkers(
                trails[activeTrail],
                trails[activeTrail].id,
                data?.at(activeTrail),
            );
        }
    }

    function addStartEndMarkers(
        trail: Trail,
        id: string | undefined,
        geojson: GeoJSON | null | undefined,
    ) {
        if (!map || !trail || !id) {
            return;
        }
        createEmptyLayer(id);

        layers[id].startMarker ??= new FontawesomeMarker(
            { icon: "fa fa-bullseye" },
            {},
        );

        if (!geojson) {
            if (trail.lon && trail.lat) {
                layers[id].startMarker
                    .setLngLat([trail.lon, trail.lat])
                    .addTo(map);
            }
            return;
        }

        const startEndPoint = findStartAndEndPoints(geojson);

        if(!startEndPoint.length) {
            return;
        }

        layers[id].startMarker
            .setLngLat(startEndPoint[0] as M.LngLatLike)
            .addTo(map);

        if (showInfoPopup) {
            const popup = createPopupFromTrail(trail);
            layers[id].startMarker.setPopup(popup);
        }

        layers[id].endMarker ??= new FontawesomeMarker(
            { icon: "fa fa-flag-checkered" },
            {},
        );
        layers[id].endMarker.setLngLat(
            startEndPoint[startEndPoint.length - 1] as M.LngLatLike,
        );
        if (map.getZoom() > minZoom) {
            layers[id].endMarker.addTo(map);
        }
    }

    function removeStartEndMarkers(id: string | undefined) {
        if (!id) {
            return;
        }
        layers[id].startMarker?.remove();
        layers[id].endMarker?.remove();
    }

    export function togglePopup(id: string, currentState?: boolean) {
        if (
            currentState !== undefined &&
            layers[id]?.startMarker?.getPopup().isOpen() != currentState
        ) {
            return;
        }
        layers[id]?.startMarker?.togglePopup();
    }

    function showWaypoints() {
        if (!map) {
            return;
        }

        hideWaypoints();
        for (const waypoint of waypoints) {
            const marker = createMarkerFromWaypoint(waypoint, onMarkerDragEnd);
            marker.addTo(map);
            markers.push(marker);
        }
    }

    function hideWaypoints() {
        if (!map) {
            return;
        }
        for (const m of markers) {
            m.remove();
        }
    }

    onMount(async () => {
        const initialState = {
            lng: 0,
            lat: 0,
            zoom: 1,
        };
        const ElevationProfileControl = (
            await import(
                "$lib/vendor/maplibre-elevation-profile/elevationprofile-control"
            )
        ).ElevationProfileControl;

        const mapStyles: { text: string; value: string; thumbnail?: string }[] =
            [
                ...(($page.data.settings as Settings)?.tilesets ?? []).map(
                    (t) => ({
                        text: t.name,
                        value: t.url,
                    }),
                ),
                {
                    text: "Open Street Maps",
                    value: "/styles/osm.json",
                    thumbnail: "https://tile.openstreetmap.org/1/0/0.png",
                },
                {
                    text: "Open Topo Maps",
                    value: "/styles/otm.json",
                    thumbnail: "https://tile.opentopomap.org/1/0/0.png",
                },
                {
                    text: "Carto Light",
                    value: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
                    thumbnail:
                        "https://basemaps.cartocdn.com/light_all/1/0/0@2x.png",
                },
                {
                    text: "Carto Dark",
                    value: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
                    thumbnail:
                        "https://basemaps.cartocdn.com/dark_all/1/0/0@2x.png",
                },
            ];
        let preferredMapStyleIndex = mapStyles.findIndex(
            (s) => s.text === localStorage.getItem("layer"),
        );

        if (preferredMapStyleIndex == -1) {
            preferredMapStyleIndex = 0;
        }

        const finalMapOptions: M.MapOptions = {
            ...{
                container: mapContainer,
                style:
                    mapStyles[preferredMapStyleIndex].value ??
                    mapStyles[0].value,
                center: [initialState.lng, initialState.lat],
                zoom: initialState.zoom,
            },
            ...mapOptions,
        };
        map = new M.Map(finalMapOptions);

        elevationMarker = new FontawesomeMarker(
            {
                id: "elevation-marker",
                icon: "fa-regular fa-circle",
                fontSize: "xs",
                width: 4,
                backgroundColor: "bg-primary",
                fontColor: "white",
            },
            {},
        );
        elevationMarker.setLngLat([0, 0]).addTo(map);
        elevationMarker.setOpacity("0");

        let img = new Image(20, 20);
        img.onload = () => map!.addImage("direction-caret", img);
        img.src = directionCaret;

        const switcherControl = new StyleSwitcherControl({
            styles: mapStyles,
            onSwitch: (style) => {
                layers = {};
                map?.setStyle(style.value);
                localStorage.setItem("layer", style.text);
            },
            selectedIndex:
                preferredMapStyleIndex !== -1 ? preferredMapStyleIndex : 0,
        });
        map.addControl(
            new M.NavigationControl({ visualizePitch: showTerrain }),
        );
        map.addControl(
            new M.ScaleControl({
                maxWidth: 120,
                unit: $page.data.settings?.unit ?? "metric",
            }),
            "top-left",
        );

        if (showElevation) {
            epc = new ElevationProfileControl({
                visible: false,
                profileBackgroundColor:
                    $theme == "light" ? "#242734" : "#191b24",
                backgroundColor: "bg-menu-background/90",
                unit: $page.data.settings?.unit ?? "metric",
                profileLineWidth: 3,
                displayDistanceGrid: true,
                tooltipDisplayDPlus: false,
                tooltipBackgroundColor: $theme == "light" ? "#fff" : "#242734",
                tooltipTextColor: $theme == "light" ? "#000" : "#fff",
                zoom: false,
                container: elevationProfileContainer,
                onEnter: () => {
                    elevationMarker.setOpacity("1");
                },
                onLeave: () => {
                    elevationMarker.setOpacity("0");
                },
                onMove: (data) => {                    
                    if (!hoveringTrail) {
                        elevationMarker.setLngLat(
                            data.position as M.LngLatLike,
                        );
                    }
                },
            });
            map.addControl(epc);
        }
        if (showStyleSwitcher) {
            map.addControl(switcherControl);
        }

        if (showFullscreen) {
            map.addControl(
                new FullscreenControl(() => {
                    dispatch("fullscreen");
                }),
                "bottom-right",
            );
        }

        if (showTerrain) {
            map!.addControl(
                new M.TerrainControl({
                    source: "terrain",
                }),
            );
        }

        map.on("styledata", () => {
            if (showTerrain) {
                try {
                    if (
                        $page.data.settings?.terrain?.terrain &&
                        !map?.getSource("terrain")
                    ) {
                        map!.addSource("terrain", {
                            type: "raster-dem",
                            url: $page.data.settings?.terrain?.terrain,
                        });
                    }
                    if (
                        $page.data.settings?.terrain?.hillshading &&
                        !map?.getSource("hillshading")
                    ) {
                        map!.addSource("hillshading", {
                            type: "raster-dem",
                            url: $page.data.settings?.terrain?.hillshading,
                        });
                        map!.addLayer({
                            id: "hillshading",
                            source: "terrain",
                            type: "hillshade",
                        });
                    }
                } catch (e) {}
            }
        });

        map.on("moveend", (e) => {
            dispatch("moveend", e.target);
        });

        map.on("zoom", (e) => {
            const zoom = e.target.getZoom();
            Object.values(layers).forEach((l) => {
                if (zoom > minZoom && map && !drawing) {
                    l.endMarker?.addTo(map);
                } else {
                    l.endMarker?.remove();
                }
            });

            dispatch("zoom", e.target);
        });

        map.on("click", (e) => {
            if (hoveringTrail && drawing) {
                return;
            }
            dispatch("click", e);
        });

        map.on("load", () => {
            initMap(true);
            dispatch("init", map);
        });

        showWaypoints();
    });

    onDestroy(() => {
        map?.remove();
    });
</script>

<div id="map" bind:this={mapContainer}></div>

<style>
    #map {
        width: 100%;
        height: 100%;
    }

    :global(.maplibregl-popup-content) {
        @apply bg-background rounded-md shadow-xl pt-5;
    }

    :global(.maplibregl-popup-close-button) {
        top: 4px;
        right: 8px;
        line-height: 0;
        padding-bottom: 2.5px;
        @apply bg-menu-item-background-focus w-3 aspect-square rounded-full;
    }
</style>
