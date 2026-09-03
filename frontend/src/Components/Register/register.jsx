import { useState } from "react";
import "./register.css";
import api from "../../services/api";

import {
  FaArrowLeft,
  FaArrowRight,
  FaEnvelope,
  FaExclamationCircle,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaUser,
} from "react-icons/fa";

import EchooLogoImage from "../Assets/echoo-logo-official.svg";
import BroadcastLoginVisual from "./BroadcastLoginVisual";
import LoadingButton from "../UI/LoadingButton";
import SuccessState from "../UI/SuccessState";
import Toast from "../UI/Toast";
import EchoAmbient from "../EchooSystem/EchoAmbient";
import "../../styles/echoo-onboarding.css";

const AuthProgress = () => (
  <div className="ear-progress-wrap">
    <p>STEP 1 OF 2</p>
    <div className="ear-progress ear-progress-two" aria-label="Account setup, step 1 of 2">
      {["Account", "Profile"].map((label, index) => (
        <div className={`ear-progress-step ${index === 0 ? "is-current" : ""}`} key={label}>
          <span>{index + 1}</span>
          <strong>{label}</strong>
          {index < 1 && <i aria-hidden="true" />}
        </div>
      ))}
    </div>
  </div>
);

const AuthField = ({
  id,
  label,
  icon: Icon,
  error,
  action,
  children,
}) => (
  <div className="ear-field">
    <div className="ear-field-label-row">
      <label htmlFor={id}>{label}</label>
      {action}
    </div>
    <div className={`ear-input-shell ${error ? "has-error" : ""}`}>
      <Icon className="ear-input-icon" aria-hidden="true" />
      {children}
    </div>
  </div>
);

const Register = ({ onAccountCreated, onLoginSuccess }) => {
  const [action, setAction] = useState("Sign Up");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginNotice, setLoginNotice] = useState("");
  const [signupError, setSignupError] = useState("");
  const [successState, setSuccessState] = useState(null);
  const [successUser, setSuccessUser] = useState(null);
  const [resetEmail, setResetEmail] = useState("");
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
  const passwordMissingCombination =
    action === "Sign Up" &&
    formData.password.length > 0 &&
    !(/[a-z]/.test(formData.password) &&
      /[A-Z]/.test(formData.password) &&
      /\d/.test(formData.password) &&
      /[^A-Za-z0-9]/.test(formData.password));
  const passwordInvalid = passwordTooShort || passwordMissingCombination;
  const passwordsMismatch =
    action === "Sign Up" &&
    formData.confirmPassword.length > 0 &&
    formData.password !== formData.confirmPassword;

  const fullNamePattern = /^[\p{L}]+(?:[\s'-][\p{L}]+)*$/u;
  const fullNameInvalid =
    action === "Sign Up" &&
    formData.fullname.trim() !== "" &&
    !fullNamePattern.test(formData.fullname.trim());

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previousData) => ({ ...previousData, [name]: value }));
    if (action === "Login") {
      setLoginError("");
      setLoginNotice("");
    }
    if (action === "Sign Up") setSignupError("");
  };

  const formIsComplete = () => {
    if (action === "Sign Up") {
      return (
        formData.fullname.trim() !== "" &&
        !fullNameInvalid &&
        formData.username.trim() !== "" &&
        formData.email.trim() !== "" &&
        !passwordInvalid &&
        formData.confirmPassword !== "" &&
        formData.password === formData.confirmPassword
      );
    }
    if (action === "Login") {
      return formData.username.trim() !== "" && formData.password.trim() !== "";
    }
    if (action === "Forgot Password") return formData.email.trim() !== "";
    return false;
  };

  const saveSession = (response) => {
    const { user, accessToken, refreshToken } = response?.data || {};
    if (!user || !accessToken) {
      throw new Error(
        "Your account was created, but Echoo could not start a secure session. Please sign in again."
      );
    }
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.removeItem("echooRole");
    return user;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    if (action === "Sign Up" && !formIsComplete()) {
      if (fullNameInvalid) {
        setSignupError("Full name can contain letters, spaces, apostrophes, or hyphens only.");
      } else if (passwordTooShort) {
        setSignupError("Password must be at least 8 characters.");
      } else if (passwordMissingCombination) {
        setSignupError("Password must include uppercase and lowercase letters, a number, and a special character.");
      } else if (formData.password !== formData.confirmPassword) {
        setSignupError("Passwords do not match. Please check both password fields.");
      } else setSignupError("Please complete all required fields.");
      return;
    }
    if (!formIsComplete()) return;

    setLoading(true);
    setLoginError("");
    setLoginNotice("");
    setSignupError("");

    try {
      if (action === "Sign Up") {
        const response = await api.auth.register({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          displayName: formData.fullname.trim(),
        });
        const user = saveSession(response);
        localStorage.setItem("echooActiveExperience", "listener");
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
        localStorage.setItem("echooActiveExperience", "listener");
        setSuccessUser(user);
        setSuccessState("login");
        return;
      }

      if (action === "Forgot Password") {
        await api.auth.forgotPassword(formData.email.trim());
        setResetEmail(formData.email.trim());
        setSuccessState("reset-email");
      }
    } catch (error) {
      if (action === "Login") {
        const isCredentialError =
          error?.status === 401 ||
          error?.status === 403 ||
          ["INVALID_CREDENTIALS", "AUTH_INVALID", "LOGIN_FAILED"].includes(error?.code);
        const isNetworkError = error?.message?.toLowerCase() === "failed to fetch";
        setLoginError(
          isCredentialError
            ? "Incorrect username or password. Please check your details and try again."
            : isNetworkError
              ? "We couldn't reach the Echoo sign-in service. Please check your connection and try again."
              : error?.message || "We couldn't sign you in. Please try again."
        );
        return;
      }
      if (action === "Sign Up") {
        const isNetworkError = error?.message?.toLowerCase() === "failed to fetch";
        const isServiceUnavailable = [502, 503, 504].includes(error?.status);
        setSignupError(
          isNetworkError || isServiceUnavailable
            ? "The Echoo account service is temporarily unavailable. Please try again in a moment."
            : error?.message || "We couldn't create your account. Please try again."
        );
        return;
      }

      if (action === "Forgot Password" && error?.status === 404 && error?.code === "USER_NOT_REGISTERED") {
        setAction("Sign Up");
        setSignupError("This email is not registered. Please create an Echoo account.");
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

  const resetMessages = () => {
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSuccessState(null);
    setLoginError("");
    setLoginNotice("");
    setSignupError("");
  };

  const switchToLogin = () => {
    resetMessages();
    setAction("Login");
  };

  const switchToSignUp = () => {
    resetMessages();
    setAction("Sign Up");
  };

  if (successState === "signup") {
    return (
      <div id="echoo-main-content" role="main" tabIndex="-1" className="auth-page echoo-onboarding-page">
        <EchoAmbient density="low" className="echoo-onboarding-ambient" />
        <div className="auth-card compact-card">
          <SuccessState
            title="Account created"
            message="Your Echoo account is ready. Let's set up your Listener profile."
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
            message="Opening your Listener experience..."
            autoContinue
            duration={700}
            onContinue={() => onLoginSuccess?.(successUser)}
          />
        </div>
      </div>
    );
  }

  if (successState === "reset-email") {
    return (
      <main className="echoo-auth-reference is-login is-check-email">
        <section className="ear-visual-panel" aria-label="Echoo audio background">
          <BroadcastLoginVisual logoSrc={EchooLogoImage} mode="login" />
        </section>
        <section className="ear-auth-panel" aria-labelledby="ear-check-email-title">
          <div className="ear-auth-card ear-check-email-card">
            <img src={EchooLogoImage} alt="" className="ear-login-card-logo" aria-hidden="true" />
            <div className="ear-check-email-icon" aria-hidden="true"><FaEnvelope /></div>
            <header className="ear-form-heading">
              <h1 id="ear-check-email-title">Check your email</h1>
              <p>
                We sent a password-reset link to <strong>{resetEmail}</strong>. Open it to create your new password.
              </p>
            </header>
            <button type="button" className="ear-submit" onClick={switchToLogin}>
              Back to login
            </button>
          </div>
        </section>
      </main>
    );
  }

  const isLogin = action === "Login";
  const isForgotPassword = action === "Forgot Password";

  return (
    <main className={`echoo-auth-reference ${isLogin || isForgotPassword ? "is-login" : "is-signup"} ${isForgotPassword ? "is-forgot" : ""}`}>
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <section className="ear-visual-panel" aria-label="Echoo audio background">
        <BroadcastLoginVisual logoSrc={EchooLogoImage} mode={isLogin || isForgotPassword ? "login" : "signup"} />
      </section>

      <section className="ear-auth-panel" aria-labelledby="ear-auth-title">
        <div className="ear-auth-card">
          {isForgotPassword ? (
            <>
              <button type="button" className="ear-glass-back" onClick={switchToLogin} aria-label="Back to login">
                <FaArrowLeft />
              </button>
              <img src={EchooLogoImage} alt="" className="ear-login-card-logo" aria-hidden="true" />
              <header className="ear-form-heading">
                <h1 id="ear-auth-title">Forgot password?</h1>
                <p>Enter the email connected to your Echoo account and we’ll send you a reset link.</p>
              </header>
              <form className="ear-form" onSubmit={handleSubmit}>
                <AuthField id="echoo-forgot-email" label="Email address" icon={FaEnvelope}>
                  <input
                    id="echoo-forgot-email"
                    type="email"
                    name="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={handleChange}
                    autoComplete="email"
                    required
                  />
                </AuthField>
                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText="Sending..."
                  disabled={!formIsComplete()}
                  className="ear-submit"
                >
                  Send reset link
                </LoadingButton>
              </form>
            </>
          ) : (
            <>
              {!isLogin && <AuthProgress />}
              {isLogin && <img src={EchooLogoImage} alt="" className="ear-login-card-logo" aria-hidden="true" />}
              <header className="ear-form-heading">
                <h1 id="ear-auth-title">
                  {isLogin ? <>Echoo your sound</> : <>Join the <em>Echoo</em> community</>}
                </h1>
                <p>
                  {isLogin
                    ? "Sign in to continue your listening experience"
                    : "Listen, follow and save what you love. Create a Channel whenever you're ready."}
                </p>
              </header>

              <form className="ear-form" onSubmit={handleSubmit} noValidate>
                {!isLogin && (
                  <AuthField
                    id="echoo-signup-fullname"
                    label="Full name"
                    icon={FaUser}
                    error={fullNameInvalid}
                  >
                    <input
                      id="echoo-signup-fullname"
                      type="text"
                      name="fullname"
                      placeholder="Enter your full name"
                      value={formData.fullname}
                      onChange={handleChange}
                      autoComplete="name"
                      aria-invalid={fullNameInvalid}
                      required
                    />
                  </AuthField>
                )}

                {fullNameInvalid && (
                  <p className="ear-error" role="alert">
                    Full name can contain letters, spaces, apostrophes, or hyphens only.
                  </p>
                )}

                <AuthField
                  id={isLogin ? "echoo-login-username" : "echoo-signup-username"}
                  label={isLogin ? "Username or email" : "Username"}
                  icon={FaUser}
                  error={isLogin && loginError}
                >
                  <input
                    id={isLogin ? "echoo-login-username" : "echoo-signup-username"}
                    type="text"
                    name="username"
                    placeholder={isLogin ? "Enter username" : "Choose a username"}
                    value={formData.username}
                    onChange={handleChange}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    aria-invalid={isLogin && loginError ? "true" : "false"}
                    required
                  />
                </AuthField>

                {!isLogin && (
                  <AuthField id="echoo-signup-email" label="Email address" icon={FaEnvelope}>
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
                  </AuthField>
                )}

                <AuthField
                  id={isLogin ? "echoo-login-password" : "echoo-signup-password"}
                  label="Password"
                  icon={FaLock}
                  error={isLogin ? loginError : passwordInvalid}
                  action={isLogin ? (
                    <button
                      type="button"
                      className="ear-forgot"
                      onClick={() => {
                        setLoginError("");
                        setLoginNotice("");
                        setAction("Forgot Password");
                      }}
                    >
                      Forgot password?
                    </button>
                  ) : null}
                >
                  <input
                    id={isLogin ? "echoo-login-password" : "echoo-signup-password"}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder={isLogin ? "Enter password" : "Create a strong password"}
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    aria-invalid={isLogin ? Boolean(loginError) : passwordInvalid}
                    aria-describedby={isLogin && loginError ? "echoo-login-error" : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="ear-password-toggle"
                    onClick={() => setShowPassword((previous) => !previous)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </AuthField>

                {!isLogin && (
                  <AuthField
                    id="echoo-signup-confirm"
                    label="Confirm password"
                    icon={FaLock}
                    error={passwordsMismatch}
                  >
                    <input
                      id="echoo-signup-confirm"
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmPassword"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      aria-invalid={passwordsMismatch}
                      required
                    />
                    <button
                      type="button"
                      className="ear-password-toggle"
                      onClick={() => setShowConfirmPassword((previous) => !previous)}
                      aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
                      aria-pressed={showConfirmPassword}
                    >
                      {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </AuthField>
                )}

                {!isLogin && !passwordTooShort && !passwordsMismatch && (
                  <p className="ear-helper">Use 8+ characters with uppercase and lowercase letters, a number, and a special character.</p>
                )}
                {passwordTooShort && <p className="ear-error" role="alert">Password must be at least 8 characters.</p>}
                {!passwordTooShort && passwordMissingCombination && (
                  <p className="ear-error" role="alert">Use uppercase and lowercase letters, a number, and a special character.</p>
                )}
                {passwordsMismatch && <p className="ear-error" role="alert">Passwords do not match.</p>}
                {signupError && <p className="ear-error" role="alert">{signupError}</p>}
                {loginError && (
                  <p id="echoo-login-error" className="ear-error" role="alert" aria-live="polite">
                    <FaExclamationCircle aria-hidden="true" /> {loginError}
                  </p>
                )}

                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText={isLogin ? "Logging in..." : "Creating account..."}
                  disabled={!formIsComplete()}
                  className="ear-submit"
                >
                  {isLogin ? "Login" : "Continue"} {!isLogin && <FaArrowRight aria-hidden="true" />}
                </LoadingButton>

                {loginNotice && <p className="ear-notice" role="status">{loginNotice}</p>}

                <p className="ear-auth-switch">
                  {isLogin ? "Don't have an account? " : "Already have an account? "}
                  <button type="button" onClick={isLogin ? switchToSignUp : switchToLogin}>
                    {isLogin ? "Sign up" : "Sign in"}
                  </button>
                </p>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default Register;
