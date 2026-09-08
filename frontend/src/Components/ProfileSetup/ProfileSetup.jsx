import { useEffect, useState } from "react";
import { FaCamera, FaCheck, FaPen, FaUser } from "react-icons/fa";

import LoadingButton from "../UI/LoadingButton";
import Toast from "../UI/Toast";
import EchooLogoImage from "../Assets/echoo-logo-mark.png";
import onboardingService from "../../services/onboardingService";
import { clearAuthTokens } from "../../services/api";
import "../Register/auth-reference.css";

const prepareImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not process the selected image."));
      image.onload = () => {
        const maxSize = 420;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
};

const ProfileSetup = ({ onProfileCompleted, onSessionInvalid }) => {
  const storedUser = getStoredUser();

  const [displayName, setDisplayName] = useState(
    storedUser.displayName || storedUser.fullname || storedUser.username || ""
  );
  const [bio, setBio] = useState(storedUser.bio || "");
  const [profileImage, setProfileImage] = useState(
    storedUser.avatar || storedUser.profileImage || null
  );
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [toast, setToast] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const showError = (message) => {
    setToast({
      open: true,
      type: "error",
      title: "Could not save profile",
      message,
    });
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showError("Please choose an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showError("Please choose an image smaller than 10 MB.");
      return;
    }

    try {
      const imageData = await prepareImage(file);
      setProfileImage(imageData);
    } catch (error) {
      showError(error.message || "Could not process the image.");
    }
  };

  const saveProfile = async () => {
    if (saving) return;

    const currentUser = getStoredUser();
    const userId = currentUser.id || currentUser._id;

    if (!userId) {
      clearAuthTokens();
      onSessionInvalid?.();
      return;
    }

    if (!displayName.trim()) {
      showError("Please enter a display name before continuing.");
      return;
    }

    try {
      setSaving(true);
      const response = await onboardingService.completeProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatar: profileImage || null,
      });
      const responseUser = response?.data?.user || response?.data || {};
      const resolvedAvatar = profileImage || responseUser.avatar || null;

      const updatedUser = {
        ...currentUser,
        ...responseUser,
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatar: resolvedAvatar,
        profileImage: resolvedAvatar || "",
        profileCompleted: true,
      };

      localStorage.setItem("user", JSON.stringify(updatedUser));
      setCompleted(true);
    } catch (error) {
      showError(error.message || "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await saveProfile();
  };

  useEffect(() => {
    if (!completed) return undefined;

    const timeout = window.setTimeout(() => onProfileCompleted?.(), 900);
    return () => window.clearTimeout(timeout);
  }, [completed, onProfileCompleted]);

  if (completed) {
    return (
      <main id="echoo-main-content" role="main" tabIndex="-1" className="echoo-auth-reference is-profile is-profile-status">
        <section className="ear-auth-card ear-profile-card ear-profile-status-card" aria-live="polite">
          <img className="ear-logo-mark" src={EchooLogoImage} alt="Echoo" />
          <div className="ear-profile-status-icon" aria-hidden="true"><FaCheck /></div>
          <h1>Profile saved</h1>
          <p>Your Echoo profile is ready. Opening Listener...</p>
          <span className="ear-profile-status-loader" aria-hidden="true" />
        </section>
      </main>
    );
  }

  return (
    <main className="echoo-auth-reference is-profile" aria-labelledby="echoo-profile-title">
      <div className="ear-profile-toast">
        <Toast
          open={toast.open}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast((current) => ({ ...current, open: false }))}
        />
      </div>

      <section className="ear-auth-card ear-profile-card">
        <div className="ear-profile-brand" aria-label="Echoo">
          <img src={EchooLogoImage} alt="" aria-hidden="true" />
          <span>Echoo</span>
        </div>

        <header className="ear-profile-heading">
          <h1 id="echoo-profile-title">Create your profile</h1>
          <p>Tell people a little about yourself</p>
        </header>

        <form className="ear-profile-form" onSubmit={handleSubmit} noValidate>
          <div className="ear-profile-avatar-section">
            <div className="ear-profile-avatar-wrap">
              <label htmlFor="profile-image-input" className="ear-profile-avatar" aria-label="Add a profile photo">
                {profileImage ? (
                  <img src={profileImage} alt="Profile preview" />
                ) : (
                  <span className="ear-profile-avatar-placeholder" aria-hidden="true"><FaUser /></span>
                )}
              </label>
              <span className="ear-profile-avatar-camera" aria-hidden="true"><FaCamera /></span>
            </div>
            <input
              id="profile-image-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              hidden
            />
            <label htmlFor="profile-image-input" className="ear-profile-avatar-caption">
              Add a profile photo
              <span>JPG, PNG or WEBP. Max 10 MB.</span>
            </label>
          </div>

          <div className="ear-profile-field">
            <label htmlFor="echoo-profile-display-name" className="ear-visually-hidden">Display name</label>
            <div className="ear-profile-input-shell">
              <FaUser aria-hidden="true" />
              <input
                id="echoo-profile-display-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Display name"
                autoComplete="name"
                maxLength={80}
                required
              />
            </div>
          </div>

          <div className="ear-profile-field">
            <label htmlFor="echoo-profile-bio" className="ear-visually-hidden">Short bio (optional)</label>
            <div className="ear-profile-textarea-shell">
              <FaPen aria-hidden="true" />
              <textarea
                id="echoo-profile-bio"
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                placeholder="Tell us a little about yourself"
                maxLength={160}
              />
              <span className="ear-profile-counter" aria-live="polite">{bio.length} / 160</span>
            </div>
          </div>

          <LoadingButton
            type="submit"
            loading={saving}
            loadingText="Saving your profile..."
            disabled={!displayName.trim()}
            className="ear-profile-submit"
          >
            Continue
          </LoadingButton>
        </form>
      </section>
    </main>
  );
};

export default ProfileSetup;
