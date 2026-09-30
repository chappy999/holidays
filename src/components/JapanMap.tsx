import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { FeatureCollection, Geometry } from 'geojson';
import {
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Maximize2,
  Minus,
  Plus,
} from 'lucide-react';
import type { Experience, TripRoute } from '../types';
import geography from './japan-geography.json';
import './JapanMap.css';

interface JapanMapProps {
  experiences: Experience[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen?: (id: string) => void;
  route?: TripRoute | null;
  compact?: boolean;
}
type Camera = { k: number; x: number; y: number };
type MapPoint = [number, number];
type Cluster = { x: number; y: number; experiences: Experience[] };
const WIDTH = 900;
const HEIGHT = 650;
const DEFAULT_CAMERA: Camera = { k: 1, x: 0, y: 0 };
const TIER_COLORS = { classic: '#bb4c35', quiet: '#567864', detour: '#bc965e' };
const CITIES = [
  { name: 'Tokyo', lng: 139.6917, lat: 35.6895, dx: 15, dy: -12 },
  { name: 'Kyoto', lng: 135.7681, lat: 35.0116, dx: 14, dy: -15 },
  { name: 'Osaka', lng: 135.5023, lat: 34.6937, dx: -60, dy: 20 },
  { name: 'Kanazawa', lng: 136.6562, lat: 36.5613, dx: -90, dy: -15 },
  { name: 'Hiroshima', lng: 132.4553, lat: 34.3853, dx: -5, dy: -18 },
  { name: 'Nagoya', lng: 136.9066, lat: 35.1815, dx: 12, dy: 15 },
  { name: 'Takayama', lng: 137.2522, lat: 36.1461, dx: 13, dy: -9 },
  { name: 'Nikkō', lng: 139.5986, lat: 36.7199, dx: 13, dy: -9 },
  { name: 'Fukuoka', lng: 130.4017, lat: 33.5902, dx: -30, dy: -16 },
  { name: 'Sapporo', lng: 141.3545, lat: 43.0618, dx: 13, dy: -9 },
  { name: 'Sendai', lng: 140.8694, lat: 38.2682, dx: 13, dy: -9 },
  { name: 'Naha', lng: 127.6809, lat: 26.2124, dx: 13, dy: -9 },
];
const PROJECTION = geoMercator()
  .center([136.2, 35.8])
  .scale(4000)
  .translate([WIDTH / 2, HEIGHT / 2]);
const PATH = geoPath(PROJECTION);
const FEATURES = (geography as unknown as FeatureCollection<Geometry>).features;
const LAND_PATHS = FEATURES.map((feature) => ({
  id: String(feature.id),
  path: PATH(feature) || '',
}));
const project = (lng: number, lat: number): MapPoint => PROJECTION([lng, lat]) as MapPoint;
const onScreen = (point: MapPoint, camera: Camera): MapPoint => [
  point[0] * camera.k + camera.x,
  point[1] * camera.k + camera.y,
];

function fitPoints(points: MapPoint[], padding = 115, width = WIDTH): Camera {
  if (!points.length) return DEFAULT_CAMERA;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const k = Math.min(
    4.5,
    (width - padding * 2) / Math.max(right - left, 125),
    (HEIGHT - padding * 2) / Math.max(bottom - top, 100),
  );
  return { k, x: width / 2 - ((left + right) / 2) * k, y: HEIGHT / 2 - ((top + bottom) / 2) * k };
}

export function JapanMap({
  experiences,
  selectedId,
  onSelect,
  onOpen,
  route,
  compact = false,
}: JapanMapProps) {
  const instanceId = useId().replace(/:/g, '');
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const [dragging, setDragging] = useState(false);
  const [frameWidth, setFrameWidth] = useState(WIDTH);
  const [screenUnit, setScreenUnit] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; camera: Camera; pointerId: number } | null>(null);
  const selected = experiences.find((experience) => experience.id === selectedId);
  const routePoints = useMemo(
    () => route?.stops.map((stop) => project(stop.lng, stop.lat)) || [],
    [route],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width && height) {
        setFrameWidth((width / height) * HEIGHT);
        setScreenUnit(HEIGHT / height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCamera(
      routePoints.length
        ? fitPoints(routePoints, Math.min(115, frameWidth * 0.15), frameWidth)
        : fitPoints(
            [project(131.7, 33.4), project(140.8, 37.4)],
            Math.min(85, frameWidth * 0.09),
            frameWidth,
          ),
    );
  }, [routePoints, frameWidth]);

  useEffect(() => {
    if (!selected) return;
    const point = project(selected.lng, selected.lat);
    setCamera((previous) => {
      const [x, y] = onScreen(point, previous);
      if (x > 90 && x < frameWidth - 90 && y > 105 && y < HEIGHT - 110) return previous;
      return {
        ...previous,
        x: frameWidth / 2 - point[0] * previous.k,
        y: HEIGHT * 0.43 - point[1] * previous.k,
      };
    });
  }, [selected, frameWidth]);

  const clusters = useMemo(() => {
    const result: Cluster[] = [];
    experiences.forEach((experience) => {
      const [x, y] = onScreen(project(experience.lng, experience.lat), camera);
      const nearby = result.find(
        (cluster) => Math.hypot(cluster.x - x, cluster.y - y) < 28 * screenUnit,
      );
      if (nearby) nearby.experiences.push(experience);
      else result.push({ x, y, experiences: [experience] });
    });
    return result;
  }, [experiences, camera, screenUnit]);
  const selectedCluster = clusters.find((cluster) =>
    cluster.experiences.some((experience) => experience.id === selectedId),
  );
  const siblingExperiences = selectedCluster?.experiences || [];
  const siblingIndex = siblingExperiences.findIndex((experience) => experience.id === selectedId);

  const zoom = (factor: number) =>
    setCamera((previous) => {
      const k = Math.min(9, Math.max(0.22, previous.k * factor));
      const ratio = k / previous.k;
      return {
        k,
        x: frameWidth / 2 - (frameWidth / 2 - previous.x) * ratio,
        y: HEIGHT / 2 - (HEIGHT / 2 - previous.y) * ratio,
      };
    });
  const fitJapan = () =>
    setCamera(fitPoints([project(123.5, 24.1), project(146, 45.7)], 65, frameWidth));
  const reset = () =>
    setCamera(
      routePoints.length
        ? fitPoints(routePoints, Math.min(115, frameWidth * 0.15), frameWidth)
        : fitPoints(
            [project(131.7, 33.4), project(140.8, 37.4)],
            Math.min(85, frameWidth * 0.09),
            frameWidth,
          ),
    );
  const svgPoint = (event: PointerEvent<SVGSVGElement>): MapPoint | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return [transformed.x, transformed.y];
  };
  const startDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('[data-map-pin]')) return;
    const point = svgPoint(event);
    if (!point) return;
    drag.current = { x: point[0], y: point[1], camera, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const point = svgPoint(event);
    if (point)
      setCamera({
        ...start.camera,
        x: start.camera.x + point[0] - start.x,
        y: start.camera.y + point[1] - start.y,
      });
  };
  const stopDrag = () => {
    drag.current = null;
    setDragging(false);
  };
  const keyboardPan = (event: KeyboardEvent<SVGSVGElement>) => {
    if ((event.target as Element).closest('[data-map-pin]')) return;
    const movement: Record<string, MapPoint> = {
      ArrowLeft: [55, 0],
      ArrowRight: [-55, 0],
      ArrowUp: [0, 55],
      ArrowDown: [0, -55],
    };
    const delta = movement[event.key];
    if (delta) {
      event.preventDefault();
      setCamera((previous) => ({
        ...previous,
        x: previous.x + delta[0],
        y: previous.y + delta[1],
      }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(1.4);
    } else if (event.key === '-') {
      event.preventDefault();
      zoom(1 / 1.4);
    } else if (event.key === 'Home') {
      event.preventDefault();
      reset();
    }
  };
  const cycleSibling = (direction: number) => {
    const next = (siblingIndex + direction + siblingExperiences.length) % siblingExperiences.length;
    if (siblingExperiences[next]) onSelect(siblingExperiences[next].id);
  };

  const cityLabels: { name: string; x: number; y: number; pinX: number; pinY: number }[] = [];
  CITIES.forEach((city) => {
    if (route?.stops.some((stop) => Math.hypot(stop.lng - city.lng, stop.lat - city.lat) < 0.12))
      return;
    const [pinX, pinY] = onScreen(project(city.lng, city.lat), camera);
    const x = pinX + city.dx * screenUnit,
      y = pinY + city.dy * screenUnit;
    if (x < 35 || x > frameWidth - 100 || y < 75 || y > HEIGHT - 40) return;
    if (
      cityLabels.some(
        (label) =>
          Math.abs(label.x - x) < 100 * screenUnit && Math.abs(label.y - y) < 28 * screenUnit,
      )
    )
      return;
    cityLabels.push({ name: city.name, x, y, pinX, pinY });
  });
  const visibleRoutePoints = routePoints.map((point) => onScreen(point, camera));
  const badgeBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
  const badgeAnchors: MapPoint[] = [];
  const routeBadges = (route?.stops || []).map((stop, index) => {
    const [x, y] = visibleRoutePoints[index];
    const shortName = screenUnit > 1.5 ? stop.name.split(' · ')[0] : stop.name;
    const label = `${shortName} · ${stop.nights} ${stop.nights === 1 ? 'night' : 'nights'}`;
    const labelWidth = Math.max(65, label.length * 5.7) * screenUnit;
    const candidates: MapPoint[] = [
      [-20, -29],
      [20, 32],
      [20, -54],
      [-20, 57],
      [0, -83],
      [0, 86],
      [-70, -29],
      [-70, 32],
      [70, -29],
      [70, 32],
    ];
    const layouts = candidates.map(([dx, dy]) => {
      const badgeX = x + dx * screenUnit,
        badgeY = y + dy * screenUnit;
      const labelOnLeft = badgeX + labelWidth + 23 * screenUnit > frameWidth - 18;
      const textX = labelOnLeft ? badgeX - 18 * screenUnit : badgeX + 18 * screenUnit;
      const box = {
        left: labelOnLeft ? textX - labelWidth : badgeX - 12 * screenUnit,
        right: labelOnLeft ? badgeX + 12 * screenUnit : textX + labelWidth,
        top: badgeY - 16 * screenUnit,
        bottom: badgeY + 17 * screenUnit,
      };
      const collisions = badgeBoxes.filter(
        (other) =>
          box.left < other.right + 6 &&
          box.right > other.left - 6 &&
          box.top < other.bottom + 6 &&
          box.bottom > other.top - 6,
      ).length;
      const outside = Number(
        box.left < 10 || box.right > frameWidth - 10 || box.top < 85 || box.bottom > HEIGHT - 40,
      );
      const badgeOverlap = badgeAnchors.some(
        ([previousX, previousY]) =>
          Math.hypot(previousX - badgeX, previousY - badgeY) < 26 * screenUnit,
      );
      return {
        badgeX,
        badgeY,
        textX,
        labelOnLeft,
        box,
        score: Number(badgeOverlap) * 1000 + collisions * 10 + outside * 30,
      };
    });
    const chosen = layouts.reduce((best, next) => (next.score < best.score ? next : best));
    badgeBoxes.push(chosen.box);
    badgeAnchors.push([chosen.badgeX, chosen.badgeY]);
    return { ...chosen, x, y, label, index, name: stop.name };
  });
  const unobscuredCityLabels = cityLabels.filter(
    (city) =>
      !badgeBoxes.some(
        (box) =>
          city.x < box.right + 6 &&
          city.x + city.name.length * 6 * screenUnit > box.left - 6 &&
          city.y - 12 * screenUnit < box.bottom + 6 &&
          city.y + 3 * screenUnit > box.top - 6,
      ),
  );
  const seaLabel = onScreen(project(133.5, 37.3), camera);
  const pacificLabel = onScreen(project(138.7, 33.4), camera);
  const routePath = visibleRoutePoints
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ');

  return (
    <div
      ref={containerRef}
      style={{ '--map-screen-unit': screenUnit } as CSSProperties}
      className={`japan-map${compact ? ' japan-map--compact' : ''}${dragging ? ' japan-map--dragging' : ''}`}
    >
      <div className="japan-map__heading">
        <span className="japan-map__eyebrow">
          <Compass size={13} strokeWidth={1.5} /> YOUR JAPAN, TAKING SHAPE
        </span>
        <span className="japan-map__hint">
          {route ? 'A journey between places' : 'A little geography. A world of possibilities.'}
        </span>
      </div>
      <div className="japan-map__controls" aria-label="Map controls">
        <button type="button" onClick={() => zoom(1.4)} aria-label="Zoom in" title="Zoom in">
          <Plus size={18} />
        </button>
        <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Zoom out" title="Zoom out">
          <Minus size={18} />
        </button>
        <span />
        <button
          type="button"
          onClick={fitJapan}
          aria-label="Show all of Japan"
          title="Show all of Japan"
        >
          <Maximize2 size={16} />
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label={route ? 'Fit this route' : 'Return to central Japan'}
          title={route ? 'Fit this route' : 'Central Japan'}
        >
          <Compass size={17} />
        </button>
      </div>
      <svg
        ref={svgRef}
        className="japan-map__canvas"
        viewBox={`0 0 ${frameWidth} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="group"
        aria-labelledby={`${instanceId}-title ${instanceId}-description`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
        onKeyDown={keyboardPan}
      >
        <title id={`${instanceId}-title`}>Explore Japan on the map</title>
        <desc id={`${instanceId}-description`}>
          Drag to pan, or use arrow keys. Use plus and minus to zoom. Tab to a place marker and
          press Enter to explore it. Route lines connect overnight bases schematically; they do not
          show actual rail or road tracks.
        </desc>
        <defs>
          <pattern id={`${instanceId}-sea`} width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r=".7" fill="#588c86" opacity=".07" />
          </pattern>
          <filter id={`${instanceId}-land-shadow`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#4d756c" floodOpacity=".1" />
          </filter>
        </defs>
        <rect width={frameWidth} height={HEIGHT} fill="#e6eeea" />
        <rect width={frameWidth} height={HEIGHT} fill={`url(#${instanceId}-sea)`} />
        <g transform={`translate(${camera.x},${camera.y}) scale(${camera.k})`}>
          {LAND_PATHS.map((land) => (
            <path
              key={land.id}
              d={land.path}
              fill={land.id === '392' ? '#f4f1e6' : '#d9e0d5'}
              stroke={land.id === '392' ? '#b8c5b2' : '#c5d0c0'}
              strokeWidth={1 / camera.k}
              strokeLinejoin="round"
              filter={land.id === '392' ? `url(#${instanceId}-land-shadow)` : undefined}
            />
          ))}
        </g>
        <text
          className="japan-map__sea-label"
          x={seaLabel[0]}
          y={seaLabel[1]}
          transform={`rotate(-10 ${seaLabel[0]} ${seaLabel[1]})`}
        >
          SEA OF JAPAN
        </text>
        <text
          className="japan-map__sea-label"
          x={pacificLabel[0]}
          y={pacificLabel[1]}
          transform={`rotate(-10 ${pacificLabel[0]} ${pacificLabel[1]})`}
        >
          PACIFIC OCEAN
        </text>
        {routePath && (
          <g aria-hidden="true">
            <path
              d={routePath}
              fill="none"
              stroke="#f9f4e9"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={routePath}
              fill="none"
              stroke="#bb4c35"
              strokeWidth="2.5"
              strokeDasharray="5 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
        <g className="japan-map__city-labels" aria-hidden="true">
          {unobscuredCityLabels.map((city) => (
            <g key={city.name}>
              <circle cx={city.pinX} cy={city.pinY} r="2.5" fill="#78846f" />
              <text x={city.x} y={city.y}>
                {city.name}
              </text>
            </g>
          ))}
        </g>
        {routeBadges.map((badge) => (
          <g
            key={`${badge.name}-${badge.index}`}
            className="japan-map__route-stop"
            aria-label={`Stop ${badge.index + 1}: ${badge.label}`}
          >
            <path
              d={`M${badge.x},${badge.y} L${badge.badgeX},${badge.badgeY}`}
              stroke="#bb4c35"
              strokeWidth="1.5"
            />
            <circle cx={badge.x} cy={badge.y} r="3" fill="#bb4c35" />
            <circle
              cx={badge.badgeX}
              cy={badge.badgeY}
              r={11 * screenUnit}
              fill="#bb4c35"
              stroke="#fffaf0"
              strokeWidth="2"
            />
            <text
              className="japan-map__route-number"
              x={badge.badgeX}
              y={badge.badgeY + 4 * screenUnit}
              textAnchor="middle"
            >
              {badge.index + 1}
            </text>
            <text
              className="japan-map__route-label"
              x={badge.textX}
              y={badge.badgeY + 4 * screenUnit}
              textAnchor={badge.labelOnLeft ? 'end' : 'start'}
            >
              {badge.label}
            </text>
          </g>
        ))}
        {clusters.map((cluster) => {
          const active = cluster.experiences.some((experience) => experience.id === selectedId);
          const main = active ? selected! : cluster.experiences[0];
          const count = cluster.experiences.length;
          const tier = cluster.experiences.every((experience) => experience.tier === main.tier)
            ? main.tier
            : 'quiet';
          if (
            cluster.x < -25 ||
            cluster.x > frameWidth + 25 ||
            cluster.y < -25 ||
            cluster.y > HEIGHT + 25
          )
            return null;
          return (
            <g
              key={cluster.experiences[0].id}
              data-map-pin="true"
              className={`japan-map__pin${active ? ' japan-map__pin--active' : ''}`}
              transform={`translate(${cluster.x},${cluster.y}) scale(${screenUnit})`}
              role="button"
              tabIndex={0}
              aria-label={`${main.title}${count > 1 ? ` and ${count - 1} nearby ${count === 2 ? 'experience' : 'experiences'}` : ''}`}
              aria-pressed={active}
              onClick={() => onSelect(main.id)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(main.id);
                }
              }}
            >
              <title>
                {main.title}
                {count > 1 ? ` · ${count} nearby experiences` : ''}
              </title>
              <circle className="japan-map__pin-hitarea" r="21" fill="transparent" />
              {active && <circle className="japan-map__pin-halo" r="21" />}
              <circle
                className="japan-map__pin-disc"
                r={count > 1 ? 12 : 7.5}
                style={{ fill: TIER_COLORS[tier] }}
              />
              {count > 1 && (
                <text className="japan-map__pin-count" textAnchor="middle" dy="4">
                  {count}
                </text>
              )}
              {count === 1 && active && <circle r="2.5" fill="#fffaf1" />}
            </g>
          );
        })}
        <g
          className="japan-map__north"
          transform={`translate(${frameWidth - 45} 540)`}
          aria-hidden="true"
        >
          <text textAnchor="middle" y="-17">
            N
          </text>
          <path d="M0,-8 L-5,9 L0,5 L5,9 Z" fill="#738378" />
        </g>
      </svg>
      {selected && (
        <div className="japan-map__selection" aria-live="polite">
          <div className="japan-map__selection-heading">
            <span>{selected.region}</span>
            <span>
              {selected.tier === 'classic'
                ? 'THE CLASSICS'
                : selected.tier === 'quiet'
                  ? 'A QUIETER FIND'
                  : 'WORTH A DETOUR'}
            </span>
          </div>
          <strong>{selected.title}</strong>
          <p>
            {selected.duration} <span>·</span>{' '}
            {selected.category === 'onsen'
              ? 'Onsen & slow moments'
              : selected.category.charAt(0).toUpperCase() + selected.category.slice(1)}
          </p>
          {onOpen && (
            <button className="japan-map__open" type="button" onClick={() => onOpen(selected.id)}>
              Explore this place <span aria-hidden="true">→</span>
            </button>
          )}
          {siblingExperiences.length > 1 && (
            <div className="japan-map__nearby">
              <span>{siblingExperiences.length} experiences nearby</span>
              <button
                type="button"
                onClick={() => cycleSibling(-1)}
                aria-label="Previous nearby experience"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => cycleSibling(1)}
                aria-label="Next nearby experience"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
      {!selected && !compact && (
        <div className="japan-map__invitation">
          <ArrowDownLeft size={18} strokeWidth={1.3} />
          <span>Pick a pin. Find your kind of Japan.</span>
        </div>
      )}
      <div className="japan-map__footer">
        <span>
          {route
            ? 'Dotted line = route idea, not actual rail tracks'
            : 'Drag to explore · select a pin'}
        </span>
        <a
          href="https://www.naturalearthdata.com/about/terms-of-use/"
          target="_blank"
          rel="noreferrer"
        >
          Map: Natural Earth
        </a>
      </div>
    </div>
  );
}

export default JapanMap;
