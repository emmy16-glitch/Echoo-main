import { useState } from "react";
import { FaCamera, FaPen, FaUser } from "react-icons/fa";
import "./ProfileSetup.css";

import OnboardingFrame from "../Onboarding/OnboardingFrame";
import LoadingButton from "../UI/LoadingButton";
import SuccessState from "../UI/SuccessState";
import Toast from "../UI/Toast";
import onboardingService from "../../services/onboardingService";
import { clearAuthTokens } from "../../services/api";
import "../../styles/echoo-onboarding.css";
import EchoAmbient from "../EchooSystem/EchoAmbient";

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
  const [bio, setBio] = useState(
    storedUser.bio || localStorage.getItem("profileBio") || ""
  );
  const [profileImage, setProfileImage] = useState(
    storedUser.avatar ||
      storedUser.profileImage ||
      localStorage.getItem("profileImage") ||
      null
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
      localStorage.setItem("profileImage", imageData);
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
      const response = await onboardingService.updateProfile(userId, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatar: profileImage || null,
      });

      const updatedUser = {
        ...currentUser,
        ...(response?.data || {}),
        displayName: displayName.trim(),
        bio: bio.trim(),
        avatar: profileImage || response?.data?.avatar || null,
        profileImage: profileImage || response?.data?.avatar || "",
        profileCompleted: true,
      };

      localStorage.setItem("profileBio", bio.trim());
      if (profileImage) localStorage.setItem("profileImage", profileImage);
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

  if (completed) {
    return (
      <div id="echoo-main-content" role="main" tabIndex="-1" className="profile-page echoo-onboarding-page">
        <EchoAmbient density="low" className="echoo-onboarding-ambient" />
        <div className="profile-container">
          <SuccessState
            title="Profile saved"
            message="Your Echoo profile is ready. Next, choose how you want to use Echoo."
            autoContinue
            duration={900}
            onContinue={() => onProfileCompleted?.()}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <OnboardingFrame step={2} hero="profile" panelClassName="eor-profile-panel">
        <header className="eor-form-header">
          <h1>Set up your <span>profile</span></h1>
          <p>Add the details people will see when they discover you on Echoo.</p>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="eor-avatar-section">
            <div style={{ position: "relative" }}>
              <label htmlFor="profile-image-input" className="eor-avatar-input" aria-label="Upload a profile photo">
                {profileImage ? (
                  <img src={profileImage} alt="Profile preview" />
                ) : (
                  <span className="eor-avatar-placeholder" aria-hidden="true" />
                )}
              </label>
              <span className="eor-avatar-camera" aria-hidden="true"><FaCamera /></span>
            </div>
            <input
              id="profile-image-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              hidden
            />
            <label htmlFor="profile-image-input" className="eor-avatar-caption">
              Upload a profile photo
              <span>JPG, PNG or WEBP. Max 10 MB.</span>
            </label>
          </div>

          <div className="eor-form-grid">
            <div className="eor-field">
              <label htmlFor="echoo-profile-display-name">Display name</label>
              <div className="eor-input-shell">
                <FaUser className="eor-field-icon" aria-hidden="true" />
                <input
                  id="echoo-profile-display-name"
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Enter your display name"
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </div>
            </div>

            <div className="eor-field">
              <label htmlFor="echoo-profile-bio">Short bio <span style={{ color: "#91a0b1", fontWeight: 500 }}>(optional)</span></label>
              <div className="eor-textarea-shell">
                <FaPen className="eor-field-icon" aria-hidden="true" />
                <textarea
                  id="echoo-profile-bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Tell others about yourself"
                  maxLength={160}
                />
                <span className="eor-counter">{bio.length} / 160</span>
              </div>
            </div>
          </div>

          <div className="eor-profile-actions">
            <LoadingButton
              type="submit"
              loading={saving}
              loadingText="Saving your profile..."
              disabled={!displayName.trim()}
              className="eor-primary"
            >
              Continue
            </LoadingButton>
            <p className="eor-tailor-note">
              More setup steps follow after you choose how you want to use Echoo.
            </p>
          </div>
        </form>
      </OnboardingFrame>
    </>
  );
};

export default ProfileSetup;
