import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiArrowLeft, FiChevronDown, FiChevronUp, FiEdit2, FiFolder, FiPlus, FiTrash2, FiX } from 'react-icons/fi';

import batch2Service from '../../services/batch2Service.js';
import collectionService from '../../services/collectionService.js';
import studioService from '../../services/studioService.js';
import { buildMediaUrl } from '../../services/api.js';
import { buildGeneratedAudioCoverUrl } from '../../audioCover/audioCover.js';
import './CreatorCollectionWorkspace.css';

const idOf = (value) => value?.id || value?._id || value || '';

const artworkFor = (recording, studioName) => buildMediaUrl(recording?.coverArt || recording?.artwork || null)
  || buildGeneratedAudioCoverUrl({ title: recording?.title || 'Echoo recording', artistName: studioName, genre: recording?.genre || 'Recording' });

const duration = (value) => {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
};

const EMPTY_FORM = { title: '', description: '', stationId: '', isPublic: true };

export default function CreatorCollectionWorkspace({ collectionId = '', studioName = 'Echoo Creator', onOpenCollection, onBack }) {
  const [collections, setCollections] = useState([]);
  const [stations, setStations] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedRecordingIds, setSelectedRecordingIds] = useState([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [collectionResult, stationResult, contentResult] = await Promise.all([
        collectionService.getMine(),
        batch2Service.getMyStations(),
        studioService.getContent({ limit: 100 }),
      ]);
      setCollections(collectionResult?.data || []);
      const nextStations = stationResult?.data || [];
      setStations(nextStations);
      setRecordings(contentResult?.data?.tracks || []);
    } catch (loadError) {
      setError(loadError?.message || 'Could not load Collections.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    if (!collectionId) {
      setSelected(null);
      return () => { active = false; };
    }
    collectionService.getById(collectionId)
      .then((response) => { if (active) setSelected(response?.data || null); })
      .catch((loadError) => { if (active) setError(loadError?.message || 'Could not load this Collection.'); });
    return () => { active = false; };
  }, [collectionId]);

  const announce = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  };

  const openCreate = () => {
    if (!stations.length) {
      setError('Create a Channel before creating a Collection.');
      return;
    }
    setEditing(false);
    setForm({ ...EMPTY_FORM, stationId: idOf(stations[0]) });
    setFormOpen(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setEditing(true);
    setForm({ title: selected.title || '', description: selected.description || '', stationId: selected.stationId || '', isPublic: selected.isPublic !== false });
    setFormOpen(true);
  };

  const submitForm = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || busy) return;
    try {
      setBusy(true);
      setError('');
      const response = editing
        ? await collectionService.update(selected.id, { title: form.title.trim(), description: form.description.trim(), isPublic: form.isPublic })
        : await collectionService.create({ ...form, title: form.title.trim(), description: form.description.trim() });
      const updated = response?.data;
      setFormOpen(false);
      announce(editing ? 'Collection updated.' : 'Collection created.');
      await load();
      if (updated?.id) onOpenCollection?.(updated.id);
    } catch (submitError) {
      setError(submitError?.message || 'Could not save this Collection.');
    } finally {
      setBusy(false);
    }
  };

  const deleteCollection = async () => {
    if (!selected || busy || !window.confirm(`Delete “${selected.title}”? Recordings will not be deleted.`)) return;
    try {
      setBusy(true);
      await collectionService.delete(selected.id);
      announce('Collection deleted.');
      onBack?.();
      await load();
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this Collection.');
    } finally {
      setBusy(false);
    }
  };

  const availableRecordings = useMemo(() => {
    const inCollection = new Set((selected?.recordings || []).map(idOf));
    return recordings.filter((recording) => !inCollection.has(idOf(recording)));
  }, [recordings, selected]);

  const openAddRecordings = () => {
    const pending = sessionStorage.getItem('echooAddRecordingToCollection');
    setSelectedRecordingIds(pending && availableRecordings.some((recording) => idOf(recording) === pending) ? [pending] : []);
    sessionStorage.removeItem('echooAddRecordingToCollection');
    setAddOpen(true);
  };

  const addRecordings = async () => {
    if (!selected || !selectedRecordingIds.length || busy) return;
    try {
      setBusy(true);
      const response = await collectionService.addRecordings(selected.id, selectedRecordingIds);
      setSelected(response?.data || selected);
      setAddOpen(false);
      announce(selectedRecordingIds.length === 1 ? 'Recording added to Collection.' : 'Recordings added to Collection.');
      await load();
    } catch (addError) {
      setError(addError?.message || 'Could not add recordings.');
    } finally {
      setBusy(false);
    }
  };

  const removeRecording = async (recordingId) => {
    if (!selected || busy) return;
    try {
      setBusy(true);
      const response = await collectionService.removeRecording(selected.id, recordingId);
      setSelected(response?.data || selected);
      announce('Recording removed from Collection.');
      await load();
    } catch (removeError) {
      setError(removeError?.message || 'Could not remove this recording.');
    } finally {
      setBusy(false);
    }
  };

  const moveRecording = async (index, direction) => {
    if (!selected || busy) return;
    const reordered = [...selected.recordings];
    const next = index + direction;
    if (next < 0 || next >= reordered.length) return;
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    try {
      setBusy(true);
      const response = await collectionService.reorder(selected.id, reordered.map(idOf));
      setSelected(response?.data || { ...selected, recordings: reordered });
    } catch (moveError) {
      setError(moveError?.message || 'Could not reorder this Collection.');
    } finally {
      setBusy(false);
    }
  };

  if (selected) {
    return (
      <section className="creator-collections-page">
        <div className="creator-collections-heading">
          <button className="creator-collections-back" type="button" onClick={onBack}><FiArrowLeft /> Collections</button>
          <div className="creator-collections-heading-actions"><button type="button" className="creator-collections-button secondary" onClick={openEdit}><FiEdit2 /> Edit</button><button type="button" className="creator-collections-icon danger" aria-label="Delete Collection" onClick={deleteCollection}><FiTrash2 /></button></div>
        </div>
        {(error || notice) && <div className={`creator-collections-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}<button type="button" onClick={() => { setError(''); setNotice(''); }}><FiX /></button></div>}
        <section className="creator-collection-detail">
          <img src={selected.coverArt} alt="" className="creator-collection-cover" />
          <div><span className="creator-collection-eyebrow">Collection</span><h1>{selected.title}</h1><p>{selected.description || 'A curated set of recordings from your Channel.'}</p><small>{selected.broadcastCount} {selected.broadcastCount === 1 ? 'recording' : 'recordings'} · {selected.isPublic ? 'Public' : 'Private'}</small></div>
        </section>
        <section className="creator-collection-recordings"><div className="creator-collection-section-head"><div><h2>Recordings</h2><p>Order determines listener playback.</p></div><button type="button" className="creator-collections-button" onClick={openAddRecordings}><FiPlus /> Add recordings</button></div>
          {selected.recordings?.length ? selected.recordings.map((recording, index) => <article key={idOf(recording)} className="creator-collection-recording"><span className="creator-collection-order">{index + 1}</span><img src={artworkFor(recording, studioName)} alt="" /><div><strong>{recording.title || 'Untitled recording'}</strong><span>{duration(recording.duration)} · {recording.genre || 'Recording'}</span></div><div className="creator-collection-row-actions"><button type="button" disabled={busy || index === 0} aria-label="Move recording up" onClick={() => moveRecording(index, -1)}><FiChevronUp /></button><button type="button" disabled={busy || index === selected.recordings.length - 1} aria-label="Move recording down" onClick={() => moveRecording(index, 1)}><FiChevronDown /></button><button type="button" disabled={busy} aria-label="Remove recording" onClick={() => removeRecording(idOf(recording))}><FiX /></button></div></article>) : <div className="creator-collection-empty"><FiFolder /><strong>No recordings in this Collection yet.</strong><p>Add recordings from your library to publish a replayable set for listeners.</p></div>}
        </section>
        {formOpen && <CollectionForm form={form} setForm={setForm} stations={stations} editing={editing} busy={busy} onClose={() => !busy && setFormOpen(false)} onSubmit={submitForm} />}
        {addOpen && <RecordingPicker recordings={availableRecordings} selectedIds={selectedRecordingIds} setSelectedIds={setSelectedRecordingIds} studioName={studioName} busy={busy} onClose={() => !busy && setAddOpen(false)} onSubmit={addRecordings} />}
      </section>
    );
  }

  return <section className="creator-collections-page"><header className="creator-collections-heading list"><div><h1>Collections</h1><p>Curate your saved recordings into replayable sets for listeners.</p></div><button type="button" className="creator-collections-button" onClick={openCreate}><FiPlus /> New Collection</button></header>{(error || notice) && <div className={`creator-collections-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}<button type="button" onClick={() => { setError(''); setNotice(''); }}><FiX /></button></div>}<div className="creator-collections-grid">{loading ? <p className="creator-collections-loading">Loading Collections…</p> : collections.length ? collections.map((collection) => <button type="button" key={collection.id} className="creator-collection-card" onClick={() => onOpenCollection?.(collection.id)}><img src={collection.coverArt} alt="" /><span><strong>{collection.title}</strong><small>{collection.broadcastCount} {collection.broadcastCount === 1 ? 'recording' : 'recordings'} · {collection.isPublic ? 'Public' : 'Private'}</small></span></button>) : <div className="creator-collection-empty"><FiFolder /><strong>No Collections yet.</strong><p>Group your broadcasts and recordings so listeners can replay them in order.</p><button type="button" className="creator-collections-button" onClick={openCreate}><FiPlus /> Create Collection</button></div>}</div>{formOpen && <CollectionForm form={form} setForm={setForm} stations={stations} editing={false} busy={busy} onClose={() => !busy && setFormOpen(false)} onSubmit={submitForm} />}</section>;
}

function CollectionForm({ form, setForm, stations, editing, busy, onClose, onSubmit }) {
  const channel = stations[0] || null;
  return <div className="creator-collections-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="creator-collections-dialog" onSubmit={onSubmit}><header><h2>{editing ? 'Edit Collection' : 'New Collection'}</h2><button type="button" aria-label="Close" onClick={onClose}><FiX /></button></header><label>Collection name<input required maxLength="100" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Sunday night replays" /></label><label>Description<textarea maxLength="500" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What listeners can expect" /></label>{!editing && <p className="creator-collection-channel-note">Channel: <strong>{channel?.name || 'Your Channel'}</strong></p>}<label className="creator-collections-check"><input type="checkbox" checked={form.isPublic} onChange={(event) => setForm((current) => ({ ...current, isPublic: event.target.checked }))} /> Visible to listeners</label><footer><button type="button" className="creator-collections-button secondary" onClick={onClose}>Cancel</button><button className="creator-collections-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create Collection'}</button></footer></form></div>;
}

function RecordingPicker({ recordings, selectedIds, setSelectedIds, studioName, busy, onClose, onSubmit }) {
  const toggle = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  return <div className="creator-collections-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="creator-collections-dialog"><header><h2>Add recordings</h2><button type="button" aria-label="Close" onClick={onClose}><FiX /></button></header><div className="creator-collection-picker">{recordings.length ? recordings.map((recording) => <label key={idOf(recording)}><input type="checkbox" checked={selectedIds.includes(idOf(recording))} onChange={() => toggle(idOf(recording))} /><img src={artworkFor(recording, studioName)} alt="" /><span><strong>{recording.title || 'Untitled recording'}</strong><small>{duration(recording.duration)}</small></span></label>) : <p>All available recordings are already in this Collection.</p>}</div><footer><button type="button" className="creator-collections-button secondary" onClick={onClose}>Cancel</button><button type="button" className="creator-collections-button" disabled={busy || !selectedIds.length} onClick={onSubmit}>{busy ? 'Adding…' : 'Add selected'}</button></footer></section></div>;
}
