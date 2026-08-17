import React from "react";

import "./AppErrorBoundary.css";

class AppErrorBoundary extends React.Component {
  constructor(
    props
  ) {
    super(
      props
    );

    this.state = {
      hasError:
        false,

      error:
        null,
    };
  }

  static getDerivedStateFromError(
    error
  ) {
    return {
      hasError:
        true,

      error,
    };
  }

  componentDidCatch(
    error,
    info
  ) {
    console.error(
      "Echoo interface error:",
      error,
      info
    );
  }

  retry =
    () => {
      window.location.reload();
    };

  goHome =
    () => {
      window.location.assign(
        "/"
      );
    };

  render() {
    if (
      !this.state
        .hasError
    ) {
      return this.props
        .children;
    }

    return (
      <main
        id="echoo-main-content"
        className="echoo-error-boundary"
        role="alert"
      >
        <div className="echoo-error-boundary-signal">
          <span />
          <span />
          <span />

          <i />
        </div>

        <span className="echoo-error-kicker">
          ECHOO
        </span>

        <h1>
          This part of Echoo
          could not load.
        </h1>

        <p>
          Your session has not
          been intentionally
          cleared. You can retry
          this screen or return
          to Echoo.
        </p>

        <div className="echoo-error-actions">
          <button
            type="button"
            className="primary"
            onClick={
              this.retry
            }
          >
            Try again
          </button>

          <button
            type="button"
            onClick={
              this.goHome
            }
          >
            Go to Echoo
          </button>
        </div>

        {import.meta.env.DEV &&
          this.state
            .error?.message && (
            <details>
              <summary>
                Development error
              </summary>

              <code>
                {
                  this.state
                    .error
                    .message
                }
              </code>
            </details>
          )}
      </main>
    );
  }
}

export default AppErrorBoundary;
