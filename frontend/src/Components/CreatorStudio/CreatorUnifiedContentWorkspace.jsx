import { useState } from 'react';
import { FiFolder, FiMic, FiUploadCloud } from 'react-icons/fi';
import CreatorCollectionsWorkspace from './CreatorCollectionsWorkspace.jsx';
import CreatorCollectionWorkspace from './CreatorCollectionWorkspace.jsx';
import './CreatorUnifiedContentWorkspace.css';

export default function CreatorUnifiedContentWorkspace({
  tab = 'recordings',
  tracks = [],
  studioName,
  recordingId = '',
  collectionId = '',
  onTabChange,
  onChanged,
  onOpenRecording,
  onCloseRecording,
  onOpenCollection,
  onCloseCollection,
}) {
  const [uploadRequest, setUploadRequest] = useState(0);
  return (
    <section className="creator-unified-content">
      <header className="creator-unified-content-head">
        <h1>Content</h1>
        <button type="button" className="creator-unified-upload" onClick={() => {
          if (tab !== 'recordings') onTabChange?.('recordings');
          setUploadRequest((value) => value + 1);
        }}><FiUploadCloud /> Upload</button>
      </header>
      <nav className="creator-unified-tabs" aria-label="Content sections">
        <button type="button" className={tab === 'recordings' ? 'is-active' : ''} aria-current={tab === 'recordings' ? 'page' : undefined} onClick={() => onTabChange?.('recordings')}><FiMic /> Recordings</button>
        <button type="button" className={tab === 'collections' ? 'is-active' : ''} aria-current={tab === 'collections' ? 'page' : undefined} onClick={() => onTabChange?.('collections')}><FiFolder /> Collections</button>
      </nav>
      <div className="creator-unified-content-body">
        {tab === 'collections' ? (
          <CreatorCollectionWorkspace collectionId={collectionId} studioName={studioName} onOpenCollection={onOpenCollection} onBack={onCloseCollection} embedded />
        ) : (
          <CreatorCollectionsWorkspace tracks={tracks} studioName={studioName} onChanged={onChanged} recordingId={recordingId} onOpenRecording={onOpenRecording} onCloseRecording={onCloseRecording} uploadRequest={uploadRequest} embedded />
        )}
      </div>
    </section>
  );
}
