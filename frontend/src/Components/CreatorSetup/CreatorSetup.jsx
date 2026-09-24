import { useMemo, useRef, useState } from 'react';
import {
  FaBuilding,
  FaUpload,
  FaUser,
} from 'react-icons/fa';

import '../Onboarding/onboarding-system.css';
import './CreatorSetup.css';
import echooLogoMark from '../Assets/echoo-logo-mark.png';
import LoadingButton from '../UI/LoadingButton';
import Toast from '../UI/Toast';
import onboardingService from '../../services/onboardingService';
import batch2Service from '../../services/batch2Service';
import { CHANNEL_CATEGORY_OPTIONS } from '../../services/channelCategories';

const categories = CHANNEL_CATEGORY_OPTIONS;

const organizationTypes = [
  { value: 'company', label: 'Company' },
  { value: 'church', label: 'Church' },
  { value: 'brand', label: 'Brand' },
  { value: 'community', label: 'Community' },
  { value: 'organization', label: 'Organization' },
  { value: 'other', label: 'Other' },
];

const DESCRIPTION_MAX = 300;

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const prepareImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the selected image.'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not process the selected image.'));
    image.onload = () => {
      const maxSize = 720;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

const imageFileFromDataUrl = async (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], 'channel-artwork.jpg', { type: blob.type || 'image/jpeg' });
};

export default function CreatorSetup({ onCreatorReady }) {
  const storedUser = useMemo(() => getStoredUser(), []);
  const displayName = storedUser.displayName || storedUser.fullname || storedUser.name || storedUser.username || '';
  const storedCreatorType = storedUser.creatorProfile?.creatorType || storedUser.creatorType || '';
  const existingCreatorType = ['individual', 'organization'].includes(storedCreatorType)
    ? storedCreatorType
    : 'individual';

  const [creatorType, setCreatorType] = useState(existingCreatorType);
  const [channelName, setChannelName] = useState(
    storedUser.creatorProfile?.organizationName || displayName || ''
  );
  const [category, setCategory] = useState(storedUser.creatorProfile?.category || '');
  const [description, setDescription] = useState(
    storedUser.creatorProfile?.contentDescription || storedUser.bio || ''
  );
  const [organizationType, setOrganizationType] = useState(
    storedUser.creatorProfile?.organizationType || ''
  );
  const [artwork, setArtwork] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });

  const nameInputRef = useRef(null);
  const categorySelectRef = useRef(null);
  const descriptionRef = useRef(null);
  const orgTypeSelectRef = useRef(null);
  const artworkInputRef = useRef(null);

  const isOrganization = creatorType === 'organization';

  const validate = (values = { channelName, category, description, organizationType, isOrganization }) => {
    const errors = {};
    if (!values.channelName.trim()) {
      errors.channelName = 'Give your Channel a name.';
    } else if (values.channelName.trim().length < 2) {
      errors.channelName = 'Channel name needs at least 2 characters.';
    }
    if (!values.category) {
      errors.category = 'Choose a category.';
    }
    if (!values.description.trim()) {
      errors.description = 'Add a short description so listeners know what to expect.';
    }
    if (values.isOrganization && !values.organizationType) {
      errors.organizationType = 'Choose the organization type.';
    }
    return errors;
  };

  const clearFieldError = (field) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const showError = (title, message) => {
    setToast({ open: true, type: 'error', title, message });
  };

  const backToListener = () => {
    // Creator activation can happen before Channel setup is complete. Leaving
    // setup must make Listener the active experience as well as change the URL;
    // otherwise a refresh/default redirect would immediately reopen setup.
    localStorage.setItem('echooActiveExperience', 'listener');
    window.location.assign('/listen');
  };

  const handleArtwork = async (event) => {
    const file = event.target.files?.[0];
    // Reset the input so choosing the same file again still fires onChange.
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Invalid image', 'Choose a JPG, PNG or WebP image.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError('Image too large', 'Choose an image smaller than 10 MB.');
      return;
    }

    try {
      setArtwork(await prepareImage(file));
    } catch (error) {
      showError('Could not process image', error.message || 'Try another image.');
    }
  };

  const removeArtwork = () => {
    setArtwork('');
    artworkInputRef.current?.focus();
  };

  const ensureCanonicalChannel = async () => {
    const existing = await batch2Service.getMyStations().catch(() => null);
    const channels = Array.isArray(existing?.data) ? existing.data : [];
    if (channels.length > 0) return channels[0];

    const logoFile = await imageFileFromDataUrl(artwork);
    try {
      const response = await batch2Service.createStation({
        name: channelName.trim(),
        category,
        description: description.trim(),
        logoFile,
        brandingMode: logoFile ? 'custom' : 'generated',
        isPublic: true,
      });
      return response?.data || null;
    } catch (error) {
      if (error?.code !== 'CHANNEL_ALREADY_EXISTS') throw error;
      const retry = await batch2Service.getMyStations();
      const retryChannels = Array.isArray(retry?.data) ? retry.data : [];
      if (retryChannels.length > 0) return retryChannels[0];
      throw error;
    }
  };

  const focusFieldError = (errors) => {
    if (errors.channelName) nameInputRef.current?.focus();
    else if (errors.category) categorySelectRef.current?.focus();
    else if (errors.description) descriptionRef.current?.focus();
    else if (errors.organizationType) orgTypeSelectRef.current?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFieldError(errors);
      return;
    }

    try {
      setSaving(true);

      // Listeners don't have the creator capability yet — grant it first.
      // Without this, chooseCreatorType rejects with 403 and Channel setup
      // can never succeed for a brand-new user (empty-DB dead end).
      await onboardingService.activateCreator();

      await onboardingService.chooseCreatorType(
        isOrganization
          ? {
              creatorType: 'organization',
              organizationName: channelName.trim(),
              organizationType,
            }
          : {
              creatorType: 'individual',
              artistName: displayName || channelName.trim(),
            }
      );

      await onboardingService.updateContentInfo({
        category,
        contentDescription: description.trim(),
        genres: [],
      });

      if (isOrganization) {
        await onboardingService.updateOrganizationDetails({
          organizationName: channelName.trim(),
          category,
          about: description.trim(),
          contentDescription: description.trim(),
          organizationLogo: artwork || null,
        });
      }

      await ensureCanonicalChannel();
      const response = await onboardingService.complete();
      const readyUser = response?.data?.user || onboardingService.getLocalUser();

      localStorage.setItem('creatorSetup', JSON.stringify({
        type: creatorType,
        name: channelName.trim(),
        stationName: channelName.trim(),
        organizationType: isOrganization ? organizationType : '',
        category,
        content: description.trim(),
        logo: artwork || '',
      }));
      localStorage.setItem('echooActiveExperience', 'creator');

      // Mark the profile as completed for route guards and ensure the
      // client loads the Creator Studio workspace immediately. A full
      // navigation here guarantees the app picks up the newly granted
      // creator capability from localStorage in all client shells.
      localStorage.setItem('echooProfileCompleted', 'true');
      // Persist the updated user snapshot so app route guards and shells
      // see the newly granted creator capability before the route guard runs.
      try {
        localStorage.setItem('user', JSON.stringify(readyUser));
      } catch {
        // ignore storage failures — the in-memory session already succeeded
      }

      onCreatorReady?.(readyUser);

      // CreatorSetup can be rendered by the /creator-studio role guard. A
      // document navigation makes that guard read the freshly persisted user
      // rather than retaining the incomplete capability from its first render.
      window.location.assign('/creator-studio');
    } catch (error) {
      // A taken Channel name is a field problem, not a toast: point at the
      // name field, keep every entered value, and let retry succeed once the
      // name changes. No duplicate Channel can result — the backend enforces
      // one Channel per creator and unique slugs.
      if (error?.code === 'STATION_NAME_TAKEN') {
        setFieldErrors((current) => ({
          ...current,
          channelName: 'That Channel name is already taken. Try another name.',
        }));
        nameInputRef.current?.focus();
        return;
      }
      showError('Could not set up your Channel', error.message || 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const nameErrorId = fieldErrors.channelName ? 'channel-name-error' : undefined;
  const categoryErrorId = fieldErrors.category ? 'channel-category-error' : undefined;
  const descriptionErrorId = fieldErrors.description ? 'channel-description-error' : undefined;
  const orgTypeErrorId = fieldErrors.organizationType ? 'channel-org-type-error' : undefined;

  return (
    <main className="echoo-onboard-page channel-setup-page">
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <div className="echoo-onboard-shell">
        <header className="echoo-onboard-topbar">
          <span className="echoo-onboard-brand">
            <img src={echooLogoMark} alt="" aria-hidden="true" />
            <span aria-label="Echoo">echoo</span>
          </span>
          <button type="button" className="echoo-onboard-back" onClick={backToListener} disabled={saving}>
            Back to Listener
          </button>
        </header>

        <div className="channel-setup-layout" aria-labelledby="channel-setup-title">
          <section className="channel-setup-intro">
            <p className="channel-setup-eyebrow">CREATOR SETUP</p>
            <h1 id="channel-setup-title">Create your Channel</h1>
            <p>Set up the identity listeners will see when you broadcast. You can change these details later in Creator Studio.</p>
            <div className="channel-setup-promise">
              <span className="channel-setup-promise-dot" aria-hidden="true">1</span>
              <div>
                <strong>One quick setup</strong>
                <span>Choose your creator identity, name your Channel, and add a short description.</span>
              </div>
            </div>
            <div className="channel-setup-promise">
              <span className="channel-setup-promise-dot" aria-hidden="true">2</span>
              <div>
                <strong>Artwork is optional</strong>
                <span>You can publish now and add or change your Channel artwork later.</span>
              </div>
            </div>
          </section>

          <section className="echoo-onboard-card" aria-labelledby="channel-details-title">
            <div className="echoo-onboard-card-head">
              <h2 id="channel-details-title">Channel details</h2>
              <p>This is how your Channel will appear to listeners.</p>
            </div>

            <form className="channel-setup-form" onSubmit={submit} noValidate>
              <fieldset className="channel-setup-identity">
                <legend className="echoo-onboard-legend">Creator identity</legend>
                <div className="echoo-onboard-identity">
                  <button
                    type="button"
                    className={creatorType === 'individual' ? 'is-selected' : ''}
                    aria-pressed={creatorType === 'individual'}
                    onClick={() => setCreatorType('individual')}
                    disabled={saving}
                  >
                    <span className="identity-icon" aria-hidden="true"><FaUser /></span>
                    <span><strong>Individual</strong><small>Create as yourself</small></span>
                  </button>
                  <button
                    type="button"
                    className={creatorType === 'organization' ? 'is-selected' : ''}
                    aria-pressed={creatorType === 'organization'}
                    onClick={() => setCreatorType('organization')}
                    disabled={saving}
                  >
                    <span className="identity-icon" aria-hidden="true"><FaBuilding /></span>
                    <span><strong>Organization</strong><small>Brand, church or community</small></span>
                  </button>
                </div>
              </fieldset>

              <div className="channel-setup-grid">
                <div className="echoo-onboard-field">
                  <label htmlFor="channel-name">Channel name</label>
                  <input
                    id="channel-name"
                    ref={nameInputRef}
                    value={channelName}
                    onChange={(event) => { setChannelName(event.target.value); clearFieldError('channelName'); }}
                    onBlur={() => {
                      if (channelName.trim()) clearFieldError('channelName');
                    }}
                    maxLength={100}
                    placeholder="e.g. The Daily Brief"
                    autoComplete="organization"
                    required
                    aria-invalid={Boolean(fieldErrors.channelName)}
                    aria-describedby={nameErrorId}
                    disabled={saving}
                  />
                  {fieldErrors.channelName && (
                    <p className="echoo-onboard-error" id="channel-name-error" role="alert">{fieldErrors.channelName}</p>
                  )}
                </div>

                <div className="echoo-onboard-field">
                  <label htmlFor="channel-category">Category</label>
                  <select
                    id="channel-category"
                    ref={categorySelectRef}
                    value={category}
                    onChange={(event) => { setCategory(event.target.value); clearFieldError('category'); }}
                    required
                    aria-invalid={Boolean(fieldErrors.category)}
                    aria-describedby={categoryErrorId}
                    disabled={saving}
                  >
                    <option value="">Select category</option>
                    {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                  {fieldErrors.category && (
                    <p className="echoo-onboard-error" id="channel-category-error" role="alert">{fieldErrors.category}</p>
                  )}
                </div>

                {isOrganization && (
                  <div className="echoo-onboard-field channel-setup-org-reveal">
                    <label htmlFor="channel-org-type">Organization type</label>
                    <select
                      id="channel-org-type"
                      ref={orgTypeSelectRef}
                      value={organizationType}
                      onChange={(event) => { setOrganizationType(event.target.value); clearFieldError('organizationType'); }}
                      required
                      aria-invalid={Boolean(fieldErrors.organizationType)}
                      aria-describedby={orgTypeErrorId}
                      disabled={saving}
                    >
                      <option value="">Select type</option>
                      {organizationTypes.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                    {fieldErrors.organizationType && (
                      <p className="echoo-onboard-error" id="channel-org-type-error" role="alert">{fieldErrors.organizationType}</p>
                    )}
                  </div>
                )}

                <div className="echoo-onboard-field echoo-onboard-field-wide">
                  <label htmlFor="channel-description">Description</label>
                  <div className="channel-setup-textarea-wrap">
                    <textarea
                      id="channel-description"
                      ref={descriptionRef}
                      value={description}
                      onChange={(event) => { setDescription(event.target.value); clearFieldError('description'); }}
                      maxLength={DESCRIPTION_MAX}
                      placeholder="What should listeners expect from this Channel?"
                      required
                      aria-invalid={Boolean(fieldErrors.description)}
                      aria-describedby={descriptionErrorId ? `${descriptionErrorId} channel-description-counter` : 'channel-description-counter'}
                      disabled={saving}
                    />
                    <span className="channel-setup-counter" id="channel-description-counter">{description.length}/{DESCRIPTION_MAX}</span>
                  </div>
                  {fieldErrors.description && (
                    <p className="echoo-onboard-error" id="channel-description-error" role="alert">{fieldErrors.description}</p>
                  )}
                </div>

                <div className="echoo-onboard-field echoo-onboard-field-wide">
                  <span className="echoo-onboard-legend" id="channel-artwork-label">
                    Channel artwork <span className="channel-setup-optional">Optional</span>
                  </span>
                  <label className="channel-setup-upload" htmlFor="channel-artwork-input" aria-labelledby="channel-artwork-label">
                    <span className="channel-setup-upload-icon" aria-hidden="true">
                      {artwork
                        ? <img src={artwork} alt="Channel artwork preview" />
                        : <FaUpload />}
                    </span>
                    <span>
                      <strong>{artwork ? 'Change artwork' : 'Choose artwork'}</strong>
                      <small>JPG, PNG or WebP · max 10 MB</small>
                    </span>
                  </label>
                  <input
                    id="channel-artwork-input"
                    ref={artworkInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleArtwork}
                    hidden
                    disabled={saving}
                  />
                  {artwork && (
                    <button type="button" className="channel-setup-artwork-remove" onClick={removeArtwork} disabled={saving}>
                      Remove artwork
                    </button>
                  )}
                </div>
              </div>

              <div className="echoo-onboard-actions">
                <button
                  type="button"
                  className="echoo-onboard-btn echoo-onboard-btn-secondary"
                  onClick={backToListener}
                  disabled={saving}
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  className="echoo-onboard-btn echoo-onboard-btn-primary"
                  loading={saving}
                  loadingText="Creating Channel…"
                >
                  Create Channel
                </LoadingButton>
              </div>
              <p className="channel-setup-help">You can edit your Channel later in Creator Studio.</p>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
