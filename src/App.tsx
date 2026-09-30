import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Footprints,
  Heart,
  Info,
  Leaf,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  Mountain,
  Plane,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  TrainFront,
  Users,
  X,
} from 'lucide-react';
import type { Experience, Profile, TripRoute, TripState, Vote } from './types';
import {
  decodePlan,
  encodePlan,
  fitReasons,
  getDecision,
  INTERESTS,
  readSaved,
  STORAGE_KEY,
  validateState,
} from './state';
import classics from '../research/classics.json';
import quiet from '../research/quiet.json';
import routesData from '../research/routes.json';
const LazyJapanMap = lazy(() => import('./components/JapanMap'));
function JapanMap(props: ComponentProps<typeof LazyJapanMap>) {
  return (
    <Suspense
      fallback={
        <div className="map-loading" role="status">
          Unfolding your map…
        </div>
      }
    >
      <LazyJapanMap {...props} />
    </Suspense>
  );
}
import Artwork from './components/Artwork';
const experiences = [...classics, ...quiet] as Experience[];
const routes = routesData as TripRoute[];
type Page = 'discover' | 'routes' | 'shortlist' | 'profile';
const tierNames = {
  classic: 'The classics',
  quiet: 'A little quieter',
  detour: 'Worth the detour',
};
const categoryNames = {
  food: 'Food & drink',
  culture: 'Culture & history',
  nature: 'The great outdoors',
  art: 'Art & design',
  neighbourhood: 'Local life',
  onsen: 'Ryokan & onsen',
};
const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const shortTitles: Record<string, string> = {
  'tokyo-asakusa-sensoji': 'Old Tokyo, a little slower',
  'tokyo-meiji-harajuku': 'Forest paths & city streets',
};
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = ref.current;
    el?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && el) {
        const items = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
          ),
        ).filter((x) => x.offsetParent !== null);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? 'modal-wide' : ''}`}
      >
        <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}>
          <X size={21} />
        </button>
        {children}
      </div>
    </div>
  );
}
function downloadPlan(state: TripState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }),
    url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'japan-together-plan.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [state, setState] = useState<TripState>(readSaved),
    [page, setPage] = useState<Page>('discover'),
    [activePerson, setActivePerson] = useState<0 | 1>(0);
  const [search, setSearch] = useState(''),
    [tier, setTier] = useState('all'),
    [region, setRegion] = useState('all'),
    [category, setCategory] = useState('all'),
    [sort, setSort] = useState('fit');
  const [mapSelectedId, setMapSelectedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [showShare, setShowShare] = useState(false),
    [showResearch, setShowResearch] = useState(false),
    [notice, setNotice] = useState('');
  const [showMap, setShowMap] = useState(true),
    [shortlistFilter, setShortlistFilter] = useState('all'),
    [routeId, setRouteId] = useState(routes[1]?.id || routes[0]?.id),
    [showFilters, setShowFilters] = useState(false),
    [menuOpen, setMenuOpen] = useState(false);
  const [incoming, setIncoming] = useState<TripState | null>(null),
    [storageError, setStorageError] = useState(false),
    [copied, setCopied] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null),
    contentRef = useRef<HTMLDivElement>(null);
  const names = state.profile.travellers.map((t) => t.name);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  useEffect(() => {
    const raw = new URLSearchParams(location.hash.slice(1)).get('plan');
    if (raw) {
      try {
        setIncoming(decodePlan(raw));
      } catch (err) {
        setNotice((err as Error).message);
      }
    }
  }, []);
  useEffect(() => {
    if (selectedId) setMapSelectedId(selectedId);
  }, [selectedId]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timeout);
  }, [notice]);
  const selected = experiences.find((e) => e.id === selectedId),
    activeRoute = routes.find((r) => r.id === routeId) || routes[0];
  const shortlist = experiences.filter((e) => {
    const v = state.votes[e.id];
    return v?.some((x) => x === 'love' || x === 'maybe');
  });
  const bothCount = experiences.filter((e) => getDecision(state.votes[e.id]) === 'both').length;
  const rankedRoute = routes.find((r) => r.id === state.chosenRoute) || routes[1] || routes[0];
  const routeFit = (e: Experience) => {
    const distance = Math.min(
      ...rankedRoute.stops.map(
        (stop) =>
          Math.hypot((e.lng - stop.lng) * Math.cos((e.lat * Math.PI) / 180), e.lat - stop.lat) *
          111,
      ),
    );
    return (
      fitReasons(e, state.profile).length * 2 +
      (distance < 25 ? 2.5 : distance < 65 ? 1.5 : distance < 110 ? 0 : -2) +
      (e.walking === 'active' &&
      state.profile.travellers.some((t) => t.walking.startsWith('Active'))
        ? 0.5
        : 0)
    );
  };
  const filtered = useMemo(
    () =>
      experiences
        .filter((e) => {
          const q = searchText(search).trim();
          return (
            (!q ||
              searchText([e.title, e.region, e.description, ...e.tags].join(' ')).includes(q)) &&
            (tier === 'all' || e.tier === tier) &&
            (region === 'all' || e.region === region) &&
            (category === 'all' || e.category === category)
          );
        })
        .sort((a, b) =>
          sort === 'name'
            ? a.title.localeCompare(b.title)
            : sort === 'region'
              ? a.region.localeCompare(b.region)
              : routeFit(b) - routeFit(a),
        ),
    [search, tier, region, category, sort, state.profile, rankedRoute],
  );
  const shortlisted =
    shortlistFilter === 'passed'
      ? experiences.filter((e) => getDecision(state.votes[e.id]) === 'passed')
      : shortlist.filter(
          (e) => shortlistFilter === 'all' || getDecision(state.votes[e.id]) === shortlistFilter,
        );
  const vote = (id: string, who: 0 | 1, value: Vote) =>
    setState((prev) => {
      const pair: [Vote | null, Vote | null] = [...(prev.votes[id] || [null, null])];
      pair[who] = pair[who] === value ? null : value;
      return { ...prev, votes: { ...prev.votes, [id]: pair } };
    });
  const go = (next: Page) => {
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const updateProfile = (key: keyof Profile, value: string) =>
    setState((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }));
  const sharePayload = useMemo(() => {
    try {
      return { url: `${location.origin}${location.pathname}#plan=${encodePlan(state)}`, error: '' };
    } catch (err) {
      return { url: '', error: (err as Error).message };
    }
  }, [state]);
  const shareUrl = () => sharePayload.url;
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Choose a plan file smaller than 1 MB.');
      setIncoming(validateState(JSON.parse(await file.text())));
    } catch (err) {
      setNotice(`Could not open this plan. ${(err as Error).message}`);
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };
  const renderCard = (e: Experience, index: number) => {
    const decision = getDecision(state.votes[e.id]);
    return (
      <article
        className="experience-card"
        key={e.id}
        style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
      >
        <button
          className="card-art"
          onClick={() => setSelectedId(e.id)}
          aria-label={`Explore ${e.title}`}
        >
          <Artwork
            kind={e.category === 'nature' ? e.region : e.category === 'food' ? 'food' : e.region}
          />
          <span className={`tier-label tier-${e.tier}`}>
            {e.tier === 'quiet' ? (
              <Leaf size={11} />
            ) : e.tier === 'detour' ? (
              <Compass size={11} />
            ) : (
              <Sparkles size={11} />
            )}{' '}
            {tierNames[e.tier]}
          </span>
        </button>
        <div className="card-copy">
          <div className="eyebrow card-location">
            <MapPin size={11} />
            {e.region}
            <span>·</span>
            {categoryNames[e.category]}
          </div>
          <button className="card-title" onClick={() => setSelectedId(e.id)}>
            {shortTitles[e.id] || e.title}
          </button>
          <p className="card-description">{e.description}</p>
          <div className="card-bottom">
            <span>
              <Clock3 size={12} />
              {e.duration}
            </span>
            <button
              className={`save-button ${state.votes[e.id]?.[activePerson] === 'love' ? 'is-saved' : ''}`}
              aria-label={`${state.votes[e.id]?.[activePerson] === 'love' ? 'Remove' : 'Add'} ${e.title} ${state.votes[e.id]?.[activePerson] === 'love' ? 'from' : 'to'} ${names[activePerson]}'s favourites`}
              onClick={() => vote(e.id, activePerson, 'love')}
            >
              <Heart
                size={16}
                fill={state.votes[e.id]?.[activePerson] === 'love' ? 'currentColor' : 'none'}
              />
              <span>
                {decision === 'both'
                  ? 'Both love this'
                  : state.votes[e.id]?.[activePerson] === 'love'
                    ? 'Saved'
                    : 'Save'}
              </span>
            </button>
          </div>
        </div>
      </article>
    );
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to the trip planner
      </a>
      <header className="site-header">
        <button className="brand" onClick={() => go('discover')} aria-label="Japan together home">
          <span className="brand-mark">
            日<span />
          </span>
          <span>
            JAPAN, <em>TOGETHER</em>
            <small>A JOURNEY FOR TWO</small>
          </span>
        </button>
        <nav className={menuOpen ? 'navigation open' : 'navigation'} aria-label="Main navigation">
          {(
            [
              ['discover', 'Discover'],
              ['routes', 'Route ideas'],
              ['shortlist', 'Our shortlist'],
              ['profile', 'About us'],
            ] as [Page, string][]
          ).map(([id, label]) => (
            <button
              className={page === id ? 'nav-link active' : 'nav-link'}
              key={id}
              onClick={() => go(id)}
            >
              {label}
              {id === 'shortlist' && shortlist.length > 0 && (
                <span className="nav-count">{shortlist.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <div className="avatars" aria-label={`${names[0]} and ${names[1]}`}>
            <span>{names[0][0]}</span>
            <span>{names[1][0]}</span>
          </div>
          <button className="button button-dark share-button" onClick={() => setShowShare(true)}>
            <Share2 size={14} />
            <span>Share our trip</span>
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="main">
        {storageError && (
          <div className="storage-warning">
            This browser cannot save changes. Download your plan to keep it.{' '}
            <button onClick={() => downloadPlan(state)}>Download plan</button>
          </div>
        )}
        {location.hostname.endsWith('.trycloudflare.com') && !storageError && (
          <div className="storage-warning">
            Temporary address: download your plan before closing this session. Reopen the file if
            your next visit uses a new link.{' '}
            <button onClick={() => downloadPlan(state)}>Download plan</button>
          </div>
        )}
        {page === 'discover' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow hero-eyebrow">
                  <span className="little-sun" />
                  JAPAN IN NOVEMBER · {names[0].toUpperCase()} & {names[1].toUpperCase()}
                </div>
                <h1>
                  A little wonder.
                  <br />A world <em>away.</em>
                </h1>
                <p>
                  Lantern-lit lanes. Mountain trails. One more bowl of ramen.
                  <br className="desktop-break" /> Let’s find the Japan that feels like you.
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  Let the exploring begin <ArrowDown size={16} />
                </button>
                <div className="hero-trip">
                  <div>
                    <span className="trip-kicker">THE DATES</span>
                    <strong>02—15 November</strong>
                  </div>
                  <div>
                    <span className="trip-kicker">THE TIME</span>
                    <strong>13 nights, just you two</strong>
                  </div>
                  <div>
                    <span className="trip-kicker">THE SPIRIT</span>
                    <strong>A little off the beaten path</strong>
                  </div>
                </div>
              </div>
              <div className="hero-visual">
                <Artwork />
                <div className="japanese-title" aria-hidden="true">
                  ふたりの日本
                </div>
                <div className="art-caption">
                  <span>AUTUMN FIELD NOTES</span>
                  <span>日本 · {state.profile.year}</span>
                </div>
                <div className="hero-stamp">
                  <Leaf size={20} />
                  <span>
                    TAKE THE
                    <br />
                    SCENIC ROUTE
                  </span>
                </div>
              </div>
            </section>
            <div className="personal-strip">
              <span className="strip-icon">
                <Mountain size={20} />
              </span>
              <p>
                <strong>Made for your kind of adventure.</strong> Big walks, small discoveries, and
                very good food.
              </p>
              <button onClick={() => go('profile')}>
                Your travel profiles <ArrowRight size={14} />
              </button>
            </div>
            <section className="discovery section-shell" ref={contentRef}>
              <div className="section-top">
                <div>
                  <div className="eyebrow red-text">THE POSSIBILITIES</div>
                  <h2>Find your kind of Japan.</h2>
                  <p>Start with a feeling. Follow it somewhere extraordinary.</p>
                </div>
                <div className="view-controls">
                  <button className={showMap ? 'selected' : ''} onClick={() => setShowMap(true)}>
                    <Map size={15} />
                    Map & places
                  </button>
                  <button className={!showMap ? 'selected' : ''} onClick={() => setShowMap(false)}>
                    All places
                  </button>
                </div>
              </div>
              <div className="explore-toolbar">
                <div className="tier-filters">
                  {[
                    ['all', 'Everything'],
                    ['classic', 'The classics'],
                    ['quiet', 'A little quieter'],
                    ['detour', 'Worth the detour'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTier(id)}
                      className={tier === id ? 'filter-chip active' : 'filter-chip'}
                    >
                      {id === 'quiet' && <Leaf size={12} />} {label}
                    </button>
                  ))}
                </div>
                <div className="search-tools">
                  <label className="search-box">
                    <Search size={15} />
                    <input
                      aria-label="Search experiences"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="A place, a feeling, a bowl of ramen…"
                    />
                    {search && (
                      <button aria-label="Clear search" onClick={() => setSearch('')}>
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <button
                    className={`icon-button filter-toggle ${showFilters ? 'active' : ''}`}
                    aria-label="More filters"
                    aria-expanded={showFilters}
                    onClick={() => setShowFilters((v) => !v)}
                  >
                    <SlidersHorizontal size={17} />
                  </button>
                </div>
              </div>
              {showFilters && (
                <div className="advanced-filters">
                  <label>
                    Where
                    <select value={region} onChange={(e) => setRegion(e.target.value)}>
                      <option value="all">All regions</option>
                      {[...new Set(experiences.map((e) => e.region))].sort().map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    What you love
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="all">All interests</option>
                      {Object.entries(categoryNames).map(([id, label]) => (
                        <option value={id} key={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sort by
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option value="fit">Your interests & starting route</option>
                      <option value="name">Name</option>
                      <option value="region">Region</option>
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSearch('');
                      setTier('all');
                      setRegion('all');
                      setCategory('all');
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              )}
              <div className="results-top">
                <span>
                  <strong>{filtered.length}</strong> places to spark an idea{' '}
                  <span className="subtle">· a starting collection</span>
                </span>
                <label className="voting-as">
                  Saving as{' '}
                  <select
                    aria-label="Who is saving favourites"
                    value={activePerson}
                    onChange={(e) => setActivePerson(Number(e.target.value) as 0 | 1)}
                  >
                    {names.map((n, i) => (
                      <option value={i} key={i}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={`explorer ${showMap ? 'with-map' : 'without-map'}`}>
                <div className="experience-list">
                  {filtered.length ? (
                    filtered.map(renderCard)
                  ) : (
                    <div className="empty-state">
                      <Compass size={34} />
                      <h3>A little too far off the map.</h3>
                      <p>Try another search or loosen the filters.</p>
                      <button
                        className="button button-outline"
                        onClick={() => {
                          setSearch('');
                          setTier('all');
                          setRegion('all');
                          setCategory('all');
                        }}
                      >
                        Show all experiences
                      </button>
                    </div>
                  )}
                </div>
                {showMap && (
                  <aside className="map-panel">
                    <div className="map-panel-heading">
                      <span>
                        <span className="live-dot" />A WORLD OF POSSIBILITIES
                      </span>
                      <span>Follow your curiosity</span>
                    </div>
                    <JapanMap
                      experiences={filtered}
                      selectedId={mapSelectedId}
                      onSelect={setMapSelectedId}
                      onOpen={setSelectedId}
                    />
                    <div className="map-panel-footer">
                      <MapPin size={14} />
                      <span>Choose a pin to get a little closer.</span>
                      <span className="map-key">
                        <i /> Classic <i /> Quieter <i /> Detour
                      </span>
                    </div>
                    <div className="map-tip">
                      <Leaf size={17} />
                      <p>
                        <strong>November has its own rhythm.</strong> Early colour in the mountains;
                        Kyoto’s peak often comes later. Treat foliage as a bonus, not a promise.
                      </p>
                    </div>
                    <button className="map-route-cta" onClick={() => go('routes')}>
                      <span>
                        Wonderful places. One thoughtful journey.
                        <small>See how the pieces could fit together</small>
                      </span>
                      <ArrowRight size={21} />
                    </button>
                  </aside>
                )}
              </div>
              <div className="collection-note">
                <Info size={16} />
                <p>
                  Thoughtful possibilities, not a booking guide yet. Current opening times,
                  availability, prices and seasonal details still need live checks.{' '}
                  <button onClick={() => setShowResearch(true)}>About the research</button>
                </p>
              </div>
            </section>
          </>
        )}
        {page === 'routes' && (
          <section className="section-shell inner-page">
            <div className="eyebrow red-text">A FEW WAYS TO GO</div>
            <h1>
              Same Japan.
              <br />
              <em>Different adventures.</em>
            </h1>
            <p className="page-intro">
              Three starting points for your 13 nights. Each has a rhythm, a reason, and a few
              tradeoffs. The countryside route is the closest fit to what you’ve told us.
            </p>
            <div className="route-cards">
              {routes.map((r, i) => (
                <button
                  key={r.id}
                  className={`route-card ${routeId === r.id ? 'selected' : ''}`}
                  onClick={() => setRouteId(r.id)}
                >
                  <div className="route-card-top">
                    <span className="eyebrow">ROUTE 0{i + 1}</span>
                    {i === 1 && (
                      <span className="recommended">
                        <Sparkles size={12} />
                        Your strongest fit
                      </span>
                    )}
                  </div>
                  <h3>{r.title}</h3>
                  <p>{r.subtitle}</p>
                  <div className="route-path">
                    {r.stops.map((s, j) => (
                      <span key={`${s.name}-${j}`}>
                        {j > 0 && <ArrowRight size={10} />} {s.name}
                      </span>
                    ))}
                  </div>
                  <div className="route-facts">
                    <span>{r.hotelChanges} hotel changes</span>
                    <span>Fly from {r.departure}</span>
                  </div>
                  <div className="route-selection">
                    {state.chosenRoute === r.id ? (
                      <>
                        <CheckCheck size={14} />
                        Your starting point
                      </>
                    ) : (
                      <>
                        Explore this route
                        <ArrowRight size={15} />
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="route-detail">
              <div className="route-description">
                <span className="eyebrow red-text">YOUR JOURNEY, IN OUTLINE</span>
                <h2>{activeRoute.title}</h2>
                <p>{activeRoute.description}</p>
                <div className="route-highlight-list">
                  {activeRoute.highlights.map((x) => (
                    <span key={x}>
                      <Check size={14} />
                      {x}
                    </span>
                  ))}
                </div>
                <div className="tradeoff-box">
                  <Compass size={18} />
                  <div>
                    <strong>The tradeoff</strong>
                    <p>{activeRoute.tradeoff}</p>
                  </div>
                </div>
                <button
                  className="button button-dark"
                  onClick={() => {
                    setState((prev) => ({ ...prev, chosenRoute: activeRoute.id }));
                    setNotice('Saved as your starting route. Your shortlist stays flexible.');
                  }}
                >
                  {state.chosenRoute === activeRoute.id ? (
                    <CheckCheck size={16} />
                  ) : (
                    <Heart size={16} />
                  )}{' '}
                  {state.chosenRoute === activeRoute.id
                    ? 'Your starting point'
                    : 'Make this our starting point'}
                </button>
                <p className="micro-copy">
                  These are draft routes. Saving a place does not automatically add it to a day.
                </p>
              </div>
              <div className="route-map">
                <JapanMap
                  experiences={[]}
                  selectedId={null}
                  onSelect={() => {}}
                  route={activeRoute}
                  compact
                />
              </div>
            </div>
            <div className="route-itinerary">
              <div>
                <div className="eyebrow red-text">14 DAYS · 13 NIGHTS</div>
                <h2>
                  A little structure.
                  <br />
                  <em>Room for serendipity.</em>
                </h2>
                <p>
                  Arrival day starts gently. Every transfer takes time away from exploring, so keep
                  a whole day’s plans realistic.
                </p>
                <div className="budget-note">
                  <span className="eyebrow">YOUR ROOM BUDGET</span>
                  <strong>£1,300–£1,950</strong>
                  <p>
                    For 13 nights at £100–£150 per room. A planning target, excluding ryokan
                    splurges, meals and transport—not a live hotel quote.
                  </p>
                </div>
              </div>
              <div className="day-list">
                {activeRoute.days.map((day, i) => (
                  <details className="day-item" key={day.date} open={i === 0 || undefined}>
                    <summary>
                      <span className="day-number">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <small>
                          {new Date(day.date + 'T12:00:00').toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}{' '}
                          · {day.base}
                        </small>
                        <strong>{day.title}</strong>
                      </span>
                      <ChevronDown size={16} />
                    </summary>
                    <p>{day.detail}</p>
                  </details>
                ))}
              </div>
            </div>
            <div className="transfer-section">
              <div className="eyebrow red-text">THE DISTANCES BETWEEN</div>
              <h2>Know what the journey asks of you.</h2>
              <div className="transfer-grid">
                {activeRoute.transfers.map((t, i) => (
                  <div key={i} className="transfer-card">
                    <TrainFront size={18} />
                    <h4>
                      {t.from} <ArrowRight size={13} /> {t.to}
                    </h4>
                    <strong>{t.duration}</strong>
                    <p>{t.note}</p>
                  </div>
                ))}
              </div>
              <p className="micro-copy">
                Travel times are approximate planning ranges, not current timetables. Check the
                final airport and exact services before booking. JR Pass value depends on your final
                journeys; compare individual tickets.
              </p>
            </div>
          </section>
        )}
        {page === 'shortlist' && (
          <section className="section-shell inner-page">
            <div className="eyebrow red-text">THE PLACES THAT STAY WITH YOU</div>
            <h1>
              Your little list
              <br />
              of <em>possibilities.</em>
            </h1>
            <p className="page-intro">
              Two perspectives, one adventure. Save separately, find your overlaps, and talk about
              the rest.
            </p>
            <div className="shortlist-summary">
              <div>
                <Heart size={20} />
                <strong>{shortlist.length}</strong>
                <span>on the shortlist</span>
              </div>
              <div>
                <Users size={20} />
                <strong>{bothCount}</strong>
                <span>you both love</span>
              </div>
              <div>
                <Compass size={20} />
                <strong>{state.chosenRoute ? '1' : '0'}</strong>
                <span>starting route</span>
              </div>
              <button className="button button-outline" onClick={() => setShowShare(true)}>
                <Send size={14} />
                Send your latest ideas
              </button>
            </div>
            <div className="shortlist-toolbar">
              <div className="tier-filters">
                {[
                  ['all', 'Everything saved'],
                  ['both', 'We both love it'],
                  ['one', 'One of us loves it'],
                  ['discuss', 'Let’s talk'],
                  ['passed', 'Not this time'],
                ].map(([id, label]) => (
                  <button
                    className={`filter-chip ${shortlistFilter === id ? 'active' : ''}`}
                    onClick={() => setShortlistFilter(id)}
                    key={id}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="voting-as">
                Saving as{' '}
                <select
                  value={activePerson}
                  onChange={(e) => setActivePerson(Number(e.target.value) as 0 | 1)}
                >
                  {names.map((n, i) => (
                    <option value={i} key={i}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {shortlisted.length ? (
              <>
                <div className="shortlist-grid">{shortlisted.map(renderCard)}</div>
                <div className="shortlist-map">
                  <JapanMap
                    experiences={shortlisted}
                    selectedId={mapSelectedId}
                    onSelect={setMapSelectedId}
                    onOpen={setSelectedId}
                    compact
                  />
                </div>
              </>
            ) : (
              <div className="empty-state shortlist-empty">
                <span className="empty-heart">
                  <Heart size={35} />
                </span>
                <h2>
                  {shortlist.length
                    ? 'Your favourites don’t overlap here yet.'
                    : 'Every adventure starts with a little “what if?”'}
                </h2>
                <p>
                  {shortlist.length
                    ? 'Open a place to add each person’s vote, or try another filter.'
                    : 'Tap the heart on a place that catches your eye. Then switch between your names to see what you each love.'}
                </p>
                <button className="button button-dark" onClick={() => go('discover')}>
                  Find your first favourite <ArrowRight size={15} />
                </button>
              </div>
            )}
            <div className="collection-note">
              <Info size={16} />
              <p>
                Your decisions are saved in this browser. Share a snapshot or download your plan to
                take it to another device. Snapshots do not sync automatically.
              </p>
            </div>
          </section>
        )}
        {page === 'profile' && (
          <section className="section-shell inner-page profile-page">
            <div className="eyebrow red-text">THE BEST PLACE TO START</div>
            <h1>
              Not just any trip.
              <br />
              <em>Your kind of trip.</em>
            </h1>
            <p className="page-intro">
              You’re active, curious, food-loving travellers. Here’s the picture you’ve given us so
              far. Change anything as you discover what excites you.
            </p>
            <div className="profile-cards">
              {state.profile.travellers.map((traveller, i) => (
                <section className="traveller-card" key={i}>
                  <div className="traveller-heading">
                    <span className={`large-avatar avatar-${i}`}>{traveller.name[0]}</span>
                    <div>
                      <span className="eyebrow">TRAVELLER 0{i + 1}</span>
                      <label className="sr-only" htmlFor={`name-${i}`}>
                        Traveller {i + 1} name
                      </label>
                      <input
                        id={`name-${i}`}
                        className="name-input"
                        value={traveller.name}
                        maxLength={50}
                        onChange={(e) => {
                          const val = e.target.value;
                          setState((prev) => {
                            const next = structuredClone(prev);
                            next.profile.travellers[i].name = val;
                            return next;
                          });
                        }}
                        onBlur={() => {
                          if (!traveller.name.trim())
                            setState((prev) => {
                              const next = structuredClone(prev);
                              next.profile.travellers[i].name = i ? 'Daniella' : 'Charlie';
                              return next;
                            });
                        }}
                      />
                    </div>
                  </div>
                  <label className="field-label">What draws you in?</label>
                  <div className="interest-chips">
                    {INTERESTS.map((interest) => (
                      <button
                        className={
                          traveller.interests.includes(interest) ? 'interest active' : 'interest'
                        }
                        key={interest}
                        aria-pressed={traveller.interests.includes(interest)}
                        onClick={() =>
                          setState((prev) => {
                            const next = structuredClone(prev),
                              list = next.profile.travellers[i].interests;
                            next.profile.travellers[i].interests = list.includes(interest)
                              ? list.filter((x) => x !== interest)
                              : [...list, interest];
                            return next;
                          })
                        }
                      >
                        {traveller.interests.includes(interest) && <Check size={12} />} {interest}
                      </button>
                    ))}
                  </div>
                  <div className="field-grid">
                    <label>
                      Japan before?
                      <select
                        value={traveller.beenBefore}
                        onChange={(e) =>
                          setState((prev) => {
                            const next = structuredClone(prev);
                            next.profile.travellers[i].beenBefore = e.target.value;
                            return next;
                          })
                        }
                      >
                        <option>Not specified</option>
                        <option>First visit</option>
                        <option>Been before, want to go deeper</option>
                      </select>
                    </label>
                    <label>
                      Your walking pace
                      <select
                        value={traveller.walking}
                        onChange={(e) =>
                          setState((prev) => {
                            const next = structuredClone(prev);
                            next.profile.travellers[i].walking = e.target.value;
                            return next;
                          })
                        }
                      >
                        <option>Active — full days on foot</option>
                        <option>Moderate — breaks between walks</option>
                        <option>Gentle — shorter, easy walks</option>
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    A little more about you
                    <textarea
                      placeholder="A dream experience, favourite food, something you’d rather skip…"
                      value={traveller.notes}
                      maxLength={2000}
                      onChange={(e) =>
                        setState((prev) => {
                          const next = structuredClone(prev);
                          next.profile.travellers[i].notes = e.target.value;
                          return next;
                        })
                      }
                    />
                  </label>
                </section>
              ))}
            </div>
            <section className="shared-profile">
              <div>
                <span className="eyebrow red-text">THE COMMON GROUND</span>
                <h2>Your travel rhythm.</h2>
                <p>Full days. Fewer unnecessary transfers. A few things worth splurging on.</p>
                <span className="auto-saved">
                  <Check size={14} />{' '}
                  {storageError ? 'Download to keep changes' : 'Changes saved on this device'}
                </span>
              </div>
              <div className="shared-fields">
                {(
                  [
                    ['pace', 'Your pace'],
                    ['budget', 'Room budget'],
                    ['hotelMoves', 'Moving between bases'],
                    ['departure', 'Departure preference'],
                    ['splurge', 'Worth a splurge'],
                    ['constraints', 'Dietary, accessibility & other needs'],
                    ['driving', 'Driving'],
                    ['flights', 'Flight booking status'],
                  ] as [keyof Profile, string][]
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      value={state.profile[key] as string}
                      maxLength={500}
                      onChange={(e) => updateProfile(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>
            <div className="date-note">
              <Plane size={18} />
              <p>
                <strong>2–15 November 2026 is the working trip window.</strong> Arrive Tokyo around
                midday; depart Tokyo or Osaka in the evening. Airports and flight bookings are still
                unconfirmed. Route dates stay fixed until you revise the trip window.
              </p>
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          <span className="little-sun" />
          JAPAN, TOGETHER<span>A journey worth taking slowly, even when you’re going far.</span>
        </div>
        <div>
          <button onClick={() => setShowResearch(true)}>Research & sources</button>
          <span>
            Made for {names[0]} & {names[1]}
          </span>
          <span>日本 · NOVEMBER {state.profile.year}</span>
        </div>
      </footer>
      {selected && (
        <Modal title={selected.title} onClose={() => setSelectedId(null)} wide>
          <div className="detail-art">
            <Artwork
              kind={
                selected.category === 'nature'
                  ? selected.region
                  : selected.category === 'food'
                    ? 'food'
                    : selected.region
              }
            />
            <span className={`tier-label tier-${selected.tier}`}>{tierNames[selected.tier]}</span>
            <span className="illustration-label">ORIGINAL TRAVEL ILLUSTRATION</span>
          </div>
          <div className="detail-body">
            <div className="eyebrow red-text">
              {selected.region} · {categoryNames[selected.category]}
            </div>
            <h2>{selected.title}</h2>
            <p className="detail-description">{selected.description}</p>
            <div className="detail-facts">
              <span>
                <Clock3 size={15} />
                {selected.duration}
              </span>
              <span>
                <Footprints size={15} />
                {selected.walking} walking
              </span>
              <span>{selected.cost} · relative spend</span>
            </div>
            {fitReasons(selected, state.profile).length > 0 && (
              <div className="fit-reasons">
                <Sparkles size={15} />
                {fitReasons(selected, state.profile).join(' · ')}
              </div>
            )}
            <div className="detail-columns">
              <div>
                <h4>Why make the time?</h4>
                <p>{selected.whyGo}</p>
                <h4>The other side of the postcard</h4>
                <p>{selected.tradeoff}</p>
              </div>
              <div>
                <h4>
                  <Leaf size={14} /> In November
                </h4>
                <p>{selected.novemberNote}</p>
                <h4>
                  <Clock3 size={14} /> Before you go
                </h4>
                <p>{selected.bookingNote}</p>
              </div>
            </div>
            <div className="voting-box">
              <div className="eyebrow">DOES THIS FEEL LIKE YOU?</div>
              {names.map((name, i) => (
                <div className="vote-row" key={i}>
                  <strong>
                    <span className={`tiny-avatar avatar-${i}`}>{name[0]}</span>
                    {name}
                  </strong>
                  <div>
                    {(['love', 'maybe', 'pass'] as Vote[]).map((v) => (
                      <button
                        key={v}
                        className={`vote-button ${state.votes[selected.id]?.[i] === v ? 'chosen' : ''}`}
                        aria-pressed={state.votes[selected.id]?.[i] === v}
                        onClick={() => vote(selected.id, i as 0 | 1, v)}
                      >
                        {v === 'love' ? (
                          <Heart size={13} />
                        ) : v === 'maybe' ? (
                          <MessageCircle size={13} />
                        ) : (
                          <X size={13} />
                        )}{' '}
                        {v === 'love' ? 'Love it' : v === 'maybe' ? 'Maybe' : 'Pass'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <label className="field-label detail-notes">
              A note for each other
              <textarea
                placeholder="Why this caught your eye, a question to look into, or a nearby lunch…"
                maxLength={2000}
                value={state.notes[selected.id] || ''}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    notes: { ...prev.notes, [selected.id]: e.target.value },
                  }))
                }
              />
            </label>
            <div className="detail-links">
              <a
                className="button button-dark"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.title + ' ' + selected.region + ' Japan')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={14} />
                Google Maps & reviews
                <ExternalLink size={12} />
              </a>
              <a className="text-button" href={selected.sourceUrl} target="_blank" rel="noreferrer">
                {selected.sourceLabel}
                <ExternalLink size={13} />
              </a>
            </div>
            <p className="research-disclaimer">
              <Info size={13} />
              Source link provided for follow-up. Live details have not yet been verified. Map pins
              are approximate planning anchors; illustrations are not site photographs.
            </p>
          </div>
        </Modal>
      )}
      {showShare && !incoming && (
        <Modal
          title="Share your Japan plan"
          onClose={() => {
            setShowShare(false);
            setCopied(false);
          }}
        >
          <div className="share-modal">
            <span className="modal-icon">
              <Send size={26} />
            </span>
            <div className="eyebrow red-text">PASS THE POSSIBILITIES ON</div>
            <h2>
              A trip for two.
              <br />A link to your ideas.
            </h2>
            <p>
              Send a snapshot of your profiles, votes, notes and chosen route. The other person can
              open it, make decisions, and send an updated snapshot back.
            </p>
            <div className="share-explainer">
              <Info size={17} />
              <span>
                Snapshots do not sync automatically. Anyone with the link can read this plan. Keep
                the latest version together.
              </span>
            </div>
            {sharePayload.error && (
              <p role="alert">{sharePayload.error} Download the plan instead.</p>
            )}
            <label className="field-label">
              Your share link
              <input
                readOnly
                value={shareUrl()}
                onFocus={(e) => e.target.select()}
                aria-label="Your share link"
              />
            </label>
            <button
              className="button button-dark full-width"
              disabled={!sharePayload.url}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl());
                  setCopied(true);
                } catch {
                  setNotice('Select the link above and copy it manually.');
                }
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
              {copied ? 'Link copied' : 'Copy share link'}
            </button>
            {['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname) && (
              <p className="micro-copy">
                This is a local development address. Publish the app to a web host before sending
                links to another device, or exchange a downloaded plan file.
              </p>
            )}
            <div className="share-file-actions">
              <button className="text-button" onClick={() => downloadPlan(state)}>
                <Download size={14} />
                Download plan
              </button>
              <button className="text-button" onClick={() => uploadRef.current?.click()}>
                <ArrowRight size={14} />
                Open plan file
              </button>
            </div>
          </div>
        </Modal>
      )}
      {incoming && (
        <Modal
          title="Open a shared Japan plan"
          onClose={() => {
            setIncoming(null);
            history.replaceState(null, '', location.pathname + location.search);
          }}
        >
          <div className="share-modal">
            <span className="modal-icon">
              <Users size={26} />
            </span>
            <h2>A new set of possibilities.</h2>
            <p>
              This shared plan is for{' '}
              <strong>{incoming.profile.travellers.map((t) => t.name).join(' & ')}</strong>. Opening
              it replaces the plan currently saved on this device. Download your current plan first
              if you want to keep both.
            </p>
            <button className="text-button" onClick={() => downloadPlan(state)}>
              <Download size={14} />
              Download current plan
            </button>
            <button
              className="button button-dark full-width"
              onClick={() => {
                setState(incoming);
                setIncoming(null);
                history.replaceState(null, '', location.pathname + location.search);
                setShowShare(false);
                setNotice('Shared plan opened. Your changes now save on this device.');
              }}
            >
              Open shared plan <ArrowRight size={14} />
            </button>
            <button
              className="text-button"
              onClick={() => {
                setIncoming(null);
                history.replaceState(null, '', location.pathname + location.search);
              }}
            >
              Keep my current plan
            </button>
          </div>
        </Modal>
      )}
      {showResearch && (
        <Modal title="Research and sources" onClose={() => setShowResearch(false)}>
          <div className="research-modal">
            <span className="eyebrow red-text">A CONSIDERED STARTING POINT</span>
            <h2>Curiosity, with context.</h2>
            <p>
              This collection brings together {experiences.length} candidate experiences and three
              route outlines around your interests. It is a research draft, built from general
              destination knowledge.
            </p>
            <div className="research-status">
              <span className="status-dot" />
              <strong>Live source verification pending</strong>
            </div>
            <p>
              The research environment currently blocks tourism websites. Opening days, 2026 events,
              transport schedules, availability and prices have not been checked live. Each place
              includes a source link so you can follow up; a link is not a claim that its current
              contents have been verified.
            </p>
            <h4>What the labels mean</h4>
            <dl>
              <dt>The classics</dt>
              <dd>Defining experiences, with ideas for choosing the right moment.</dd>
              <dt>A little quieter</dt>
              <dd>
                Alternatives with character and a practical place in the trip. Quiet is relative;
                none are claimed to be undiscovered.
              </dd>
              <dt>Worth the detour</dt>
              <dd>
                Places that need a deliberate route choice, overnight stay or extra transport.
              </dd>
            </dl>
            <h4>What to check before booking</h4>
            <ul>
              <li>Culture Day on 3 November, venue closing days and reservation releases.</li>
              <li>Trail conditions, daylight, ferry times and luggage logistics.</li>
              <li>Actual hotel prices against your £100–£150 nightly room target.</li>
              <li>
                Autumn colour forecasts closer to the trip; peak dates vary by altitude and year.
              </li>
              <li>Your exact arrival and departure airports and final train connections.</li>
            </ul>
            <p>
              Google ratings are not imported. Google Maps links let you read current reviews
              directly. The map uses Natural Earth geography, with approximate experience pins and
              schematic route lines.
            </p>
            <p className="micro-copy">
              Working dates: 2–15 November 2026. Research draft prepared 30 September 2026. Your
              stated constraints: none reported. Unanswered details remain marked as unspecified.
            </p>
          </div>
        </Modal>
      )}
      <input
        type="file"
        ref={uploadRef}
        accept="application/json,.json"
        className="sr-only"
        aria-label="Open a saved Japan plan"
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {notice && (
        <div className="toast" role="status">
          <Info size={16} />
          {notice}
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
