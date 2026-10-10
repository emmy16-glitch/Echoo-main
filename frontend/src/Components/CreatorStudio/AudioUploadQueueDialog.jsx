import { useCallback, useEffect, useRef, useState } from 'react';
import { FiImage, FiPause, FiRefreshCw, FiTrash2, FiUploadCloud, FiX } from 'react-icons/fi';
import studioService from '../../services/studioService.js';
import collectionService from '../../services/collectionService.js';
import batch2Service from '../../services/batch2Service.js';
import './AudioUploadQueueDialog.css';

const AUDIO_TYPES = /^(audio\/|application\/ogg)/;
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const titleFromFile = (name) => String(name || 'New recording').replace(/\.[^/.]+$/, '');
const size = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 1 : 2)} MB`;

export default function AudioUploadQueueDialog({ open, onClose, onComplete, defaultPublic = false }) {
  const [items, setItems] = useState([]);
  const [collections, setCollections] = useState([]);
  const [stations, setStations] = useState([]);
  const [newCollectionFor, setNewCollectionFor] = useState('');
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [newCollectionStation, setNewCollectionStation] = useState('');
  const [collectionBusy, setCollectionBusy] = useState(false);
  const [collectionError, setCollectionError] = useState('');
  const itemsRef = useRef(items);
  const controllers = useRef(new Map());
  const running = useRef(new Set());
  const inputRef = useRef(null);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const patchItem = useCallback((key, patch) => setItems((current) => current.map((item) => item.id === key ? { ...item, ...patch } : item)), []);
  const addFiles = useCallback((files) => {
    const accepted = [...files].filter((file) => AUDIO_TYPES.test(file.type) || /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(file.name));
    setItems((current) => {
      const known = new Set(current.map(({ file }) => `${file.name}:${file.size}:${file.type}:${file.lastModified}`));
      const added = accepted.filter((file) => {
        const fingerprint = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
        if (known.has(fingerprint)) return false;
        known.add(fingerprint);
        return true;
      });
      return [...current, ...added.map((file) => ({ id: id(), file, title: titleFromFile(file.name), description: '', isPublic: defaultPublic, artwork: null, artworkUrl: '', collectionIds: [], status: 'draft', progress: 0, error: '' }))];
    });
  }, [defaultPublic]);

  useEffect(() => {
    if (!open) return;
    collectionService.getMine().then((response) => setCollections(response?.data || [])).catch(() => setCollections([]));
    batch2Service.getMyStations().then((response) => setStations(response?.data || [])).catch(() => setStations([]));
  }, [open]);

  const run = useCallback(async (item) => {
    if (running.current.has(item.id)) return;
    running.current.add(item.id);
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    patchItem(item.id, { status: 'uploading', error: '' });
    let audioId = item.audioId || '';
    try {
      if (!audioId) {
        const result = await studioService.uploadAudioResumable({
          file: item.file, coverFile: item.artwork, title: item.title, description: item.description, isPublic: item.isPublic,
          signal: controller.signal,
          onSession: (session) => patchItem(item.id, { uploadId: session.uploadId }),
          onProgress: ({ percent, finalized }) => patchItem(item.id, { progress: percent, status: finalized ? 'organizing' : percent >= 100 ? 'finalizing' : 'uploading' }),
        });
        audioId = result?.data?.audio?.id || result?.data?.audio?._id || '';
        if (!audioId) throw new Error('Upload completed without a recording ID.');
        patchItem(item.id, { audioId, progress: 100, status: 'organizing' });
        onComplete?.();
      }
      if (item.collectionIds.length) {
        await Promise.all(item.collectionIds.map(async (collectionId) => {
          try { await collectionService.addRecordings(collectionId, [audioId]); }
          catch (error) {
            if (error?.code !== 'RECORDING_ALREADY_IN_COLLECTION') throw error;
          }
        }));
      }
      patchItem(item.id, { status: 'saved', progress: 100 });
    } catch (error) {
      const paused = controller.signal.aborted && !audioId;
      patchItem(item.id, { audioId, status: paused ? 'paused' : audioId ? 'collection-error' : 'error', error: paused ? '' : (error?.message || 'Upload failed.') });
    } finally {
      running.current.delete(item.id); controllers.current.delete(item.id);
      window.dispatchEvent(new CustomEvent('echoo:upload-queue-tick'));
    }
  }, [onComplete, patchItem]);

  const createCollection = async (itemId) => {
    const title = newCollectionTitle.trim();
    const stationId = newCollectionStation || stations[0]?.id || stations[0]?._id;
    if (!title || !stationId || collectionBusy) { setCollectionError(!stationId ? 'Create a Channel first.' : 'Enter a Collection name.'); return; }
    try {
      setCollectionBusy(true);
      setCollectionError('');
      const response = await collectionService.create({ title, description: '', stationId, isPublic: false });
      const collection = response?.data;
      if (!collection?.id) throw new Error('Could not create Collection.');
      setCollections((current) => [collection, ...current]);
      setItems((current) => current.map((entry) => (entry.id === itemId && ['draft', 'paused', 'error', 'collection-error'].includes(entry.status))
        ? { ...entry, collectionIds: [...new Set([...entry.collectionIds, collection.id])] }
        : entry));
      setNewCollectionFor('');
      setNewCollectionTitle('');
      setNewCollectionStation('');
    } catch (error) { setCollectionError(error?.message || 'Could not create Collection.'); }
    finally { setCollectionBusy(false); }
  };

  const cancel = useCallback((item) => {
    controllers.current.get(item.id)?.abort();
    if (item.uploadId && !['saved', 'finalizing', 'organizing', 'collection-error'].includes(item.status)) studioService.cancelResumableUpload(item.uploadId).catch(() => {});
    setItems((current) => current.filter(({ id: key }) => key !== item.id));
  }, []);
  const startAll = () => setItems((current) => current.map((item) => item.status === 'draft' ? { ...item, status: 'queued' } : item));

  useEffect(() => {
    if (!open) return undefined;
    const pump = () => {
      const slots = Math.max(0, 2 - running.current.size);
      itemsRef.current.filter((item) => item.status === 'queued').slice(0, slots).forEach(run);
    };
    pump();
    window.addEventListener('echoo:upload-queue-tick', pump);
    return () => window.removeEventListener('echoo:upload-queue-tick', pump);
  }, [items, open, run]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !itemsRef.current.some((item) => ['uploading', 'finalizing', 'organizing'].includes(item.status))) onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const active = items.some((item) => ['uploading', 'finalizing', 'organizing'].includes(item.status));
  return (
    <div className="audio-queue-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !active && onClose?.()}>
      <section className="audio-queue-dialog" role="dialog" aria-modal="true" aria-labelledby="audio-queue-title">
        <header><div><h2 id="audio-queue-title">Upload recordings</h2></div><button type="button" aria-label="Close uploads" disabled={active} onClick={onClose}><FiX /></button></header>
        <button className="audio-queue-drop" type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
          <FiUploadCloud /><strong>Choose or drop audio files</strong>
        </button>
        <input ref={inputRef} hidden multiple type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac,.webm" onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
        <div className="audio-queue-list">
          {items.map((item) => <article key={item.id} className={`audio-queue-item is-${item.status}`}>
            <div className="audio-queue-item-main"><div><strong>{item.file.name}</strong><span>{size(item.file.size)} · {item.status === 'saved' ? 'Saved' : item.status}</span></div><div className="audio-queue-actions">
              {item.status === 'uploading' && <button type="button" aria-label={`Pause ${item.file.name}`} onClick={() => controllers.current.get(item.id)?.abort()}><FiPause /></button>}
              {item.status === 'uploading' && <button type="button" aria-label={`Cancel ${item.file.name}`} onClick={() => cancel(item)}><FiX /></button>}
              {['paused', 'error', 'collection-error'].includes(item.status) && <button type="button" aria-label={`Resume ${item.file.name}`} onClick={() => patchItem(item.id, { status: 'queued', error: '' })}><FiRefreshCw /></button>}
              {!['uploading', 'finalizing', 'organizing'].includes(item.status) && <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => cancel(item)}><FiTrash2 /></button>}
            </div></div>
            <label>Title<input value={item.title} maxLength="200" disabled={['queued', 'uploading', 'finalizing', 'organizing', 'saved'].includes(item.status)} onChange={(event) => patchItem(item.id, { title: event.target.value })} /></label>
            <div className="audio-queue-options"><label><input type="checkbox" checked={item.isPublic} disabled={['queued', 'uploading', 'finalizing', 'organizing', 'saved'].includes(item.status)} onChange={(event) => patchItem(item.id, { isPublic: event.target.checked })} /> Public</label><label className="audio-queue-art"><FiImage /> Artwork<input disabled={['queued', 'uploading', 'finalizing', 'organizing', 'saved'].includes(item.status)} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => { const artwork = event.target.files?.[0] || null; patchItem(item.id, { artwork, artworkUrl: artwork ? URL.createObjectURL(artwork) : '' }); }} /></label></div>
            <div className="audio-queue-progress" role="progressbar" aria-label={`${item.file.name} upload`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress}><i style={{ width: `${item.progress}%` }} /></div>
            <details className="audio-queue-more"><summary>More options</summary><label>Description<textarea value={item.description} maxLength="2000" disabled={['queued', 'uploading', 'finalizing', 'organizing', 'saved'].includes(item.status)} onChange={(event) => patchItem(item.id, { description: event.target.value })} /></label>{collections.length > 0 && <fieldset><legend>Add to Collection</legend>{collections.map((collection) => <label key={collection.id}><input type="checkbox" checked={item.collectionIds.includes(collection.id)} disabled={['queued', 'uploading', 'finalizing', 'organizing', 'saved'].includes(item.status)} onChange={() => patchItem(item.id, { collectionIds: item.collectionIds.includes(collection.id) ? item.collectionIds.filter((value) => value !== collection.id) : [...item.collectionIds, collection.id] })} /> {collection.title}</label>)}</fieldset>}
              {!['queued', 'uploading', 'finalizing', 'organizing', 'saved'].includes(item.status) && (
                <>
                  <button type="button" className="audio-queue-new-collection" onClick={() => { setNewCollectionFor(item.id); setCollectionError(''); }}>+ New Collection</button>
                  {newCollectionFor === item.id && (
                    <div className="audio-queue-new-collection-form">
                      <label>Collection name<input maxLength="100" value={newCollectionTitle} onChange={(event) => setNewCollectionTitle(event.target.value)} /></label>
                      {stations.length > 1 && <label>Channel<select value={newCollectionStation} onChange={(event) => setNewCollectionStation(event.target.value)}>
                        <option value="">Select Channel</option>
                        {stations.map((station) => <option key={station.id || station._id} value={station.id || station._id}>{station.name}</option>)}
                      </select></label>}
                      <button type="button" disabled={collectionBusy || !newCollectionTitle.trim()} onClick={() => createCollection(item.id)}>{collectionBusy ? 'Creating…' : 'Create'}</button>
                      <button type="button" onClick={() => setNewCollectionFor('')}>Cancel</button>
                      {collectionError && <small role="alert">{collectionError}</small>}
                    </div>
                  )}
                </>
              )}</details>
            {item.error && <small role="alert">{item.error}</small>}
          </article>)}
        </div>
        <footer><span>{items.filter((item) => item.status === 'saved').length} of {items.length} saved</span><div>{items.some((item) => item.status === 'draft') && <button type="button" onClick={startAll}>Start uploads</button>}<button type="button" className="audio-queue-done" onClick={onClose} disabled={active}>{active ? 'Uploading…' : 'Done'}</button></div></footer>
      </section>
    </div>
  );
}
