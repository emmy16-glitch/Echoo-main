import React, {
  useEffect,
  useState,
} from "react";

import {
  FaBell,
  FaGlobe,
  FaSave,
  FaUser,
} from "react-icons/fa";

import batch1Service from "../../services/batch1Service";

import EchoAvatar from "../EchooSystem/EchoAvatar";
import EchoSignal from "../EchooSystem/EchoSignal";

import "./CreatorPhase10.css";

const SETTINGS_KEY =
  "echoo-creator-settings-v1";

const readLocalPublishing =
  () => {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            SETTINGS_KEY
          ) || "{}"
        );

      return (
        value.defaultPublic !==
        false
      );
    } catch {
      return true;
    }
  };

const CreatorSettingsWorkspace = ({
  user = {},
  studioName = "Creator",
  studioType = "Creator",
}) => {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    displayName,
    setDisplayName,
  ] = useState(
    user.displayName ||
    user.fullname ||
    studioName ||
    ""
  );

  const [
    bio,
    setBio,
  ] = useState(
    user.bio || ""
  );

  const [
    email,
    setEmail,
  ] = useState(
    user.email ||
    "Not available"
  );

  const [
    avatar,
    setAvatar,
  ] = useState(
    user.avatar ||
    user.profileImage ||
    null
  );

  const [
    language,
    setLanguage,
  ] = useState("en");

  const [
    theme,
    setTheme,
  ] = useState("system");

  const [
    notifications,
    setNotifications,
  ] = useState({
    email: true,
    push: true,
    newFollowers: true,
    newReleases: true,
  });

  const [
    defaultPublic,
    setDefaultPublic,
  ] = useState(
    readLocalPublishing
  );

  useEffect(() => {
    let active = true;

    batch1Service
      .getSettings()
      .then((response) => {
        if (!active) {
          return;
        }

        const settings =
          response?.data || {};

        const profile =
          settings.profile || {};

        const preferences =
          settings.preferences || {};

        setDisplayName(
          profile.displayName ||
          user.displayName ||
          user.fullname ||
          studioName ||
          ""
        );

        setBio(
          profile.bio ||
          user.bio ||
          ""
        );

        setEmail(
          profile.email ||
          user.email ||
          "Not available"
        );

        setAvatar(
          profile.avatar ||
          user.avatar ||
          user.profileImage ||
          null
        );

        setLanguage(
          preferences.language ||
          "en"
        );

        setTheme(
          preferences.theme ||
          "system"
        );

        setNotifications({
          email:
            preferences
              .notifications
              ?.email !== false,
          push:
            preferences
              .notifications
              ?.push !== false,
          newFollowers:
            preferences
              .notifications
              ?.newFollowers !== false,
          newReleases:
            preferences
              .notifications
              ?.newReleases !== false,
        });
      })
      .catch((loadError) => {
        console.warn(
          "Creator settings backend:",
          loadError
        );

        if (active) {
          setError(
            "Could not load server settings. Your current local values are still shown."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const changeNotification =
    (
      key
    ) => {
      setNotifications(
        (current) => ({
          ...current,
          [key]:
            !current[key],
        })
      );
    };

  const save =
    async () => {
      if (saving) {
        return;
      }

      setSaving(true);
      setMessage("");
      setError("");

      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          defaultPublic,
          updatedAt:
            new Date()
              .toISOString(),
        })
      );

      try {
        await Promise.all([
          batch1Service.updateProfile({
            displayName:
              displayName.trim(),
            bio:
              bio.trim(),
          }),
          batch1Service.updatePreferences({
            language,
            theme,
            notifications,
          }),
        ]);

        try {
          const stored =
            JSON.parse(
              localStorage.getItem(
                "user"
              ) || "{}"
            );

          localStorage.setItem(
            "user",
            JSON.stringify({
              ...stored,
              displayName:
                displayName.trim(),
              bio:
                bio.trim(),
            })
          );
        } catch {}

        setMessage(
          "Settings saved to your Echoo account."
        );
      } catch (
        saveError
      ) {
        console.error(
          "Save settings error:",
          saveError
        );

        setError(
          saveError?.message ||
          "Could not save account settings."
        );
      } finally {
        setSaving(false);
      }
    };

  const image =
    avatar ||
    user.avatar ||
    user.profileImage ||
    null;

  return (
    <section className="creator10-page creator10-settings batch1-settings-page">
      <header className="creator10-page-header">
        <div>
          <span className="creator10-kicker">
            CREATOR SETTINGS
          </span>

          <h1>
            Your Echoo account,
            connected.
          </h1>

          <p>
            Profile and preferences now save to the Echoo backend. Publishing default stays browser-local because the backend does not expose that preference yet.
          </p>
        </div>

        <EchoSignal
          size="lg"
          state="idle"
          activeNodes={0}
        >
          <EchoAvatar
            image={image}
            name={
              displayName ||
              studioName
            }
            size="sm"
            state="idle"
          />
        </EchoSignal>
      </header>

      {loading && (
        <div className="batch1-settings-notice">
          Loading account settings...
        </div>
      )}

      {message && (
        <div className="batch1-settings-notice success">
          {message}
        </div>
      )}

      {error && (
        <div className="batch1-settings-notice error">
          {error}
        </div>
      )}

      <section className="creator10-settings-section">
        <div className="creator10-section-heading">
          <div>
            <h2>
              Creator identity
            </h2>
            <p>
              These details are stored on your Echoo account.
            </p>
          </div>
        </div>

        <div className="creator10-identity-row">
          <EchoAvatar
            image={image}
            name={
              displayName ||
              studioName
            }
            size="lg"
            state="idle"
          />

          <div className="creator10-identity-main">
            <strong>
              {displayName ||
                studioName}
            </strong>
            <span>
              {email}
            </span>
            <small>
              {studioType}
            </small>
          </div>
        </div>

        <div className="batch1-settings-grid">
          <label className="batch1-field">
            <span>
              <FaUser />
              Display name
            </span>
            <input
              value={displayName}
              maxLength={80}
              onChange={(event) =>
                setDisplayName(
                  event.target.value
                )
              }
            />
          </label>

          <label className="batch1-field full">
            <span>
              <FaUser />
              Bio
            </span>
            <textarea
              value={bio}
              maxLength={500}
              placeholder="Tell listeners what your voice is about."
              onChange={(event) =>
                setBio(
                  event.target.value
                )
              }
            />
          </label>
        </div>
      </section>

      <section className="creator10-settings-section">
        <div className="creator10-section-heading">
          <div>
            <h2>
              Experience
            </h2>
            <p>
              Account-level preferences stored by Echoo.
            </p>
          </div>
        </div>

        <div className="batch1-settings-grid">
          <label className="batch1-field">
            <span>
              <FaGlobe />
              Language
            </span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(
                  event.target.value
                )
              }
            >
              <option value="en">
                English
              </option>
              <option value="fr">
                French
              </option>
            </select>
          </label>

          <label className="batch1-field">
            <span>
              <FaGlobe />
              Theme preference
            </span>
            <select
              value={theme}
              onChange={(event) =>
                setTheme(
                  event.target.value
                )
              }
            >
              <option value="system">
                System
              </option>
              <option value="light">
                Light
              </option>
              <option value="dark">
                Dark
              </option>
            </select>
          </label>
        </div>
      </section>

      <section className="creator10-settings-section">
        <div className="creator10-section-heading">
          <div>
            <h2>
              Notifications
            </h2>
            <p>
              Choose which account updates you want to receive.
            </p>
          </div>
        </div>

        <div className="batch1-toggle-list">
          {[
            [
              "email",
              "Email notifications",
            ],
            [
              "push",
              "Push notifications",
            ],
            [
              "newFollowers",
              "New followers",
            ],
            [
              "newReleases",
              "New releases",
            ],
          ].map(
            ([key, label]) => (
              <button
                type="button"
                className="batch1-toggle-row"
                key={key}
                onClick={() =>
                  changeNotification(
                    key
                  )
                }
              >
                <span>
                  <FaBell />
                  {label}
                </span>

                <i
                  className={
                    notifications[key]
                      ? "on"
                      : ""
                  }
                >
                  <b />
                </i>
              </button>
            )
          )}
        </div>
      </section>

      <section className="creator10-settings-section">
        <div className="creator10-section-heading">
          <div>
            <h2>
              Publishing default
            </h2>
            <p>
              Local browser preference until the backend exposes a publishing-default field.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="batch1-toggle-row"
          onClick={() =>
            setDefaultPublic(
              (current) =>
                !current
            )
          }
        >
          <span>
            <FaGlobe />
            New uploads default to public
          </span>

          <i
            className={
              defaultPublic
                ? "on"
                : ""
            }
          >
            <b />
          </i>
        </button>
      </section>

      <div className="batch1-settings-savebar">
        <span>
          Profile + preferences save to Echoo. Publishing default saves locally.
        </span>

        <button
          type="button"
          disabled={
            saving ||
            loading
          }
          onClick={save}
        >
          <FaSave />
          {saving
            ? "Saving..."
            : "Save settings"}
        </button>
      </div>
    </section>
  );
};

export default CreatorSettingsWorkspace;
