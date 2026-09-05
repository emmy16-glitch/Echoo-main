import { useState } from "react";
import "./register.css";
import "./auth-reference.css";
import api, { clearAuthTokens } from "../../services/api";

import {
  FaArrowLeft,
  FaArrowRight,
  FaAt,
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
    <div className="ear-progress" aria-label="Account setup, step 1 of 2">
      {["Account", "Profile"].map((label, index) => (
        <div className={`ear-progress-step ${index === 0 ? "is-current" : ""}`} key={label}>
          <span>{index + 1}</span>
          <strong>{label}</strong>
          {index === 0 && <i aria-hidden="true" />}
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
  hint,
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
    {hint && <p className="ear-field-hint">{hint}</p>}
  </div>
);

const Register = ({ onAccountCreated, onLoginSuccess }) => {
  const [action, setAction] = useState("Sign Up");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
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
    identifier: "",
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

  const cleanUsername = formData.username.trim();
  const usernameInvalid =
    action === "Sign Up" &&
    cleanUsername.length > 0 &&
    (cleanUsername.length < 3 || cleanUsername.length > 30);

  const cleanEmail = formData.email.trim();
  const emailInvalid =
    cleanEmail.length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const loginIdentifier = formData.identifier.trim().replace(/^@/, "");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previousData) => ({ ...previousData, [name]: value }));
    if (action === "Login") setLoginError("");
    if (action === "Sign Up") setSignupError("");
  };

  const formIsComplete = () => {
    if (action === "Sign Up") {
      return (
        formData.fullname.trim() !== "" &&
        !fullNameInvalid &&
        cleanUsername !== "" &&
        !usernameInvalid &&
        cleanEmail !== "" &&
        !emailInvalid &&
        !passwordInvalid &&
        formData.confirmPassword !== "" &&
        formData.password === formData.confirmPassword
      );
    }
    if (action === "Login") {
      return loginIdentifier !== "" && formData.password.trim() !== "";
    }
    if (action === "Forgot Password") return cleanEmail !== "" && !emailInvalid;
    return false;
  };

  const saveSession = (response) => {
    const { user, accessToken, refreshToken } = response?.data || {};
    if (!user || !accessToken) {
      throw new Error(
        "Your account was created, but Echoo could not start a secure session. Please sign in again."
      );
    }

    // Authentication replaces the browser account completely. Clear any
    // account-scoped Listener/Creator preferences, cached profile data and
    // session-only broadcast state before persisting the authenticated user.
    clearAuthTokens();
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("token", accessToken);
    if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    return user;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    if (action === "Sign Up" && !formIsComplete()) {
      if (fullNameInvalid) {
        setSignupError("Full name can contain letters, spaces, apostrophes, or hyphens only.");
      } else if (usernameInvalid) {
        setSignupError("Username must be between 3 and 30 characters.");
      } else if (emailInvalid) {
        setSignupError("Enter a valid email address.");
      } else if (passwordTooShort) {
        setSignupError("Password must be at least 8 characters.");
      } else if (passwordMissingCombination) {
        setSignupError("Password must include uppercase and lowercase letters, a number, and a special character.");
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
    setSignupError("");

    try {
      if (action === "Sign Up") {
        const response = await api.auth.register({
          username: cleanUsername,
          email: cleanEmail,
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
          username: loginIdentifier,
          password: formData.password,
        });
        const user = saveSession(response);
        setSuccessUser(user);
        setSuccessState("login");
        return;
      }

      if (action === "Forgot Password") {
        const response = await api.auth.forgotPassword(cleanEmail);
        setToast({
          open: true,
          type: "success",
          title: "Reset link sent",
          message: response?.data?.message || "Check your email for a password-reset link.",
        });
      }
    } catch (error) {
      if (action === "Login") {
        const isCredentialError =
          error?.status === 401 ||
          error?.status === 403 ||
          ["INVALID_CREDENTIALS", "AUTH_INVALID", "LOGIN_FAILED", "UNAUTHORIZED"].includes(error?.code);
        const isNetworkError = error?.message?.toLowerCase() === "failed to fetch";
        setLoginError(
          isCredentialError
            ? "Incorrect username/email or password. Please check your details and try again."
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

  const isLogin = action === "Login";
  const isRecovery = action === "Forgot Password";

  return (
    <main className={`echoo-auth-reference ${isLogin ? "is-login" : isRecovery ? "is-recovery" : "is-signup"}`}>
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <section className="ear-visual-panel" aria-label="About your Echoo account">
        <BroadcastLoginVisual
          logoSrc={EchooLogoImage}
          mode={isLogin || isRecovery ? "login" : "signup"}
        />
      </section>

      <section className="ear-auth-panel" aria-labelledby="ear-auth-title">
        <div className="ear-auth-card">
          {isRecovery ? (
            <>
              <button type="button" className="ear-back" onClick={switchToLogin}>
                <FaArrowLeft aria-hidden="true" /> Back to sign in
              </button>
              <header className="ear-form-heading">
                <h1 id="ear-auth-title">Reset your password</h1>
                <p>Enter the email address attached to your Echoo account.</p>
              </header>
              <form className="ear-form" onSubmit={handleSubmit} noValidate>
                <AuthField id="echoo-recovery-email" label="Email address" icon={FaEnvelope} error={emailInvalid}>
                  <input
                    id="echoo-recovery-email"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={handleChange}
                    autoComplete="email"
                    inputMode="email"
                    aria-invalid={emailInvalid}
                    required
                  />
                </AuthField>
                {emailInvalid && <p className="ear-error" role="alert">Enter a valid email address.</p>}
                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText="Sending reset link..."
                  disabled={!formIsComplete()}
                  className="ear-submit"
                >
                  Send reset link <FaArrowRight aria-hidden="true" />
                </LoadingButton>
              </form>
            </>
          ) : (
            <>
              {!isLogin && <AuthProgress />}
              <header className="ear-form-heading">
                <h1 id="ear-auth-title">
                  {isLogin ? "Sign in to Echoo" : "Create your Echoo account"}
                </h1>
                <p>
                  {isLogin
                    ? "Use your Echoo username or the email address on your account."
                    : "One account gives you Listener access now. You can create your Channel later."}
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
                      placeholder="Your full name"
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

                {isLogin ? (
                  <AuthField
                    id="echoo-login-identifier"
                    label="Username or email"
                    icon={FaAt}
                    error={Boolean(loginError)}
                    hint="Example: @okunlola or name@example.com"
                  >
                    <input
                      id="echoo-login-identifier"
                      type="text"
                      name="identifier"
                      placeholder="@username or email address"
                      value={formData.identifier}
                      onChange={handleChange}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck="false"
                      aria-invalid={Boolean(loginError)}
                      aria-describedby={loginError ? "echoo-login-error" : undefined}
                      required
                    />
                  </AuthField>
                ) : (
                  <AuthField
                    id="echoo-signup-username"
                    label="Username"
                    icon={FaAt}
                    error={usernameInvalid}
                    hint="This becomes your @username on Echoo."
                  >
                    <input
                      id="echoo-signup-username"
                      type="text"
                      name="username"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={handleChange}
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck="false"
                      minLength={3}
                      maxLength={30}
                      aria-invalid={usernameInvalid}
                      required
                    />
                  </AuthField>
                )}

                {!isLogin && usernameInvalid && (
                  <p className="ear-error" role="alert">Username must be between 3 and 30 characters.</p>
                )}

                {!isLogin && (
                  <AuthField
                    id="echoo-signup-email"
                    label="Email address"
                    icon={FaEnvelope}
                    error={emailInvalid}
                    hint="Used for account recovery and security notices."
                  >
                    <input
                      id="echoo-signup-email"
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      autoComplete="email"
                      inputMode="email"
                      aria-invalid={emailInvalid}
                      required
                    />
                  </AuthField>
                )}

                {!isLogin && emailInvalid && (
                  <p className="ear-error" role="alert">Enter a valid email address.</p>
                )}

                <AuthField
                  id={isLogin ? "echoo-login-password" : "echoo-signup-password"}
                  label="Password"
                  icon={FaLock}
                  error={isLogin ? Boolean(loginError) : passwordInvalid}
                  action={isLogin ? (
                    <button
                      type="button"
                      className="ear-forgot"
                      onClick={() => {
                        setLoginError("");
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
                    placeholder={isLogin ? "Enter your password" : "Create a strong password"}
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
                    {showPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
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
                      placeholder="Enter the password again"
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
                      {showConfirmPassword ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
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
                  loadingText={isLogin ? "Signing in..." : "Creating account..."}
                  disabled={!formIsComplete()}
                  className="ear-submit"
                >
                  {isLogin ? "Sign in" : "Continue"} <FaArrowRight aria-hidden="true" />
                </LoadingButton>

                <p className="ear-auth-switch">
                  {isLogin ? "New to Echoo? " : "Already have an account? "}
                  <button type="button" onClick={isLogin ? switchToSignUp : switchToLogin}>
                    {isLogin ? "Create account" : "Sign in"}
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
