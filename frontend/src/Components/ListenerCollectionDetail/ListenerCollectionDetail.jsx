import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FiArrowLeft, FiPause, FiPlay } from 'react-icons/fi';
import collectionService from '../../services/collectionService';
import './ListenerCollectionDetail.css';

const formatDuration = (value) => {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function ListenerCollectionDetail() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const player = useOutletContext();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { setLoading(true); const response = await collectionService.getById(collectionId); setCollection(response?.data || null); setError(''); } catch (loadError) { setError(loadError?.message || 'This Collection is unavailable.'); } finally { setLoading(false); } }, [collectionId]);
  useEffect(() => { load(); }, [load]);
  const toggleSave = async () => { if (!collection || saving) return; try { setSaving(true); if (collection.isSaved) await collectionService.unsave(collection.id); else await collectionService.save(collection.id); setCollection((current) => ({ ...current, isSaved: !current.isSaved })); } catch (saveError) { setError(saveError?.message || 'Could not update saved Collections.'); } finally { setSaving(false); } };
  const play = (recording) => { const active = String(player.currentTrack?.id || '') === String(recording.id); if (active) player.togglePlay(); else player.playTrack(recording, collection.recordings); };
  if (loading) return <div className="lcd-page">Loading Collection…</div>;
  if (!collection) return <div className="lcd-page"><button className="lcd-back" type="button" onClick={() => navigate(-1)}><FiArrowLeft /> Back</button><p>{error || 'Collection unavailable.'}</p></div>;
  return <div className="lcd-page"><button className="lcd-back" type="button" onClick={() => navigate(-1)}><FiArrowLeft /> Back</button>{error && <div className="lcd-error">{error}</div>}<section className="lcd-hero"><img src={collection.coverArt} alt="" /><div><span>COLLECTION</span><h1>{collection.title}</h1><p>{collection.description || 'A replayable set from this Channel.'}</p><small>{collection.station?.name || 'Echoo Channel'} · {collection.broadcastCount} recordings</small><button type="button" onClick={toggleSave} disabled={saving}>{saving ? 'Updating…' : collection.isSaved ? 'Saved' : 'Save Collection'}</button></div></section><section className="lcd-list"><h2>Recordings</h2>{collection.recordings.map((recording) => { const active = String(player.currentTrack?.id || '') === String(recording.id); return <article key={recording.id}><button type="button" aria-label={`Play ${recording.title}`} onClick={() => play(recording)}>{active && player.isPlaying ? <FiPause /> : <FiPlay />}</button><img src={recording.coverArt} alt="" /><div><strong>{recording.title}</strong><span>{collection.station?.name || 'Echoo Channel'} · {formatDuration(recording.duration)}</span></div></article>; })}</section></div>;
}
