import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FaCheckCircle,
  FaCloudDownloadAlt,
  FaDatabase,
  FaDownload,
  FaSyncAlt,
} from "react-icons/fa";

import LegacyListenerDownloads from "./ListenerDownloads";

import downloadService from "../../services/downloadService";
import batch6Service from "../../services/batch6Service";

import "../../styles/echoo-batch6.css";

const same = (
  first,
  second
) =>
  String(
    first || ""
  ) ===
  String(
    second || ""
  );

const formatSize = (
  bytes
) => {
  const value =
    Number(bytes) || 0;

  if (
    value <= 0
  ) {
    return "0 MB";
  }

  const mb =
    value /
    1024 /
    1024;

  if (
    mb < 1024
  ) {
    return `${mb.toFixed(
      mb >= 10
        ? 0
        : 1
    )} MB`;
  }

  return `${(
    mb / 1024
  ).toFixed(1)} GB`;
};

const ListenerDownloadsConnected =
  () => {
    const syncingRef =
      useRef(false);

    const [
      localCount,
      setLocalCount,
    ] = useState(0);

    const [
      records,
      setRecords,
    ] = useState([]);

    const [
      stats,
      setStats,
    ] = useState({
      totalDownloads: 0,
      completedDownloads: 0,
      pendingDownloads: 0,
      totalSize: 0,
    });

    const [
      syncing,
      setSyncing,
    ] = useState(false);

    const [
      error,
      setError,
    ] = useState("");

    const reconcile =
      useCallback(
        async ({
          quiet = false,
        } = {}) => {
          if (
            syncingRef.current
          ) {
            return;
          }

          syncingRef.current =
            true;

          if (
            !quiet
          ) {
            setSyncing(
              true
            );
          }

          try {
            setError(
              ""
            );

            const local =
              typeof downloadService
                ?.getAll ===
              "function"
                ? downloadService
                    .getAll()
                : [];

            const localItems =
              Array.isArray(
                local
              )
                ? local
                : [];

            setLocalCount(
              localItems.length
            );

            let listResult =
              await batch6Service
                .getDownloads({
                  page: 1,
                  limit: 100,
                });

            let backendRecords =
              Array.isArray(
                listResult
                  ?.data
                  ?.downloads
              )
                ? listResult.data.downloads
                : [];

            const localIds =
              new Set(
                localItems
                  .map(
                    (
                      item
                    ) =>
                      String(
                        item.id ||
                        item._id ||
                        ""
                      )
                  )
                  .filter(Boolean)
              );

            for (
              const localItem of
              localItems
            ) {
              const trackId =
                localItem.id ||
                localItem._id;

              if (
                !trackId
              ) {
                continue;
              }

              let record =
                backendRecords.find(
                  (
                    item
                  ) =>
                    same(
                      item.trackId,
                      trackId
                    )
                );

              if (
                !record
              ) {
                try {
                  const created =
                    await batch6Service
                      .requestDownload(
                        trackId,
                        "medium"
                      );

                  const createdRecord =
                    created?.data
                      ?.download;

                  if (
                    createdRecord?.id
                  ) {
                    record = {
                      id:
                        createdRecord.id,

                      trackId,

                      status:
                        createdRecord.status ||
                        "pending",

                      progress: 0,
                    };

                    backendRecords.push(
                      record
                    );
                  }
                } catch (
                  requestError
                ) {
                  const code =
                    requestError
                      ?.code ||
                    requestError
                      ?.data
                      ?.error
                      ?.code ||
                    "";

                  const message =
                    requestError
                      ?.message ||
                    "";

                  if (
                    code !==
                      "ALREADY_DOWNLOADED" &&
                    !message
                      .toLowerCase()
                      .includes(
                        "already"
                      )
                  ) {
                    console.warn(
                      "Download metadata request:",
                      requestError
                    );
                  }
                }
              }

              if (
                record?.id &&
                (
                  record.status !==
                    "completed" ||
                  Number(
                    record.progress
                  ) < 100
                )
              ) {
                try {
                  await batch6Service
                    .updateDownloadProgress(
                      record.id,
                      {
                        progress: 100,

                        downloadedSize:
                          Number(
                            localItem.fileSize
                          ) || 0,

                        status:
                          "completed",
                      }
                    );
                } catch (
                  progressError
                ) {
                  console.warn(
                    "Download metadata progress:",
                    progressError
                  );
                }
              }
            }

            for (
              const record of
              backendRecords
            ) {
              const trackId =
                record.trackId;

              if (
                record.id &&
                trackId &&
                record.status ===
                  "completed" &&
                !localIds.has(
                  String(
                    trackId
                  )
                )
              ) {
                try {
                  await batch6Service
                    .deleteDownload(
                      record.id
                    );
                } catch (
                  deleteError
                ) {
                  console.warn(
                    "Download metadata cleanup:",
                    deleteError
                  );
                }
              }
            }

            const [
              refreshedList,
              refreshedStats,
            ] =
              await Promise.all([
                batch6Service
                  .getDownloads({
                    page: 1,
                    limit: 100,
                  }),

                batch6Service
                  .getDownloadStats(),
              ]);

            setRecords(
              Array.isArray(
                refreshedList
                  ?.data
                  ?.downloads
              )
                ? refreshedList.data.downloads
                : []
            );

            setStats({
              totalDownloads:
                Number(
                  refreshedStats
                    ?.data
                    ?.totalDownloads
                ) || 0,

              completedDownloads:
                Number(
                  refreshedStats
                    ?.data
                    ?.completedDownloads
                ) || 0,

              pendingDownloads:
                Number(
                  refreshedStats
                    ?.data
                    ?.pendingDownloads
                ) || 0,

              totalSize:
                Number(
                  refreshedStats
                    ?.data
                    ?.totalSize
                ) || 0,
            });
          } catch (
            syncError
          ) {
            console.error(
              "Download metadata sync:",
              syncError
            );

            if (
              !quiet
            ) {
              setError(
                syncError?.message ||
                "Could not synchronize download metadata."
              );
            }
          } finally {
            syncingRef.current =
              false;

            if (
              !quiet
            ) {
              setSyncing(
                false
              );
            }
          }
        },
        []
      );

    useEffect(() => {
      reconcile();

      const interval =
        window.setInterval(
          () => {
            reconcile({
              quiet:
                true,
            });
          },
          8000
        );

      return () =>
        window.clearInterval(
          interval
        );
    }, [
      reconcile,
    ]);

    return (
      <div className="b6-download-wrap">
        <section className="b6-download-meta">
          <header>
            <div>
              <span className="b6-kicker">
                DOWNLOAD SYNC
              </span>

              <strong>
                Offline audio +
                backend records
              </strong>

              <small>
                Browser Cache Storage
                still stores the real
                offline audio. Echoo's
                backend now tracks the
                associated download
                metadata and status.
              </small>
            </div>

            <button
              type="button"
              onClick={() =>
                reconcile()
              }
              disabled={
                syncing
              }
            >
              <FaSyncAlt />

              {syncing
                ? "Syncing..."
                : "Sync"}
            </button>
          </header>

          <div className="b6-download-stats">
            <article>
              <FaCloudDownloadAlt />

              <div>
                <strong>
                  {
                    localCount
                  }
                </strong>

                <span>
                  cached offline
                </span>
              </div>
            </article>

            <article>
              <FaDatabase />

              <div>
                <strong>
                  {
                    stats.totalDownloads
                  }
                </strong>

                <span>
                  backend records
                </span>
              </div>
            </article>

            <article>
              <FaCheckCircle />

              <div>
                <strong>
                  {
                    stats.completedDownloads
                  }
                </strong>

                <span>
                  completed
                </span>
              </div>
            </article>

            <article>
              <FaDownload />

              <div>
                <strong>
                  {
                    stats.pendingDownloads
                  }
                </strong>

                <span>
                  pending
                </span>
              </div>
            </article>

            <article>
              <FaDatabase />

              <div>
                <strong>
                  {formatSize(
                    stats.totalSize
                  )}
                </strong>

                <span>
                  backend tracked
                  size
                </span>
              </div>
            </article>
          </div>

          {error && (
            <div className="b6-alert error">
              {error}
            </div>
          )}

          <div className="b6-data-boundary">
            {
              records.length
            }{" "}
            active backend download{" "}
            {records.length ===
            1
              ? "record"
              : "records"}.
            Actual offline playback
            remains powered by the
            existing browser cache,
            not by pretending the
            metadata API contains the
            audio file.
          </div>
        </section>

        <LegacyListenerDownloads />
      </div>
    );
  };

export default ListenerDownloadsConnected;
