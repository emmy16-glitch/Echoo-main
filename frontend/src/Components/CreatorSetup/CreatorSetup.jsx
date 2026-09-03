import { useState } from "react";
import {
  FaBuilding,
  FaCheck,
  FaChevronDown,
  FaMicrophone,
  FaUpload,
  FaUser,
} from "react-icons/fa";
import "./CreatorSetup.css";

import OnboardingFrame from "../Onboarding/OnboardingFrame";
import LoadingButton from "../UI/LoadingButton";
import Toast from "../UI/Toast";
import onboardingService from "../../services/onboardingService";
import channelProvisioningService from "../../services/channelProvisioningService";

const CREATOR_STEPS = ["Channel Type", "Channel Details", "Ready"];

const categories = [
  "Music",
  "Podcast",
  "Education",
  "Entertainment",
  "News",
  "Sports",
  "Technology",
  "Spiritual",
  "Comedy",
  "Storytelling",
  "Other",
];

const organizationTypes = [
  { value: "company", label: "Company" },
  { value: "church", label: "Church" },
  { value: "brand", label: "Brand" },
  { value: "community", label: "Community" },
  { value: "organization", label: "Organization" },
  { value: "other", label: "Other" },
];

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
};

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

const CreatorPublicPreview = ({
  creatorType,
  displayName,
  username,
  profileImage,
  individualDetails,
  organizationDetails,
  organizationLogo,
}) => {
  const isOrganization = creatorType === "organization";
  const name = isOrganization ? organizationDetails.name : displayName;
  const stationName = isOrganization ? organizationDetails.name : individualDetails.stationName;
  const category = isOrganization
    ? organizationDetails.category
    : individualDetails.category;
  const description = isOrganization
    ? organizationDetails.about || organizationDetails.content
    : individualDetails.content;
  const image = isOrganization ? organizationLogo : profileImage;

  return (
    <section className="eor-public-preview" aria-label="Your public Channel preview">
      <div className="eor-public-preview-cover">
        <div className="eor-public-preview-avatar">
          {image ? <img src={image} alt="" /> : <FaMicrophone aria-hidden="true" />}
        </div>
        <div>
          <p>{category || "Channel"}</p>
          <h2>{stationName || name || "Your Channel"}</h2>
          <span>{isOrganization ? `@${(name || "creator").replace(/\s+/g, "").toLowerCase()}` : username}</span>
        </div>
      </div>
      <p className="eor-public-preview-description">
        {description || "Live conversations, thoughtful stories, and the audio your community will come back for."}
      </p>
      <div className="eor-public-preview-topics">
        <span>Live conversations</span>
        <span>Community shows</span>
        <span>New broadcasts</span>
      </div>
      <div className="eor-public-preview-stats">
        <strong>0 <span>followers</span></strong>
        <strong>0 <span>broadcasts</span></strong>
      </div>
    </section>
  );
};

const CreatorSetup = ({ onBackToRole, onCreatorReady }) => {
  const [step, setStep] = useState(1);
  const [creatorType, setCreatorType] = useState("");
  const [saving, setSaving] = useState(false);
  const [individualDetails, setIndividualDetails] = useState({
    stationName: "",
    category: "",
    content: "",
  });
  const [organizationDetails, setOrganizationDetails] = useState({
    name: "",
    organizationType: "",
    category: "",
    about: "",
    content: "",
  });
  const [organizationLogo, setOrganizationLogo] = useState(null);
  const [toast, setToast] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const storedUser = getStoredUser();
  const displayName =
    storedUser.displayName || storedUser.fullname || storedUser.name || "Creator";
  const username = storedUser.username ? `@${storedUser.username}` : "@creator";
  const profileImage =
    storedUser.avatar ||
    storedUser.profileImage ||
    null;

  const handleIndividualChange = (event) => {
    const { name, value } = event.target;
    setIndividualDetails((previous) => ({ ...previous, [name]: value }));
  };

  const handleOrganizationChange = (event) => {
    const { name, value } = event.target;
    setOrganizationDetails((previous) => ({ ...previous, [name]: value }));
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setToast({
        open: true,
        type: "error",
        title: "Invalid image",
        message: "Please choose an image file.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setToast({
        open: true,
        type: "error",
        title: "Image too large",
        message: "Please choose an image smaller than 10 MB.",
      });
      return;
    }

    try {
      setOrganizationLogo(await prepareImage(file));
    } catch (error) {
      setToast({
        open: true,
        type: "error",
        title: "Could not process image",
        message: error.message || "Please try another image.",
      });
    }
  };

  const detailsAreComplete = () => {
    if (creatorType === "individual") {
      return (
        individualDetails.stationName.trim() !== "" &&
        individualDetails.category.trim() !== "" &&
        individualDetails.content.trim() !== ""
      );
    }

    if (creatorType === "organization") {
      return (
        organizationDetails.name.trim() !== "" &&
        organizationDetails.organizationType.trim() !== "" &&
        organizationDetails.category.trim() !== "" &&
        organizationDetails.about.trim() !== "" &&
        organizationDetails.content.trim() !== ""
      );
    }

    return false;
  };

  const finishIndividualSetup = async () => {
    await onboardingService.chooseCreatorType({
      creatorType: "individual",
      artistName: displayName,
    });

    await onboardingService.updateContentInfo({
      category: individualDetails.category,
      contentDescription: individualDetails.content.trim(),
      genres: [],
    });

    await channelProvisioningService.ensureMyChannel({
      name: individualDetails.stationName.trim(),
      category: individualDetails.category,
      description: individualDetails.content.trim(),
    });

    const response = await onboardingService.complete();
    if (response?.data?.user) onboardingService.saveUser(response.data.user);

    localStorage.setItem(
      "creatorSetup",
      JSON.stringify({
        type: "individual",
        stationName: individualDetails.stationName.trim(),
        displayName,
        username: storedUser.username || "",
        profileImage,
        category: individualDetails.category,
        content: individualDetails.content.trim(),
      })
    );
  };

  const finishOrganizationSetup = async () => {
    await onboardingService.chooseCreatorType({
      creatorType: "organization",
      organizationName: organizationDetails.name.trim(),
      organizationType: organizationDetails.organizationType,
    });

    await onboardingService.updateContentInfo({
      category: organizationDetails.category,
      contentDescription: organizationDetails.content.trim(),
      genres: [],
    });

    await onboardingService.updateOrganizationDetails({
      organizationName: organizationDetails.name.trim(),
      category: organizationDetails.category,
      about: organizationDetails.about.trim(),
      contentDescription: organizationDetails.content.trim(),
      organizationLogo: organizationLogo || null,
    });

    await channelProvisioningService.ensureMyChannel({
      name: organizationDetails.name.trim(),
      category: organizationDetails.category,
      description: organizationDetails.about.trim() || organizationDetails.content.trim(),
      logoDataUrl: organizationLogo || "",
    });

    const response = await onboardingService.complete();
    if (response?.data?.user) onboardingService.saveUser(response.data.user);

    localStorage.setItem(
      "creatorSetup",
      JSON.stringify({
        type: "organization",
        logo: organizationLogo || "",
        name: organizationDetails.name.trim(),
        organizationType: organizationDetails.organizationType,
        category: organizationDetails.category,
        about: organizationDetails.about.trim(),
        content: organizationDetails.content.trim(),
      })
    );
  };

  const handleDetailsContinue = async () => {
    if (!detailsAreComplete() || saving) return;

    try {
      setSaving(true);
      if (creatorType === "individual") await finishIndividualSetup();
      else await finishOrganizationSetup();
      setStep(3);
    } catch (error) {
      setToast({
        open: true,
        type: "error",
        title: "Could not finish Channel setup",
        message: error.message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (saving) return;
    if (step === 2) {
      setStep(1);
      return;
    }
    onBackToRole?.();
  };

  const toastNode = (
    <Toast
      open={toast.open}
      type={toast.type}
      title={toast.title}
      message={toast.message}
      onClose={() => setToast((current) => ({ ...current, open: false }))}
    />
  );

  if (step === 3) {
    return (
      <>
        {toastNode}
        <OnboardingFrame
          step={3}
          steps={CREATOR_STEPS}
          phaseLabel="Channel setup"
          hero="creator"
          panelClassName="eor-creator-panel eor-creator-ready-panel"
          heroData={{
            creatorName: creatorType === "organization" ? organizationDetails.name : displayName,
            creatorHandle: creatorType === "organization" ? "Your public audio identity" : username,
          }}
        >
          <header className="eor-form-header eor-creator-ready-header">
            <h1>Almost <span>ready!</span></h1>
            <p>Review the Channel listeners will discover on Echoo.</p>
          </header>
          <CreatorPublicPreview
            creatorType={creatorType}
            displayName={displayName}
            username={username}
            profileImage={profileImage}
            individualDetails={individualDetails}
            organizationDetails={organizationDetails}
            organizationLogo={organizationLogo}
          />
          <div className="eor-public-preview-checklist" aria-label="Channel identity checklist">
            <span><FaCheck aria-hidden="true" /> Account identity connected</span>
            <span><FaCheck aria-hidden="true" /> Category selected</span>
            <span><FaCheck aria-hidden="true" /> Channel configured</span>
          </div>
          <LoadingButton type="button" className="eor-primary" onClick={() => onCreatorReady?.()}>
            Open Creator Studio
          </LoadingButton>
          <button type="button" className="eor-outline eor-creator-ready-back" onClick={() => setStep(2)}>
            Back
          </button>
        </OnboardingFrame>
      </>
    );
  }

  if (step === 1) {
    return (
      <>
        {toastNode}
        <OnboardingFrame
          step={1}
          steps={CREATOR_STEPS}
          phaseLabel="Channel setup"
          hero="creator"
          panelClassName="eor-creator-panel"
          heroData={{ creatorName: displayName, creatorHandle: username }}
        >
          <header className="eor-form-header">
            <h1>
              How will you <span>create?</span>
            </h1>
            <p>Choose the Channel identity that best matches how you'll create on Echoo.</p>
          </header>

          <p className="eor-creator-info">
            You’re still using the same Echoo account. This setup creates the Channel your broadcasts belong to.
          </p>

          <div className="creator-type-options" role="radiogroup" aria-label="Channel type">
            <button
              type="button"
              role="radio"
              aria-checked={creatorType === "individual"}
              className={`creator-type-card ${creatorType === "individual" ? "selected" : ""}`}
              onClick={() => setCreatorType("individual")}
            >
              <span className="creator-select-circle" aria-hidden="true" />
              <div className="creator-type-icon"><FaUser /></div>
              <h2>Individual</h2>
              <p>Create as yourself using your personal Echoo identity.</p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={creatorType === "organization"}
              className={`creator-type-card ${creatorType === "organization" ? "selected" : ""}`}
              onClick={() => setCreatorType("organization")}
            >
              <span className="creator-select-circle" aria-hidden="true" />
              <div className="creator-type-icon"><FaBuilding /></div>
              <h2>Organization / Brand</h2>
              <p>Create for a church, company, media brand, community, or organization.</p>
            </button>
          </div>

          <div className="eor-action-row eor-creator-actions">
            <button type="button" className="eor-outline" onClick={handleBack}>
              Back to Listener
            </button>
            <LoadingButton
              type="button"
              disabled={!creatorType}
              className="eor-primary"
              onClick={() => creatorType && setStep(2)}
            >
              Continue
            </LoadingButton>
          </div>
        </OnboardingFrame>
      </>
    );
  }

  if (creatorType === "individual") {
    return (
      <>
        {toastNode}
        <OnboardingFrame
          step={2}
          steps={CREATOR_STEPS}
          phaseLabel="Channel setup"
          hero="creator"
          panelClassName="eor-creator-panel eor-creator-details-panel"
          heroData={{ creatorName: displayName, creatorHandle: username }}
        >
          <header className="eor-form-header">
            <h1>
              Set up your <span>Channel</span>
            </h1>
            <p>This is the Channel listeners can find, follow, and hear live.</p>
          </header>

          <div className="creator-identity-card">
            <div className="creator-avatar">
              {profileImage ? (
                <img src={profileImage} alt={displayName} className="creator-avatar-image" />
              ) : (
                <FaUser />
              )}
            </div>
            <div>
              <h2>{displayName}</h2>
              <p>{username}</p>
            </div>
          </div>

          <div className="eor-form-grid">
            <div className="eor-field">
              <label htmlFor="creator-station-name">Channel name</label>
              <div className="creator-input-shell">
                <input
                  id="creator-station-name"
                  type="text"
                  name="stationName"
                  placeholder="Enter your Channel name"
                  value={individualDetails.stationName}
                  onChange={handleIndividualChange}
                  maxLength={100}
                />
              </div>
            </div>

            <div className="eor-field">
              <label htmlFor="creator-category">Category</label>
              <div className="creator-select-shell">
                <select
                  id="creator-category"
                  name="category"
                  value={individualDetails.category}
                  onChange={handleIndividualChange}
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <FaChevronDown aria-hidden="true" />
              </div>
            </div>

            <div className="eor-field">
              <label htmlFor="creator-content">What will you create?</label>
              <div className="creator-textarea-shell">
                <textarea
                  id="creator-content"
                  name="content"
                  placeholder="Tell listeners what your Channel is about..."
                  value={individualDetails.content}
                  onChange={handleIndividualChange}
                  maxLength={300}
                />
                <span>{individualDetails.content.length} / 300</span>
              </div>
            </div>
          </div>

          <p className="eor-tailor-note">
            You can refine your Channel name, artwork, description, and category later in Creator Studio.
          </p>

          <div className="eor-action-row eor-creator-actions">
            <button type="button" className="eor-outline" onClick={handleBack} disabled={saving}>
              Back
            </button>
            <LoadingButton
              type="button"
              disabled={!detailsAreComplete()}
              loading={saving}
              loadingText="Creating your Channel..."
              className="eor-primary"
              onClick={handleDetailsContinue}
            >
              Continue
            </LoadingButton>
          </div>
        </OnboardingFrame>
      </>
    );
  }

  return (
    <>
      {toastNode}
      <OnboardingFrame
        step={2}
        steps={CREATOR_STEPS}
        phaseLabel="Channel setup"
        hero="creator"
        panelClassName="eor-creator-panel eor-creator-details-panel eor-organization-panel"
        heroData={{
          creatorName: organizationDetails.name || "Your Channel",
          creatorHandle: "Your public audio identity",
        }}
      >
        <header className="eor-form-header">
          <h1>
            Set up your <span>organization Channel</span>
          </h1>
          <p>Build the Channel identity your audience will see across Echoo.</p>
        </header>

        <div className="organization-upload-section">
          <label htmlFor="organization-logo" className="organization-upload">
            {organizationLogo ? (
              <img src={organizationLogo} alt="Organization preview" />
            ) : (
              <>
                <FaUpload />
                <strong>Add logo</strong>
                <span>Optional</span>
              </>
            )}
          </label>
          <input
            id="organization-logo"
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            hidden
          />
          <p>JPG, PNG or WEBP. Max 10 MB.</p>
        </div>

        <div className="eor-form-grid organization-fields">
          <div className="eor-field">
            <label htmlFor="organization-name">Organization / Brand name</label>
            <div className="creator-input-shell">
              <input
                id="organization-name"
                type="text"
                name="name"
                placeholder="Enter organization or brand name"
                value={organizationDetails.name}
                onChange={handleOrganizationChange}
              />
            </div>
          </div>

          <div className="eor-field">
            <label htmlFor="organization-type">Organization type</label>
            <div className="creator-select-shell">
              <select
                id="organization-type"
                name="organizationType"
                value={organizationDetails.organizationType}
                onChange={handleOrganizationChange}
              >
                <option value="">Select organization type</option>
                {organizationTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <FaChevronDown aria-hidden="true" />
            </div>
          </div>

          <div className="eor-field">
            <label htmlFor="organization-category">Category</label>
            <div className="creator-select-shell">
              <select
                id="organization-category"
                name="category"
                value={organizationDetails.category}
                onChange={handleOrganizationChange}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <FaChevronDown aria-hidden="true" />
            </div>
          </div>

          <div className="eor-field">
            <label htmlFor="organization-about">About</label>
            <div className="creator-textarea-shell">
              <textarea
                id="organization-about"
                name="about"
                placeholder="Write a short description about your organization..."
                value={organizationDetails.about}
                onChange={handleOrganizationChange}
                maxLength={300}
              />
              <span>{organizationDetails.about.length} / 300</span>
            </div>
          </div>

          <div className="eor-field">
            <label htmlFor="organization-content">What will you create?</label>
            <div className="creator-textarea-shell">
              <textarea
                id="organization-content"
                name="content"
                placeholder="Tell us what kind of content or projects you plan to create..."
                value={organizationDetails.content}
                onChange={handleOrganizationChange}
                maxLength={300}
              />
              <span>{organizationDetails.content.length} / 300</span>
            </div>
          </div>
        </div>

        <div className="eor-action-row eor-creator-actions">
          <button type="button" className="eor-outline" onClick={handleBack} disabled={saving}>
            Back
          </button>
          <LoadingButton
            type="button"
            disabled={!detailsAreComplete()}
            loading={saving}
            loadingText="Creating your Channel..."
            className="eor-primary"
            onClick={handleDetailsContinue}
          >
            Continue
          </LoadingButton>
        </div>
      </OnboardingFrame>
    </>
  );
};

export default CreatorSetup;
