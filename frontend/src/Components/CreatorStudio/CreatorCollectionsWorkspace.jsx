import { useEffect, useMemo, useState } from 'react';
import {
  FaArrowLeft,
  FaBookOpen,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaChevronUp,
  FaEllipsisH,
  FaEye,
  FaFolderOpen,
  FaGlobeAfrica,
  FaImage,
  FaLayerGroup,
  FaListOl,
  FaLock,
  FaMusic,
  FaPlus,
  FaSearch,
  FaTrash,
} from 'react-icons/fa';

import playlistService from '../../services/playlistService.js';
import { buildMediaUrl } from '../../services/api.js';
import { buildGeneratedAudioCoverUrl } from '../../audioCover/audioCover.js';
import './CreatorCollectionsWorkspace.css';

const COLLECTION_META_KEY = 'echooCreatorCollectionMeta';
const EMPTY_FORM = {
  name: '',
  description: '',
  mode: 'playlist',
  isPublic: true,
};

const readMeta = () => {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_META_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeMeta = (id, value) => {
  const current = readMeta();
  localStorage.setItem(COLLECTION_META_KEY, JSON.stringify({ ...current, [id]: value }));
};

const getId = (item) => item?.id || item?._id || null;

const getTrackId = (track) => getId(track);

const getCover = (collection, studioName) =>
  buildMediaUrl(collection?.coverArt || collection?.artwork || collection?.image || null) ||
  collection?.tracks?.[0]?.coverArt ||
  buildGeneratedAudioCoverUrl({
    title: collection?.name || 'Echoo Collection',
    artistName: studioName,
    genre: collection?.mode === 'series' ? 'Series' : 'Playlist',
  });

const formatDuration = (value) => {
  const seconds = Number(value) || 0;
  if (!seconds) return '0 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const formatDate = (value) => {
  if (!value) return 'Not published yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not published yet';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const mergeMeta = (collection, meta) => ({
  ...collection,
  ...(meta[String(getId(collection))] || {}),
  tracks: Array.isArray(collection.tracks) ? collection.tracks : [],
});

const getTrackLabel = (track) => track?.title || 'Untitled audio';

const CreatorCollectionsWorkspace = ({ tracks = [], studioName = 'Echoo Creator', onChanged }) => {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [view, setView] = useState('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [activeSeasonId, setActiveSeasonId] = useState('season-1');
  const [seasonMenuOpen, setSeasonMenuOpen] = useState('');

  const loadCollections = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await playlistService.getMine();
      const meta = readMeta();
      const data = Array.isArray(response?.data) ? response.data.map((item) => mergeMeta(item, meta)) : [];
      setCollections(data);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load your collections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);

  const filteredCollections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return collections.filter((collection) => {
      const matchesSearch =
        !query ||
        String(collection.name || '').toLowerCase().includes(query) ||
        String(collection.description || '').toLowerCase().includes(query);
      const mode = collection.mode === 'series' ? 'Series' : 'Playlist';
      return matchesSearch && (typeFilter === 'All' || typeFilter === mode);
    });
  }, [collections, search, typeFilter]);

  const totalItems = collections.reduce((sum, collection) => sum + (collection.tracks?.length || 0), 0);
  const seriesCount = collections.filter((collection) => collection.mode === 'series').length;

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const closeComposer = () => {
    if (saving) return;
    setComposerOpen(false);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setError('');
    setNotice('');
    setForm(EMPTY_FORM);
    setComposerOpen(true);
  };

  const selectCollection = (collection) => {
    setSelectedCollection(collection);
    setActiveSeasonId(collection.seasons?.[0]?.id || 'season-1');
    setSeasonMenuOpen('');
    setView('detail');
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || saving) return;

    try {
      setSaving(true);
      setError('');
      const initialSeasons = form.mode === 'series' ? [{ id: 'season-1', name: 'Season 1', trackIds: [] }] : [];
      const response = await playlistService.create({
        name,
        description: form.description.trim(),
        mode: form.mode,
        seasons: initialSeasons,
        isPublic: form.isPublic,
      });
      const created = response?.data || {
        id: `local-${Date.now()}`,
        name,
        description: form.description.trim(),
        isPublic: form.isPublic,
        tracks: [],
        trackCount: 0,
      };
      const collection = {
        ...created,
        mode: form.mode,
        seasons: initialSeasons,
        tracks: Array.isArray(created.tracks) ? created.tracks : [],
      };
      writeMeta(getId(collection), { mode: form.mode, seasons: collection.seasons });
      setCollections((current) => [collection, ...current]);
      setSelectedCollection(collection);
      setView('detail');
      setComposerOpen(false);
      setForm(EMPTY_FORM);
      setNotice(`${form.mode === 'series' ? 'Series' : 'Playlist'} created.`);
      onChanged?.();
    } catch (createError) {
      setError(createError?.message || 'Could not create this collection.');
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = (nextCollection) => {
    setSelectedCollection(nextCollection);
    setCollections((current) => current.map((item) => (String(getId(item)) === String(getId(nextCollection)) ? nextCollection : item)));
  };

  const toggleTrack = (trackId) => {
    setSelectedTrackIds((current) => current.includes(trackId) ? current.filter((id) => id !== trackId) : [...current, trackId]);
  };

  const openAddContent = () => {
    setSelectedTrackIds([]);
    setError('');
    setAddContentOpen(true);
  };

  const handleAddContent = async () => {
    if (!selectedCollection || !selectedTrackIds.length || saving) return;
    try {
      setSaving(true);
      setError('');
      const collectionId = getId(selectedCollection);
      let nextCollection = { ...selectedCollection };
      for (const trackId of selectedTrackIds) {
        if (!String(collectionId).startsWith('local-')) {
          const response = await playlistService.addTrack(collectionId, trackId);
          if (response?.data) nextCollection = mergeMeta(response.data, readMeta());
        } else {
          const track = tracks.find((item) => String(getTrackId(item)) === String(trackId));
          nextCollection.tracks = [...(nextCollection.tracks || []), track].filter(Boolean);
        }
      }
      if (selectedCollection.mode === 'series') {
        const seasons = [...(nextCollection.seasons || [{ id: 'season-1', name: 'Season 1', trackIds: [] }])];
        const seasonIndex = Math.max(0, seasons.findIndex((season) => season.id === activeSeasonId));
        seasons[seasonIndex] = {
          ...seasons[seasonIndex],
          trackIds: [...new Set([...(seasons[seasonIndex].trackIds || []), ...selectedTrackIds])],
        };
        nextCollection = { ...nextCollection, seasons };
        writeMeta(collectionId, { mode: 'series', seasons });
        if (!String(collectionId).startsWith('local-')) {
          const response = await playlistService.update(collectionId, { mode: 'series', seasons });
          if (response?.data) nextCollection = { ...nextCollection, ...response.data, seasons };
        }
      }
      updateSelected(nextCollection);
      setAddContentOpen(false);
      setSelectedTrackIds([]);
      setNotice(`${selectedTrackIds.length} ${selectedTrackIds.length === 1 ? 'item was' : 'items were'} added.`);
      onChanged?.();
    } catch (addError) {
      setError(addError?.message || 'Could not add content to this collection.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTrack = async (trackId) => {
    if (!selectedCollection || saving) return;
    try {
      setSaving(true);
      setError('');
      const collectionId = getId(selectedCollection);
      let nextCollection = { ...selectedCollection };
      if (!String(collectionId).startsWith('local-')) {
        const response = await playlistService.removeTrack(collectionId, trackId);
        if (response?.data) nextCollection = mergeMeta(response.data, readMeta());
      } else {
        nextCollection.tracks = (nextCollection.tracks || []).filter((track) => String(getTrackId(track)) !== String(trackId));
      }
      if (selectedCollection.mode === 'series') {
        const seasons = (nextCollection.seasons || []).map((season) => ({
          ...season,
          trackIds: (season.trackIds || []).filter((id) => String(id) !== String(trackId)),
        }));
        nextCollection = { ...nextCollection, seasons };
        writeMeta(collectionId, { mode: 'series', seasons });
        if (!String(collectionId).startsWith('local-')) {
          const response = await playlistService.update(collectionId, { mode: 'series', seasons });
          if (response?.data) nextCollection = { ...nextCollection, ...response.data, seasons };
        }
      }
      updateSelected(nextCollection);
      setNotice('Content removed from the collection.');
      onChanged?.();
    } catch (removeError) {
      setError(removeError?.message || 'Could not remove this content.');
    } finally {
      setSaving(false);
    }
  };

  const handleMoveTrack = async (index, direction) => {
    if (!selectedCollection || saving) return;
    const currentTracks = [...(selectedCollection.tracks || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentTracks.length) return;
    [currentTracks[index], currentTracks[targetIndex]] = [currentTracks[targetIndex], currentTracks[index]];
    const nextCollection = { ...selectedCollection, tracks: currentTracks };
    try {
      setSaving(true);
      if (!String(getId(selectedCollection)).startsWith('local-')) {
        await playlistService.reorder(getId(selectedCollection), currentTracks.map(getTrackId));
      }
      if (selectedCollection.mode === 'series') {
        const seasons = (selectedCollection.seasons || []).map((season) => ({
          ...season,
          trackIds: currentTracks.filter((track) => (season.trackIds || []).includes(getTrackId(track))).map(getTrackId),
        }));
        nextCollection.seasons = seasons;
        writeMeta(getId(selectedCollection), { mode: 'series', seasons });
        if (!String(getId(selectedCollection)).startsWith('local-')) {
          const response = await playlistService.update(getId(selectedCollection), { mode: 'series', seasons });
          if (response?.data) Object.assign(nextCollection, response.data, { seasons });
        }
      }
      updateSelected(nextCollection);
    } catch (reorderError) {
      setError(reorderError?.message || 'Could not reorder this collection.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSeason = async () => {
    if (!selectedCollection || selectedCollection.mode !== 'series' || saving) return;
    const seasons = [...(selectedCollection.seasons || [])];
    const nextSeason = { id: `season-${Date.now()}`, name: `Season ${seasons.length + 1}`, trackIds: [] };
    const nextSeasons = [...seasons, nextSeason];
    const nextCollection = { ...selectedCollection, seasons: nextSeasons };
    try {
      setSaving(true);
      if (!String(getId(selectedCollection)).startsWith('local-')) {
        const response = await playlistService.update(getId(selectedCollection), { mode: 'series', seasons: nextSeasons });
        if (response?.data) Object.assign(nextCollection, response.data, { seasons: nextSeasons });
      }
      writeMeta(getId(selectedCollection), { mode: 'series', seasons: nextSeasons });
      updateSelected(nextCollection);
      setActiveSeasonId(nextSeason.id);
    } catch (seasonError) {
      setError(seasonError?.message || 'Could not add this season.');
    } finally {
      setSaving(false);
    }
  };

  const handleRenameSeason = async (season) => {
    const name = window.prompt('Season name', season.name);
    if (!name?.trim() || !selectedCollection || saving) return;
    const seasons = (selectedCollection.seasons || []).map((item) => item.id === season.id ? { ...item, name: name.trim() } : item);
    const nextCollection = { ...selectedCollection, seasons };
    try {
      setSaving(true);
      if (!String(getId(selectedCollection)).startsWith('local-')) {
        const response = await playlistService.update(getId(selectedCollection), { mode: 'series', seasons });
        if (response?.data) Object.assign(nextCollection, response.data, { seasons });
      }
      writeMeta(getId(selectedCollection), { mode: 'series', seasons });
      updateSelected(nextCollection);
      setSeasonMenuOpen('');
    } catch (seasonError) {
      setError(seasonError?.message || 'Could not rename this season.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!selectedCollection || saving || !window.confirm(`Delete “${selectedCollection.name}”?`)) return;
    try {
      setSaving(true);
      const id = getId(selectedCollection);
      if (!String(id).startsWith('local-')) await playlistService.delete(id);
      setCollections((current) => current.filter((item) => String(getId(item)) !== String(id)));
      setSelectedCollection(null);
      setView('list');
      setNotice('Collection deleted.');
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this collection.');
    } finally {
      setSaving(false);
    }
  };

  const renderCollectionCover = (collection, sizeClass = '') => (
    <div className={`ecc-cover ${sizeClass}`}>
      <img src={getCover(collection, studioName)} alt="" />
      <span><FaMusic /></span>
    </div>
  );

  const renderHeader = () => (
    <header className="ecc-header">
      <div>
        <span className="ecc-kicker">CREATOR LIBRARY</span>
        <h1>Give your <em>audio</em> a home.</h1>
        <p>Group teachings, sermons, and recordings into collections your listeners can return to.</p>
      </div>
      <button type="button" className="ecc-primary-button" onClick={openCreate}><FaPlus /> Create collection</button>
    </header>
  );

  const renderList = () => (
    <section className="ecc-list-view">
      {renderHeader()}

      <section className="ecc-guide-grid" aria-label="Collection formats">
        <article className="ecc-guide-card playlist-guide">
          <div className="ecc-guide-icon"><FaFolderOpen /></div>
          <div><strong>Playlist</strong><p>A flexible folder for related audio that can be enjoyed in any order.</p></div>
          <span className="ecc-guide-link">Best for collections <FaChevronRight /></span>
        </article>
        <article className="ecc-guide-card series-guide">
          <div className="ecc-guide-icon"><FaBookOpen /></div>
          <div><strong>Series</strong><p>A guided teaching journey organized into seasons and episodes.</p></div>
          <span className="ecc-guide-link">Best for teaching <FaChevronRight /></span>
        </article>
      </section>

      <section className="ecc-summary">
        <div><i className="blue"><FaLayerGroup /></i><span><small>Collections</small><strong>{collections.length}</strong><em>Playlists and series</em></span></div>
        <div><i className="green"><FaMusic /></i><span><small>Organized audio</small><strong>{totalItems}</strong><em>Across your collections</em></span></div>
        <div><i className="purple"><FaBookOpen /></i><span><small>Teaching series</small><strong>{seriesCount}</strong><em>{seriesCount ? 'Ready to continue' : 'None created yet'}</em></span></div>
      </section>

      <section className="ecc-library">
        <div className="ecc-library-heading">
          <div><h2>Your collections</h2><span>{collections.length} {collections.length === 1 ? 'collection' : 'collections'}</span></div>
          <div className="ecc-toolbar">
            <label className="ecc-search"><FaSearch /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search collections..." aria-label="Search collections" /></label>
            <div className="ecc-filter-tabs" aria-label="Filter collections by type">
              {['All', 'Playlist', 'Series'].map((item) => <button type="button" key={item} className={typeFilter === item ? 'active' : ''} onClick={() => setTypeFilter(item)}>{item}</button>)}
            </div>
          </div>
        </div>

        {loading ? <div className="ecc-loading"><span /><span /><span /></div> : filteredCollections.length === 0 ? (
          <div className="ecc-empty">
            <div className="ecc-empty-icon"><FaFolderOpen /></div>
            <h2>{collections.length ? 'No matching collections' : 'Start with a collection'}</h2>
            <p>{collections.length ? 'Try another search or filter.' : 'Create “Back to Faith” or another home for your related audio.'}</p>
            {!collections.length && <button type="button" className="ecc-primary-button" onClick={openCreate}><FaPlus /> Create collection</button>}
          </div>
        ) : (
          <div className="ecc-collection-grid">
            {filteredCollections.map((collection) => {
              const isSeries = collection.mode === 'series';
              return (
                <article key={getId(collection)} className="ecc-collection-card" onClick={() => selectCollection(collection)}>
                  {renderCollectionCover(collection)}
                  <div className="ecc-card-copy">
                    <div className="ecc-card-topline"><span className={`ecc-type-badge ${isSeries ? 'series' : 'playlist'}`}>{isSeries ? <FaBookOpen /> : <FaFolderOpen />} {isSeries ? 'Series' : 'Playlist'}</span><button type="button" className="ecc-icon-button" onClick={(event) => { event.stopPropagation(); selectCollection(collection); }} aria-label={`Open ${collection.name}`}><FaEllipsisH /></button></div>
                    <h3>{collection.name}</h3>
                    <p>{collection.description || 'No description added yet.'}</p>
                    <div className="ecc-card-meta"><span><FaMusic /> {collection.tracks?.length || 0} items</span><span>{collection.isPublic ? <><FaGlobeAfrica /> Public</> : <><FaLock /> Private</>}</span></div>
                    <div className="ecc-card-footer"><span>Updated {formatDate(collection.updatedAt || collection.createdAt)}</span><span className="ecc-open-link">Manage <FaChevronRight /></span></div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );

  const activeSeason = selectedCollection?.seasons?.find((season) => season.id === activeSeasonId) || selectedCollection?.seasons?.[0];
  const activeSeasonTrackIds = activeSeason?.trackIds || [];
  const visibleTracks = selectedCollection?.mode === 'series' && activeSeason ? (selectedCollection.tracks || []).filter((track) => activeSeasonTrackIds.includes(getTrackId(track))) : (selectedCollection?.tracks || []);

  const renderDetail = () => {
    if (!selectedCollection) return renderList();
    const isSeries = selectedCollection.mode === 'series';
    return (
      <section className="ecc-detail-view">
        <div className="ecc-detail-topbar"><button type="button" className="ecc-back-button" onClick={() => setView('list')}><FaArrowLeft /> Back to collections</button><button type="button" className="ecc-preview-button"><FaEye /> Preview as listener</button></div>
        <section className="ecc-detail-hero">
          {renderCollectionCover(selectedCollection, 'large')}
          <div className="ecc-detail-copy"><div className="ecc-card-topline"><span className={`ecc-type-badge ${isSeries ? 'series' : 'playlist'}`}>{isSeries ? <FaBookOpen /> : <FaFolderOpen />} {isSeries ? 'Series' : 'Playlist'}</span><span className="ecc-visibility">{selectedCollection.isPublic ? <><FaGlobeAfrica /> Public</> : <><FaLock /> Private</>}</span></div><h1>{selectedCollection.name}</h1><p>{selectedCollection.description || 'Add a short description to tell listeners what they will find here.'}</p><div className="ecc-detail-stats"><span><strong>{selectedCollection.tracks?.length || 0}</strong> items</span><span><strong>{formatDuration((selectedCollection.tracks || []).reduce((sum, track) => sum + (Number(track.duration) || 0), 0))}</strong> total</span><span>Updated {formatDate(selectedCollection.updatedAt || selectedCollection.createdAt)}</span></div></div>
          <div className="ecc-detail-actions"><button type="button" className="ecc-secondary-button"><FaImage /> Edit details</button><button type="button" className="ecc-primary-button" onClick={openAddContent}><FaPlus /> Add content</button></div>
        </section>

        <section className="ecc-content-panel">
          <div className="ecc-panel-heading"><div><span className="ecc-kicker">{isSeries ? 'STRUCTURED CONTENT' : 'FLEXIBLE CONTENT'}</span><h2>{isSeries ? 'Build your teaching journey' : 'Arrange your playlist'}</h2><p>{isSeries ? 'Add seasons and place each teaching where it belongs.' : 'Listeners can play these items in the order you choose.'}</p></div><span className="ecc-panel-count">{selectedCollection.tracks?.length || 0} items</span></div>

          {isSeries && <div className="ecc-season-tabs"><div className="ecc-season-tab-list">{(selectedCollection.seasons || []).map((season) => <div className={`ecc-season-tab ${activeSeason?.id === season.id ? 'active' : ''}`} key={season.id}><button type="button" onClick={() => setActiveSeasonId(season.id)}><span>{season.name}</span><small>{season.trackIds?.length || 0} episodes</small></button><button type="button" className="ecc-season-menu-trigger" onClick={() => setSeasonMenuOpen((current) => current === season.id ? '' : season.id)} aria-label={`Options for ${season.name}`}><FaChevronDown /></button>{seasonMenuOpen === season.id && <div className="ecc-season-menu"><button type="button" onClick={() => handleRenameSeason(season)}>Rename season</button></div>}</div>)}</div><button type="button" className="ecc-add-season" onClick={handleAddSeason}><FaPlus /> Add season</button></div>}

          {visibleTracks.length === 0 ? <div className="ecc-content-empty"><div className="ecc-empty-icon"><FaMusic /></div><h3>{isSeries ? 'This season is ready for its first episode' : 'Your playlist is ready for content'}</h3><p>Choose audio from your library and add it here.</p><button type="button" className="ecc-primary-button" onClick={openAddContent}><FaPlus /> Add content</button></div> : <div className="ecc-track-list">{visibleTracks.map((track, index) => <article className="ecc-track-row" key={getTrackId(track) || `${track.title}-${index}`}><span className="ecc-drag-handle" aria-hidden="true">••<br />••</span><span className="ecc-track-number">{String(index + 1).padStart(2, '0')}</span><div className="ecc-track-art"><img src={track.coverArt || buildGeneratedAudioCoverUrl({ title: track.title, artistName: studioName, genre: track.genre })} alt="" /></div><div className="ecc-track-copy"><strong>{getTrackLabel(track)}</strong><span>{track.genre || 'Audio'} · {track.duration ? formatDuration(track.duration) : 'Audio recording'}</span></div><div className="ecc-track-actions"><button type="button" onClick={() => handleMoveTrack((selectedCollection.tracks || []).findIndex((item) => String(getTrackId(item)) === String(getTrackId(track))), -1)} disabled={index === 0 || saving} aria-label="Move item up"><FaChevronUp /></button><button type="button" onClick={() => handleMoveTrack((selectedCollection.tracks || []).findIndex((item) => String(getTrackId(item)) === String(getTrackId(track))), 1)} disabled={index === visibleTracks.length - 1 || saving} aria-label="Move item down"><FaChevronDown /></button><button type="button" className="remove" onClick={() => handleRemoveTrack(getTrackId(track))} disabled={saving} aria-label={`Remove ${getTrackLabel(track)}`}><FaTrash /></button></div></article>)}</div>}
        </section>
        <div className="ecc-detail-footer"><span><FaListOl /> {isSeries ? 'Episodes stay organized inside their season.' : 'Drag order is the order listeners will hear.'}</span><button type="button" className="ecc-danger-button" onClick={handleDeleteCollection}><FaTrash /> Delete collection</button></div>
      </section>
    );
  };

  const availableTracks = tracks.filter((track) => !selectedCollection?.tracks?.some((item) => String(getTrackId(item)) === String(getTrackId(track))));

  return (
    <section className="ecc">
      {error && <div className="ecc-inline-alert error"><span>{error}</span><button type="button" onClick={() => setError('')}>Dismiss</button></div>}
      {notice && <div className="ecc-inline-alert success"><FaCheck /><span>{notice}</span><button type="button" onClick={() => setNotice('')}>Dismiss</button></div>}
      {view === 'detail' ? renderDetail() : renderList()}

      {composerOpen && <div className="ecc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}><form className="ecc-modal ecc-create-modal" onSubmit={handleCreate}><div className="ecc-modal-heading"><div><span className="ecc-kicker">NEW COLLECTION</span><h2>Create a home for your audio</h2><p>Give the collection a clear name. Your individual recordings keep their own titles.</p></div><button type="button" className="ecc-modal-close" onClick={closeComposer} aria-label="Close">×</button></div><div className="ecc-form-field"><label htmlFor="collection-name">Collection name</label><input id="collection-name" value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Back to Faith" maxLength={100} autoFocus required /><small>This is the main title listeners will see.</small></div><div className="ecc-form-field"><label htmlFor="collection-description">Description <span>Optional</span></label><textarea id="collection-description" value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Teachings and audio messages about returning to faith." maxLength={500} rows={3} /></div><fieldset className="ecc-format-field"><legend>How do you want to organize it?</legend><label className={`ecc-format-option ${form.mode === 'playlist' ? 'selected' : ''}`}><input type="radio" name="collection-mode" value="playlist" checked={form.mode === 'playlist'} onChange={(event) => updateForm('mode', event.target.value)} /><span className="ecc-format-symbol"><FaFolderOpen /></span><span><strong>Playlist</strong><small>Flexible folder · Any order</small></span>{form.mode === 'playlist' && <FaCheck className="ecc-format-check" />}</label><label className={`ecc-format-option ${form.mode === 'series' ? 'selected' : ''}`}><input type="radio" name="collection-mode" value="series" checked={form.mode === 'series'} onChange={(event) => updateForm('mode', event.target.value)} /><span className="ecc-format-symbol series"><FaBookOpen /></span><span><strong>Series</strong><small>Seasons and episodes · Guided order</small></span>{form.mode === 'series' && <FaCheck className="ecc-format-check" />}</label></fieldset><label className="ecc-public-toggle"><input type="checkbox" checked={form.isPublic} onChange={(event) => updateForm('isPublic', event.target.checked)} /><span><strong>Make this collection public</strong><small>Listeners can find it on your creator page.</small></span></label><div className="ecc-modal-actions"><button type="button" className="ecc-secondary-button" onClick={closeComposer} disabled={saving}>Cancel</button><button type="submit" className="ecc-primary-button" disabled={saving || !form.name.trim()}>{saving ? 'Creating...' : 'Create collection'}</button></div></form></div>}

      {addContentOpen && <div className="ecc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddContentOpen(false); }}><div className="ecc-modal ecc-add-modal"><div className="ecc-modal-heading"><div><span className="ecc-kicker">ADD CONTENT</span><h2>Add to {selectedCollection?.name}</h2><p>{selectedCollection?.mode === 'series' ? `These will be added to ${activeSeason?.name || 'the current season'}.` : 'Choose recordings from your audio library.'}</p></div><button type="button" className="ecc-modal-close" onClick={() => setAddContentOpen(false)} aria-label="Close">×</button></div><label className="ecc-search modal-search"><FaSearch /><input placeholder="Search your audio..." onChange={(event) => setSearch(event.target.value)} aria-label="Search audio" /></label><div className="ecc-add-list">{availableTracks.length === 0 ? <div className="ecc-modal-empty"><FaMusic /><p>Everything in your audio library is already here.</p></div> : availableTracks.filter((track) => !search.trim() || getTrackLabel(track).toLowerCase().includes(search.trim().toLowerCase())).map((track) => { const id = getTrackId(track); const checked = selectedTrackIds.includes(id); return <label className={`ecc-add-row ${checked ? 'selected' : ''}`} key={id || track.title}><input type="checkbox" checked={checked} onChange={() => toggleTrack(id)} /><span className="ecc-add-check">{checked && <FaCheck />}</span><div className="ecc-track-art small"><img src={track.coverArt || buildGeneratedAudioCoverUrl({ title: track.title, artistName: studioName, genre: track.genre })} alt="" /></div><span className="ecc-add-copy"><strong>{getTrackLabel(track)}</strong><small>{track.genre || 'Audio'} · {track.duration ? formatDuration(track.duration) : 'Audio recording'}</small></span></label>})}</div><div className="ecc-modal-actions"><span className="ecc-selected-count">{selectedTrackIds.length} selected</span><button type="button" className="ecc-secondary-button" onClick={() => setAddContentOpen(false)} disabled={saving}>Cancel</button><button type="button" className="ecc-primary-button" onClick={handleAddContent} disabled={saving || !selectedTrackIds.length}>{saving ? 'Adding...' : 'Add selected'}</button></div></div></div>}
    </section>
  );
};

export default CreatorCollectionsWorkspace;
