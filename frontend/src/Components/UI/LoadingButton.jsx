import "./UI.css";

const LoadingButton = ({
  children,
  loading = false,
  loadingText = "Please wait...",
  disabled = false,
  className = "",
  type = "button",
  ...props
}) => {
  const finalClassName = [
    className || "echoo-loading-button",
    loading ? "is-loading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...props}
      type={type}
      className={finalClassName}
      disabled={disabled || loading}
    >
      {loading && (
        <span
          className="echoo-button-spinner"
          aria-hidden="true"
        />
      )}

      <span className="echoo-button-text">
        {loading ? loadingText : children}
      </span>
    </button>
  );
};

export default LoadingButton;