import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBookOpen, FiChevronRight } from 'react-icons/fi';
import collectionService from '../../services/collectionService';

// Discovery previews published content, not an account's Saved Collections.
// When no collections exist, leave the Listener home uncluttered.
export default function PublishedCollectionsPreview() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    let active = true;
    collectionService.getPublic({ limit: 4 }).then((response) => {
      if (active) setCollections(response?.data || []);
    }).catch(() => {
      if (active) setCollections([]);
    });
    return () => { active = false; };
  }, []);

  if (!collections.length) return null;
  return (
    <section className="listener-v2-panel" aria-label="Published Collections">
      <header className="listener-v2-section-title">
        <h2>Collections</h2>
        <button type="button" onClick={() => navigate('/listen/library?tab=collections')}>Explore all</button>
      </header>
      <div className="listener-v2-audio-list">
        {collections.map((collection) => (
          <button type="button" key={collection.id} className="listener-v2-collection-row" onClick={() => navigate(`/listen/collections/${encodeURIComponent(collection.id)}`)}>
            <span className="listener-v2-audio-art">
              {collection.coverArt ? <img src={collection.coverArt} alt="" /> : <FiBookOpen />}
            </span>
            <div>
              <strong>{collection.title || collection.name}</strong>
              <span>{collection.station?.name || 'Echoo Channel'} · {collection.broadcastCount ?? 0} recordings</span>
            </div>
            <FiChevronRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
