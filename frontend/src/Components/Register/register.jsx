import { useState } from "react";
import "./register.css";
import "./broadcast-login.css";
import api from "../../services/api";

import {
  FaApple,
  FaArrowLeft,
  FaEnvelope,
  FaExclamationCircle,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaUser,
} from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import EchooLogoImage from "../Assets/logo_optimized.jpg";
import BroadcastLoginVisual from "./BroadcastLoginVisual";
import OnboardingFrame from "../Onboarding/OnboardingFrame";
import LoadingButton from "../UI/LoadingButton";
import SuccessState from "../UI/SuccessState";
import Toast from "../UI/Toast";
import EchoAmbient from "../EchooSystem/EchoAmbient";
import "../../styles/echoo-onboarding.css";

const Register = ({ onAccountCreated, onLoginSuccess }) => {
  const [action, setAction] = useState("Sign Up");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupNotice, setSignupNotice] = useState("");
  const [successState, setSuccessState] = useState(null);
  const [successUser, setSuccessUser] = useState(null);

  const [toast, setToast] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const [formData, setFormData] = useState({
    fullname: "",
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const passwordTooShort =
    action === "Sign Up" &&
    formData.password.length > 0 &&
    formData.password.length < 8;

  const passwordsMismatch =
    action === "Sign Up" &&
    formData.confirmPassword.length > 0 &&
    formData.password !== formData.confirmPassword;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previousData) => ({ ...previousData, [name]: value }));

    if (action === "Login") {
      setLoginError("");
      setLoginNotice("");
    }

    if (action === "Sign Up") {
      setSignupError("");
      setSignupNotice("");
    }
  };

  const formIsComplete = () => {
    if (action === "Sign Up") {
      return (
        formData.fullname.trim() !== "" &&
        formData.username.trim() !== "" &&
        formData.email.trim() !== "" &&
        formData.password.length >= 8 &&
        formData.confirmPassword !== "" &&
        formData.password === formData.confirmPassword
      );
    }

    if (action === "Login") {
      return formData.username.trim() !== "" && formData.password.trim() !== "";
    }

    if (action === "Forgot Password") {
      return formData.email.trim() !== "";
    }

    return false;
  };

  const saveSession = (response) => {
    const { user, accessToken, refreshToken } = response.data;
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    return user;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (loading) return;

    if (action === "Sign Up" && !formIsComplete()) {
      if (formData.password.length < 8) {
        setSignupError("Password must be at least 8 characters.");
      } else if (formData.password !== formData.confirmPassword) {
        setSignupError("Passwords do not match. Please check both password fields.");
      } else {
        setSignupError("Please complete all required fields.");
      }
      return;
    }

    if (!formIsComplete()) return;

    setLoading(true);
    setLoginError("");
    setLoginNotice("");
    setSignupError("");
    setSignupNotice("");

    try {
      if (action === "Sign Up") {
        const response = await api.auth.register({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          displayName: formData.fullname.trim(),
        });

        const user = saveSession(response);
        setSuccessUser(user);
        setSuccessState("signup");
        return;
      }

      if (action === "Login") {
        const response = await api.auth.login({
          username: formData.username.trim(),
          password: formData.password,
        });

        const user = saveSession(response);
        setSuccessUser(user);
        setSuccessState("login");
        return;
      }

      if (action === "Forgot Password") {
        setToast({
          open: true,
          type: "info",
          title: "Password recovery is not available yet",
          message:
            "Echoo has not enabled password-reset email yet. Please contact support or your administrator if you cannot access your account.",
        });
      }
    } catch (error) {
      if (action === "Login") {
        const isCredentialError =
          error?.status === 401 ||
          error?.status === 403 ||
          ["INVALID_CREDENTIALS", "AUTH_INVALID", "LOGIN_FAILED"].includes(error?.code);

        setLoginError(
          isCredentialError
            ? "Incorrect username or password. Please check your details and try again."
            : error?.message || "We couldn't sign you in. Please try again."
        );
        return;
      }

      if (action === "Sign Up") {
        setSignupError(error?.message || "We couldn't create your account. Please try again.");
        return;
      }

      setToast({
        open: true,
        type: "error",
        title: "Could not send reset email",
        message: error?.message || "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const switchToLogin = () => {
    setAction("Login");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSuccessState(null);
    setLoginError("");
    setLoginNotice("");
    setSignupError("");
    setSignupNotice("");
  };

  const switchToSignUp = () => {
    setAction("Sign Up");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSuccessState(null);
    setLoginError("");
    setLoginNotice("");
    setSignupError("");
    setSignupNotice("");
  };

  if (successState === "signup") {
    return (
      <div id="echoo-main-content" role="main" tabIndex="-1" className="auth-page echoo-onboarding-page">
        <EchoAmbient density="low" className="echoo-onboarding-ambient" />
        <div className="auth-card compact-card">
          <SuccessState
            title="Account created"
            message="Your Echoo account is ready. Let's set up your profile."
            autoContinue
            duration={900}
            onContinue={() => onAccountCreated?.(successUser)}
          />
        </div>
      </div>
    );
  }

  if (successState === "login") {
    return (
      <div className="auth-page">
        <div className="auth-card compact-card">
          <SuccessState
            title="Welcome back"
            message="Opening your Echoo account..."
            autoContinue
            duration={700}
            onContinue={() => onLoginSuccess?.(successUser)}
          />
        </div>
      </div>
    );
  }

  if (action === "Forgot Password") {
    return (
      <div className="auth-page">
        <Toast
          open={toast.open}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast((current) => ({ ...current, open: false }))}
        />
        <div className="auth-card compact-card">
          <div className="top-nav">
            <button type="button" className="back-button" onClick={switchToLogin} aria-label="Back to sign in">
              <FaArrowLeft />
            </button>
          </div>
          <div className="logo-container">
            <img src={EchooLogoImage} alt="Echoo Logo" className="echoo-logo-image" />
          </div>
          <div className="auth-header forgot-header"><h1>Forgot Password</h1></div>
          <form onSubmit={handleSubmit} className="auth-form compact-form">
            <p className="forgot-description">
              Enter the email address associated with your account, and we'll send you a verification code.
            </p>
            <div className="input-container">
              <div className="input">
                <input
                  className="forminput"
                  type="email"
                  name="email"
                  placeholder="Email Address"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <LoadingButton
              type="submit"
              loading={loading}
              loadingText="Sending..."
              disabled={!formIsComplete()}
              className={`main-button ${formIsComplete() ? "active" : ""}`}
            >
              Send
            </LoadingButton>
          </form>
        </div>
      </div>
    );
  }

  if (action === "Login") {
    const showSocialNotice = (provider) => {
      setLoginError("");
      setLoginNotice(
        `${provider} sign-in is not enabled on the current Echoo backend yet. Please use your Echoo username and password.`
      );
    };

    return (
      <main className="echoo-broadcast-login-page">
        <section className="echoo-broadcast-login-hero" aria-label="Echoo live audio preview">
          <BroadcastLoginVisual logoSrc={EchooLogoImage} />
        </section>

        <section className="echoo-broadcast-login-auth" aria-labelledby="echoo-broadcast-login-title">
          <div className="echoo-broadcast-form-card">
            <header className="echoo-broadcast-form-heading">
              <h1 id="echoo-broadcast-login-title">Welcome back</h1>
              <p>Sign in to continue to Echoo.</p>
            </header>

            <form className="echoo-broadcast-form" onSubmit={handleSubmit} noValidate>
              <div className="echoo-broadcast-field">
                <label htmlFor="echoo-login-username">Username</label>
                <div className={`echoo-broadcast-input-shell ${loginError ? "has-error" : ""}`}>
                  <FaUser className="echoo-broadcast-input-icon" aria-hidden="true" />
                  <input
                    id="echoo-login-username"
                    type="text"
                    name="username"
                    placeholder="Enter your username"
                    value={formData.username}
                    onChange={handleChange}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    aria-invalid={loginError ? "true" : "false"}
                    required
                  />
                </div>
              </div>

              <div className="echoo-broadcast-field">
                <div className="echoo-broadcast-field-row">
                  <label htmlFor="echoo-login-password">Password</label>
                  <button
                    type="button"
                    className="echoo-broadcast-forgot"
                    onClick={() => {
                      setLoginError("");
                      setLoginNotice("");
                      setAction("Forgot Password");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>

                <div className={`echoo-broadcast-input-shell ${loginError ? "has-error" : ""}`}>
                  <FaLock className="echoo-broadcast-input-icon" aria-hidden="true" />
                  <input
                    id="echoo-login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                    aria-invalid={loginError ? "true" : "false"}
                    aria-describedby={loginError ? "echoo-login-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="echoo-broadcast-password-toggle"
                    onClick={() => setShowPassword((previous) => !previous)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>

                {loginError && (
                  <p id="echoo-login-error" className="echoo-broadcast-error" role="alert" aria-live="polite">
                    <FaExclamationCircle aria-hidden="true" />
                    <span>{loginError}</span>
                  </p>
                )}
              </div>

              <LoadingButton
                type="submit"
                loading={loading}
                loadingText="Signing in..."
                disabled={!formIsComplete()}
                className="echoo-broadcast-submit"
              >
                Sign in
              </LoadingButton>

              {loginNotice && <p className="echoo-broadcast-notice" role="status">{loginNotice}</p>}

              <div className="echoo-broadcast-divider"><span>or continue with</span></div>
              <div className="echoo-broadcast-socials">
                <button type="button" className="echoo-broadcast-social" onClick={() => showSocialNotice("Google")}>
                  <FcGoogle aria-hidden="true" /> Continue with Google
                </button>
                <button type="button" className="echoo-broadcast-social" onClick={() => showSocialNotice("Apple")}>
                  <FaApple aria-hidden="true" /> Continue with Apple
                </button>
              </div>
              <p className="echoo-broadcast-signup">
                New to Echoo? <button type="button" onClick={switchToSignUp}>Create account</button>
              </p>
            </form>
          </div>
        </section>
      </main>
    );
  }

  const showSignupSocialNotice = (provider) => {
    setSignupError("");
    setSignupNotice(
      `${provider} sign-up is not enabled on the current Echoo backend yet. Please create your account with the form above.`
    );
  };

  return (
    <OnboardingFrame step={1} hero="broadcast" panelClassName="eor-account-panel">
      <header className="eor-form-header">
        <h1>Create your <span>Echoo</span> account</h1>
        <p>Start your live audio journey with a secure Echoo account.</p>
      </header>

      <form className="eor-form-grid" onSubmit={handleSubmit} noValidate>
        <div className="eor-field">
          <label htmlFor="echoo-signup-fullname">Full name</label>
          <div className="eor-input-shell">
            <FaUser className="eor-field-icon" aria-hidden="true" />
            <input
              id="echoo-signup-fullname"
              type="text"
              name="fullname"
              placeholder="Enter your full name"
              value={formData.fullname}
              onChange={handleChange}
              autoComplete="name"
              required
            />
          </div>
        </div>

        <div className="eor-field">
          <label htmlFor="echoo-signup-username">Username</label>
          <div className="eor-input-shell">
            <FaUser className="eor-field-icon" aria-hidden="true" />
            <input
              id="echoo-signup-username"
              type="text"
              name="username"
              placeholder="Choose a unique username"
              value={formData.username}
              onChange={handleChange}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </div>
        </div>

        <div className="eor-field">
          <label htmlFor="echoo-signup-email">Email address</label>
          <div className="eor-input-shell">
            <FaEnvelope className="eor-field-icon" aria-hidden="true" />
            <input
              id="echoo-signup-email"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="eor-field">
          <label htmlFor="echoo-signup-password">Password</label>
          <div className={`eor-input-shell ${passwordTooShort ? "has-error" : ""}`}>
            <FaLock className="eor-field-icon" aria-hidden="true" />
            <input
              id="echoo-signup-password"
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Create a strong password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              aria-invalid={passwordTooShort ? "true" : "false"}
              required
            />
            <button
              type="button"
              className="eor-password-toggle"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          {passwordTooShort && <p className="eor-inline-error">Password must be at least 8 characters.</p>}
        </div>

        <div className="eor-field">
          <label htmlFor="echoo-signup-confirm">Confirm password</label>
          <div className={`eor-input-shell ${passwordsMismatch ? "has-error" : ""}`}>
            <FaLock className="eor-field-icon" aria-hidden="true" />
            <input
              id="echoo-signup-confirm"
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              placeholder="Re-enter your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              aria-invalid={passwordsMismatch ? "true" : "false"}
              required
            />
            <button
              type="button"
              className="eor-password-toggle"
              onClick={() => setShowConfirmPassword((previous) => !previous)}
              aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
            >
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          {passwordsMismatch && <p className="eor-inline-error">Passwords do not match.</p>}
          {!passwordsMismatch && <p className="eor-helper">Use 8+ characters. A mix of letters, numbers and symbols is recommended.</p>}
        </div>

        {signupError && <p className="eor-inline-error" role="alert">{signupError}</p>}

        <LoadingButton
          type="submit"
          loading={loading}
          loadingText="Creating account..."
          disabled={!formIsComplete()}
          className="eor-primary"
        >
          Continue
        </LoadingButton>

        <p className="eor-auth-switch">
          Already have an account? <button type="button" className="eor-secondary-link" onClick={switchToLogin}>Sign in</button>
        </p>

        {signupNotice && <p className="eor-notice" role="status">{signupNotice}</p>}

        <div className="eor-divider"><span>or continue with</span></div>
        <div className="eor-socials">
          <button type="button" className="eor-social" onClick={() => showSignupSocialNotice("Google")}>
            <FcGoogle aria-hidden="true" /> Continue with Google
          </button>
          <button type="button" className="eor-social" onClick={() => showSignupSocialNotice("Apple")}>
            <FaApple aria-hidden="true" /> Continue with Apple
          </button>
        </div>

        <p className="eor-legal">
          By creating an account you agree to our <span>Terms of services</span> and <span>Privacy Policy</span>.
        </p>
      </form>
    </OnboardingFrame>
  );
};

export default Register;