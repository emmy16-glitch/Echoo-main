import { useMemo, useState } from 'react';
import {
  FaBuilding,
  FaCheck,
  FaChevronDown,
  FaUpload,
  FaUser,
} from 'react-icons/fa';

import './CreatorSetup.css';
import LoadingButton from '../UI/LoadingButton';
import Toast from '../UI/Toast';
import onboardingService from '../../services/onboardingService';
import batch2Service from '../../services/batch2Service';

const categories = [
  'Music',
  'Podcast',
  'Education',
  'Entertainment',
  'News',
  'Sports',
  'Technology',
  'Spiritual',
  'Comedy',
  'Storytelling',
  'Other',
];

const organizationTypes = [
  { value: 'company', label: 'Company' },
  { value: 'church', label: 'Church' },
  { value: 'brand', label: 'Brand' },
  { value: 'community', label: 'Community' },
  { value: 'organization', label: 'Organization' },
  { value: 'other', label: 'Other' },
];

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
  const [toast, setToast] = useState({ open: false, type: 'info', title: '', message: '' });

  const isOrganization = creatorType === 'organization';
  const formComplete = Boolean(
    creatorType &&
    channelName.trim() &&
    category &&
    description.trim() &&
    (!isOrganization || organizationType)
  );

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

  const submit = async (event) => {
    event.preventDefault();
    if (!formComplete || saving) return;

    try {
      setSaving(true);

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

      onCreatorReady?.(readyUser);
    } catch (error) {
      showError('Could not set up your Channel', error.message || 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="channel-setup-page">
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <section className="channel-setup-shell" aria-labelledby="channel-setup-title">
        <header className="channel-setup-intro">
          <p className="channel-setup-kicker">CHANNEL SETUP</p>
          <h1 id="channel-setup-title">Set up your Channel</h1>
          <p className="channel-setup-description">
            Your Channel is your public home on Echoo. Listeners can find your broadcasts,
            recordings and collections here.
          </p>
          <ul className="channel-setup-checklist" aria-label="Channel setup includes">
            <li><FaCheck aria-hidden="true" /> Choose a name and category</li>
            <li><FaCheck aria-hidden="true" /> Add Channel artwork</li>
            <li><FaCheck aria-hidden="true" /> Start broadcasting</li>
          </ul>
        </header>

        <form className="channel-setup-form" onSubmit={submit}>
          <fieldset className="channel-type-fieldset">
            <legend>Creator identity</legend>
            <div className="channel-type-options">
              <button
                type="button"
                className={creatorType === 'individual' ? 'is-selected' : ''}
                aria-pressed={creatorType === 'individual'}
                onClick={() => setCreatorType('individual')}
                disabled={saving}
              >
                <FaUser aria-hidden="true" />
                <span><strong>Individual</strong><small>Create as yourself</small></span>
              </button>
              <button
                type="button"
                className={creatorType === 'organization' ? 'is-selected' : ''}
                aria-pressed={creatorType === 'organization'}
                onClick={() => setCreatorType('organization')}
                disabled={saving}
              >
                <FaBuilding aria-hidden="true" />
                <span><strong>Organization</strong><small>Brand, church or community</small></span>
              </button>
            </div>
          </fieldset>

          <div className="channel-setup-fields">
            <label className="channel-setup-field">
              <span>Channel name</span>
              <input
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                maxLength={100}
                placeholder="e.g. The Daily Brief"
                autoComplete="organization"
                required
              />
            </label>

            {isOrganization && (
              <label className="channel-setup-field">
                <span>Organization type</span>
                <span className="channel-select-wrap">
                  <select
                    value={organizationType}
                    onChange={(event) => setOrganizationType(event.target.value)}
                    required
                  >
                    <option value="">Select type</option>
                    {organizationTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                  <FaChevronDown aria-hidden="true" />
                </span>
              </label>
            )}

            <label className="channel-setup-field">
              <span>Category</span>
              <span className="channel-select-wrap">
                <select value={category} onChange={(event) => setCategory(event.target.value)} required>
                  <option value="">Select category</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <FaChevronDown aria-hidden="true" />
              </span>
            </label>

            <label className="channel-setup-field channel-setup-field--wide">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={300}
                placeholder="What should listeners expect from this Channel?"
                required
              />
              <small>{description.length}/300</small>
            </label>

            <div className="channel-artwork-field channel-setup-field--wide">
              <span className="channel-artwork-label">Channel artwork <small>Optional</small></span>
              <label className="channel-artwork-picker" htmlFor="channel-artwork-input">
                <span className="channel-artwork-preview">
                  {artwork
                    ? <img src={artwork} alt="Channel artwork preview" />
                    : <FaUpload aria-hidden="true" />}
                </span>
                <span>
                  <strong>{artwork ? 'Change artwork' : 'Choose artwork'}</strong>
                  <small>JPG, PNG or WebP · max 10 MB</small>
                </span>
              </label>
              <input
                id="channel-artwork-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleArtwork}
                hidden
              />
            </div>
          </div>

          <footer className="channel-setup-actions">
            <button
              type="button"
              className="channel-setup-secondary"
              onClick={backToListener}
              disabled={saving}
            >
              Back to Listener
            </button>
            <LoadingButton
              type="submit"
              className="channel-setup-primary"
              disabled={!formComplete}
              loading={saving}
              loadingText="Setting up Channel…"
            >
              Set up Channel
            </LoadingButton>
          </footer>
        </form>
      </section>
    </main>
  );
}