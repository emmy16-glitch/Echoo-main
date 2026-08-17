import { useState } from "react";
import "./ChooseRole.css";

import { FaCheck, FaHeadphones, FaMicrophone } from "react-icons/fa";
import OnboardingFrame from "../Onboarding/OnboardingFrame";
import LoadingButton from "../UI/LoadingButton";
import SuccessState from "../UI/SuccessState";
import Toast from "../UI/Toast";
import onboardingService from "../../services/onboardingService";
import "../../styles/echoo-onboarding.css";
import EchoAmbient from "../EchooSystem/EchoAmbient";

const roleDetails = {
  listener: {
    title: "Listener",
    description:
      "Discover stations, follow voices you love, join live audio, and build your library.",
    Icon: FaHeadphones,
    bullets: [
      "Follow and discover creators",
      "Join live audio sessions",
      "Build and manage your library",
    ],
  },
  creator: {
    title: "Creator",
    description:
      "Launch stations, schedule broadcasts, go live, grow an audience, and manage your content.",
    Icon: FaMicrophone,
    bullets: [
      "Launch and manage stations",
      "Go live and schedule shows",
      "Grow and engage your audience",
    ],
  },
};

const ChooseRole = ({
  onListenerContinue,
  onCreatorContinue,
  onBackToProfile,
}) => {
  const [selectedRole, setSelectedRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedRole, setCompletedRole] = useState("");
  const [toast, setToast] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const handleContinue = async () => {
    if (!selectedRole || saving) return;

    try {
      setSaving(true);
      const response = await onboardingService.chooseUserType(selectedRole);

      if (response?.data?.user) {
        onboardingService.saveUser(response.data.user);
      }

      localStorage.setItem("echooRole", selectedRole);
      setCompletedRole(selectedRole);
    } catch (error) {
      const message = error?.message || "";
      const alreadyCompleted =
        error?.code === "ONBOARDING_COMPLETED" ||
        message.toLowerCase().includes("onboarding already completed");

      if (alreadyCompleted) {
        try {
          const response = await onboardingService.getStatus();
          const status = response?.data || {};
          const userType =
            status.userType ||
            status.user?.userType ||
            localStorage.getItem("echooRole");

          if (status.user) onboardingService.saveUser(status.user);

          if (
            status.isOnboardingComplete === true &&
            ["listener", "creator"].includes(userType)
          ) {
            localStorage.setItem("echooRole", userType);
            setCompletedRole(userType);
            return;
          }
        } catch (statusError) {
          console.error("Onboarding status error:", statusError);
        }
      }

      setToast({
        open: true,
        type: "error",
        title: "Could not save your choice",
        message: message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (completedRole) {
    const isListener = completedRole === "listener";

    return (
      <div
        id="echoo-main-content"
        role="main"
        tabIndex="-1"
        className="role-page echoo-onboarding-page"
      >
        <EchoAmbient density="low" className="echoo-onboarding-ambient" />
        <div className="role-container">
          <SuccessState
            title={isListener ? "You're ready to listen" : "Creator selected"}
            message={
              isListener
                ? "Your listener account is ready. Opening Echoo..."
                : "Next, tell us how you will create on Echoo."
            }
            autoContinue
            duration={900}
            onContinue={() => {
              if (isListener) {
                if (onListenerContinue) onListenerContinue();
                else window.location.href = "/listen";
                return;
              }

              onCreatorContinue?.();
            }}
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
        onClose={() =>
          setToast((current) => ({
            ...current,
            open: false,
          }))
        }
      />

      <OnboardingFrame step={3} hero="broadcast" panelClassName="eor-role-panel">
        <header className="eor-form-header">
          <h1>
            Choose how you'll use <span>Echoo</span>
          </h1>
          <p>
            Pick the experience that matches what you want to do first. You can
            expand later.
          </p>
        </header>

        <p className="eor-role-info">
          This completes the basic account setup. More setup follows based on
          the role you choose.
        </p>

        <div
          className="eor-role-grid"
          role="radiogroup"
          aria-label="Choose how you will use Echoo"
        >
          {Object.entries(roleDetails).map(([role, details]) => {
            const { title, description, Icon, bullets } = details;
            const selected = selectedRole === role;

            return (
              <button
                key={role}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`eor-role-card ${selected ? "selected" : ""}`}
                onClick={() => setSelectedRole(role)}
                disabled={saving}
              >
                <span className="eor-role-radio" aria-hidden="true" />
                <h2>{title}</h2>
                <div className="eor-role-icon">
                  <Icon aria-hidden="true" />
                </div>
                <p>{description}</p>
                <ul className="eor-role-list">
                  {bullets.map((item) => (
                    <li key={item}>
                      <FaCheck aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <p className="eor-tailor-note">
          Echoo will tailor your next setup steps and features based on the role
          you choose.
        </p>

        <div className="eor-role-actions">
          <LoadingButton
            type="button"
            disabled={!selectedRole}
            loading={saving}
            loadingText={
              selectedRole === "creator"
                ? "Setting up creator..."
                : "Preparing Echoo..."
            }
            className="eor-primary"
            onClick={handleContinue}
          >
            Continue
          </LoadingButton>

          <button
            type="button"
            className="eor-outline eor-back-only"
            onClick={onBackToProfile}
            disabled={saving || !onBackToProfile}
          >
            Back to profile
          </button>
        </div>
      </OnboardingFrame>
    </>
  );
};

export default ChooseRole;
