import { useRef, useState } from "react";
import "./register.css";
import api from "../../services/api";

import {
  FaArrowLeft,
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
import Toast from "../UI/Toast";

const AuthField = ({ id, label, icon: Icon, error, action, children }) => (
  <div className="ear-field">
    <div className="ear-field-label-row">
      <label htmlFor={id}>{label}</label>
      {action}
    </div>
    <div className={`ear-input-shell ${error ? "has-error" : ""}`}>
      {Icon ? <Icon className="ear-input-icon" aria-hidden="true" /> : null}
      {children}
    </div>
  </div>
);

const emptyVerificationDigits = () => Array(6).fill("");

const Register = ({ onAccountCreated, onLoginSuccess }) => {
  const [action, setAction] = useState("Sign Up");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [showCheckEmail, setShowCheckEmail] = useState(false);
  const [verification, setVerification] = useState(null);
  const [verificationDigits, setVerificationDigits] = useState(emptyVerificationDigits);
  const [verificationError, setVerificationError] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");
  const [verificationOrigin, setVerificationOrigin] = useState("signup");
  const verificationRefs = useRef([]);
  const [toast, setToast] = useState({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const isSignup = action === "Sign Up";
  const isLogin = action === "Login";
  const isForgotPassword = action === "Forgot Password";
  const verificationCode = verificationDigits.join("");

  const passwordTooShort =
    isSignup &&
    formData.password.length > 0 &&
    formData.password.length < 8;
  const passwordMissingCombination =
    isSignup &&
    formData.password.length > 0 &&
    !(/[a-z]/.test(formData.password) &&
      /[A-Z]/.test(formData.password) &&
      /\d/.test(formData.password) &&
      /[^A-Za-z0-9]/.test(formData.password));
  const passwordInvalid = passwordTooShort || passwordMissingCombination;
  const passwordsMismatch =
    isSignup &&
    formData.confirmPassword.length > 0 &&
    formData.password !== formData.confirmPassword;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previousData) => ({ ...previousData, [name]: value }));
    setLoginError("");
    setSignupError("");
  };

  const formIsComplete = () => {
    if (isSignup) {
      return (
        formData.username.trim() !== "" &&
        formData.email.trim() !== "" &&
        !passwordInvalid &&
        formData.confirmPassword !== "" &&
        formData.password === formData.confirmPassword
      );
    }
    if (isLogin) {
      return formData.username.trim() !== "" && formData.password.trim() !== "";
    }
    if (isForgotPassword) return formData.email.trim() !== "";
    return false;
  };

  const saveSession = (response) => {
    const { user, accessToken, refreshToken } = response?.data || {};
    if (!user || !accessToken) {
      throw new Error(
        "Echoo could not start a secure session. Please sign in again."
      );
    }
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", refreshToken || "");
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.removeItem("echooRole");
    localStorage.setItem("echooActiveExperience", "listener");
    return user;
  };

  const openVerification = (nextVerification, origin = "signup") => {
    if (!nextVerification?.userId) {
      throw new Error("Echoo could not start email verification. Please try again.");
    }
    setVerification(nextVerification);
    setVerificationOrigin(origin);
    setVerificationDigits(emptyVerificationDigits());
    setVerificationError("");
    setVerificationNotice("");
    setShowCheckEmail(false);
    window.setTimeout(() => verificationRefs.current[0]?.focus(), 0);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    if (isSignup && !formIsComplete()) {
      if (passwordTooShort) {
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
      if (isSignup) {
        const response = await api.auth.register({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          // The Figma account form intentionally contains username/email/password.
          // Display name is collected on the following Profile screen.
          displayName: formData.username.trim(),
        });

        if (response?.data?.verificationRequired) {
          openVerification(response.data.verification, "signup");
          return;
        }

        const user = saveSession(response);
        onAccountCreated?.(user);
        return;
      }

      if (isLogin) {
        const response = await api.auth.login({
          username: formData.username.trim(),
          password: formData.password,
        });
        const user = saveSession(response);
        onLoginSuccess?.(user);
        return;
      }

      if (isForgotPassword) {
        await api.auth.forgotPassword(formData.email.trim());
        setResetEmail(formData.email.trim());
        setShowCheckEmail(true);
      }
    } catch (error) {
      if (isLogin) {
        if (error?.code === "EMAIL_NOT_VERIFIED" && error?.data?.data?.verification) {
          openVerification(error.data.data.verification, "login");
          return;
        }

        const isCredentialError =
          error?.status === 401 ||
          ["INVALID_CREDENTIALS", "UNAUTHORIZED", "AUTH_INVALID", "LOGIN_FAILED"].includes(error?.code);
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

      if (isSignup) {
        const isNetworkError = error?.message?.toLowerCase() === "failed to fetch";
        const isServiceUnavailable = [502, 503, 504].includes(error?.status);
        setSignupError(
          isNetworkError || isServiceUnavailable
            ? "The Echoo account service is temporarily unavailable. Please try again in a moment."
            : error?.message || "We couldn't create your account. Please try again."
        );
        return;
      }

      if (isForgotPassword && error?.status === 404 && error?.code === "USER_NOT_REGISTERED") {
        setAction("Sign Up");
        setSignupError("This email is not registered. Create your Echoo account below.");
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

  const handleVerificationDigit = (index, rawValue) => {
    const digit = String(rawValue || "").replace(/\D/g, "").slice(-1);
    setVerificationDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    setVerificationError("");
    setVerificationNotice("");
    if (digit && index < 5) verificationRefs.current[index + 1]?.focus();
  };

  const handleVerificationKeyDown = (index, event) => {
    if (event.key === "Backspace" && !verificationDigits[index] && index > 0) {
      verificationRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) verificationRefs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 5) verificationRefs.current[index + 1]?.focus();
  };

  const handleVerificationPaste = (event) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const next = emptyVerificationDigits();
    pasted.split("").forEach((digit, index) => { next[index] = digit; });
    setVerificationDigits(next);
    setVerificationError("");
    verificationRefs.current[Math.min(5, pasted.length - 1)]?.focus();
  };

  const verifyEmail = async (event) => {
    event.preventDefault();
    if (loading || !verification?.userId || verificationCode.length !== 6) return;

    try {
      setLoading(true);
      setVerificationError("");
      setVerificationNotice("");
      const response = await api.auth.verifyEmail({
        userId: verification.userId,
        code: verificationCode,
      });
      const user = saveSession(response);
      setVerification(null);
      if (verificationOrigin === "login") onLoginSuccess?.(user);
      else onAccountCreated?.(user);
    } catch (error) {
      setVerificationError(error?.message || "We couldn't verify that code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (loading || !verification?.userId) return;
    try {
      setLoading(true);
      setVerificationError("");
      const response = await api.auth.resendVerification({
        userId: verification.userId,
        email: verification.email,
      });
      if (response?.data?.verification) {
        setVerification(response.data.verification);
      }
      setVerificationDigits(emptyVerificationDigits());
      setVerificationNotice(response?.data?.message || "A new code has been sent.");
      window.setTimeout(() => verificationRefs.current[0]?.focus(), 0);
    } catch (error) {
      setVerificationError(error?.message || "We couldn't send a new code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetMessages = () => {
    setShowPassword(false);
    setLoginError("");
    setSignupError("");
    setShowCheckEmail(false);
    setVerification(null);
    setVerificationDigits(emptyVerificationDigits());
    setVerificationError("");
    setVerificationNotice("");
  };

  const switchToLogin = () => {
    resetMessages();
    setAction("Login");
  };

  const switchToSignUp = () => {
    resetMessages();
    setAction("Sign Up");
  };

  const openForgotPassword = () => {
    setLoginError("");
    setAction("Forgot Password");
  };

  if (verification) {
    return (
      <main className="echoo-auth-reference is-figma-auth is-login is-verify">
        <section className="ear-visual-panel" aria-label="Echoo audio background">
          <BroadcastLoginVisual logoSrc={EchooLogoImage} mode="login" />
        </section>
        <section className="ear-auth-panel" aria-labelledby="ear-verify-title">
          <div className="ear-auth-card ear-verify-card">
            <img src={EchooLogoImage} alt="" className="ear-login-card-logo" aria-hidden="true" />
            <header className="ear-form-heading">
              <h1 id="ear-verify-title">Verify your email</h1>
              <p>
                Enter the 6-digit code sent to <strong>{verification.email}</strong>.
              </p>
            </header>

            <form className="ear-form ear-verify-form" onSubmit={verifyEmail}>
              <div className="ear-verify-code" onPaste={handleVerificationPaste} aria-label="Verification code">
                {verificationDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { verificationRefs.current[index] = node; }}
                    className="ear-code-box"
                    aria-label={`Verification digit ${index + 1}`}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(event) => handleVerificationDigit(index, event.target.value)}
                    onKeyDown={(event) => handleVerificationKeyDown(index, event)}
                  />
                ))}
              </div>

              {verificationError && <p className="ear-error ear-verify-message" role="alert">{verificationError}</p>}
              {verificationNotice && <p className="ear-notice ear-verify-message" role="status">{verificationNotice}</p>}

              <LoadingButton
                type="submit"
                loading={loading}
                loadingText="Verifying..."
                disabled={verificationCode.length !== 6}
                className="ear-submit"
              >
                Verify
              </LoadingButton>

              <p className="ear-auth-switch ear-verify-resend">
                Didn&apos;t receive the code?{" "}
                <button type="button" onClick={resendVerification} disabled={loading}>
                  Resend code
                </button>
              </p>

              {verificationOrigin === "login" && (
                <button type="button" className="ear-auth-text-button" onClick={switchToLogin}>
                  Back to login
                </button>
              )}
            </form>
          </div>
        </section>
      </main>
    );
  }

  if (showCheckEmail) {
    return (
      <main className="echoo-auth-reference is-figma-auth is-login is-check-email">
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
                We sent a password-reset link to <strong>{resetEmail}</strong>.
                Open the link to create your new password.
              </p>
            </header>
            <button type="button" className="ear-submit" onClick={switchToLogin}>
              Back to login
            </button>
            <button
              type="button"
              className="ear-auth-text-button"
              onClick={() => {
                setShowCheckEmail(false);
                setAction("Forgot Password");
              }}
            >
              Use a different email
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`echoo-auth-reference is-figma-auth ${isSignup ? "is-signup" : "is-login"} ${isForgotPassword ? "is-forgot" : ""}`}>
      <Toast
        open={toast.open}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        onClose={() => setToast((current) => ({ ...current, open: false }))}
      />

      <section className="ear-visual-panel" aria-label="Echoo audio background">
        <BroadcastLoginVisual logoSrc={EchooLogoImage} mode="login" />
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
              <form className="ear-form" onSubmit={handleSubmit} noValidate>
                <AuthField id="echoo-forgot-email" label="Email address" icon={FaEnvelope}>
                  <input
                    id="echoo-forgot-email"
                    type="email"
                    name="email"
                    placeholder="Enter email"
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
              <img src={EchooLogoImage} alt="" className="ear-login-card-logo" aria-hidden="true" />
              <header className="ear-form-heading">
                <h1 id="ear-auth-title">{isLogin ? "Echoo your sound" : "Sign up"}</h1>
                <p>
                  {isLogin
                    ? "Sign in to continue your listening experience"
                    : "Enjoy wonderful listening experience"}
                </p>
              </header>

              <form className="ear-form" onSubmit={handleSubmit} noValidate>
                <AuthField
                  id={isLogin ? "echoo-login-username" : "echoo-signup-username"}
                  label={isLogin ? "Username or email" : "Username"}
                  icon={isLogin ? FaUser : null}
                  error={isLogin && loginError}
                >
                  <input
                    id={isLogin ? "echoo-login-username" : "echoo-signup-username"}
                    type="text"
                    name="username"
                    placeholder={isLogin ? "Enter username" : "Username"}
                    value={formData.username}
                    onChange={handleChange}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    aria-invalid={isLogin && loginError ? "true" : "false"}
                    required
                  />
                </AuthField>

                {isSignup && (
                  <AuthField id="echoo-signup-email" label="Email address" icon={null}>
                    <input
                      id="echoo-signup-email"
                      type="email"
                      name="email"
                      placeholder="Email address"
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
                  icon={isLogin ? FaLock : null}
                  error={isLogin ? loginError : passwordInvalid}
                  action={isLogin ? (
                    <button type="button" className="ear-forgot" onClick={openForgotPassword}>
                      Forgot password?
                    </button>
                  ) : null}
                >
                  <input
                    id={isLogin ? "echoo-login-password" : "echoo-signup-password"}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    placeholder={isLogin ? "Enter password" : "Password"}
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    aria-invalid={isLogin ? Boolean(loginError) : passwordInvalid}
                    aria-describedby={isLogin && loginError ? "echoo-login-error" : undefined}
                    required
                  />
                  {isLogin ? (
                    <button
                      type="button"
                      className="ear-password-toggle"
                      onClick={() => setShowPassword((previous) => !previous)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  ) : null}
                </AuthField>

                {isSignup && (
                  <AuthField id="echoo-signup-confirm" label="Confirm password" icon={null} error={passwordsMismatch}>
                    <input
                      id="echoo-signup-confirm"
                      type="password"
                      name="confirmPassword"
                      placeholder="Confirm password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      aria-invalid={passwordsMismatch}
                      required
                    />
                  </AuthField>
                )}

                {isSignup && !passwordTooShort && !passwordsMismatch && formData.password.length > 0 && (
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

                {isSignup ? (
                  <p className="ear-terms">
                    By signing up, I agree to Echoo’s <span>Terms of Service</span> and <span>Privacy Policy</span>
                  </p>
                ) : null}

                <LoadingButton
                  type="submit"
                  loading={loading}
                  loadingText={isLogin ? "Logging in..." : "Creating account..."}
                  disabled={!formIsComplete()}
                  className="ear-submit"
                >
                  {isLogin ? "Login" : "Create account"}
                </LoadingButton>

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
