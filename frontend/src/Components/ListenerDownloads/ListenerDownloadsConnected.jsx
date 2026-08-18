import { useCallback, useEffect, useRef } from 'react';

import LegacyListenerDownloads from './ListenerDownloads';
import downloadService from '../../services/downloadService';
import batch6Service from '../../services/batch6Service';

const same = (first, second) => String(first || '') === String(second || '');

const ListenerDownloadsConnected = () => {
  const syncingRef = useRef(false);

  const reconcile = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      const local =
        typeof downloadService?.getAll === 'function'
          ? downloadService.getAll()
          : [];
      const localItems = Array.isArray(local) ? local : [];

      const listResult = await batch6Service.getDownloads({
        page: 1,
        limit: 100,
      });
      const backendRecords = Array.isArray(listResult?.data?.downloads)
        ? [...listResult.data.downloads]
        : [];

      for (const localItem of localItems) {
        const trackId = localItem.id || localItem._id;
        if (!trackId) continue;

        let record = backendRecords.find((item) => same(item.trackId, trackId));

        if (!record) {
          try {
            const created = await batch6Service.requestDownload(trackId, 'medium');
            const createdRecord = created?.data?.download;
            if (createdRecord?.id) {
              record = {
                id: createdRecord.id,
                trackId,
                status: createdRecord.status || 'pending',
                progress: Number(createdRecord.progress) || 0,
              };
              backendRecords.push(record);
            }
          } catch (requestError) {
            const code =
              requestError?.code || requestError?.data?.error?.code || '';
            const message = requestError?.message || '';

            if (
              code !== 'ALREADY_DOWNLOADED' &&
              !message.toLowerCase().includes('already')
            ) {
              console.warn('Download metadata request:', requestError);
            }
          }
        }

        if (
          record?.id &&
          (record.status !== 'completed' || Number(record.progress) < 100)
        ) {
          try {
            await batch6Service.updateDownloadProgress(record.id, {
              progress: 100,
              downloadedSize: Number(localItem.fileSize) || 0,
              status: 'completed',
            });
          } catch (progressError) {
            console.warn('Download metadata progress:', progressError);
          }
        }
      }

      // Never delete backend download metadata just because this particular
      // browser does not have the cached file. Another signed-in device may.
    } catch (syncError) {
      console.warn('Download metadata sync:', syncError);
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    reconcile();

    const interval = window.setInterval(reconcile, 15000);
    window.addEventListener('focus', reconcile);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', reconcile);
    };
  }, [reconcile]);

  // The user sees one clean Downloads product. Backend metadata reconciliation
  // stays an implementation detail rather than a second developer-facing UI.
  return <LegacyListenerDownloads />;
};

export default ListenerDownloadsConnected;
