import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  FaChevronDown,
  FaSignOutAlt,
} from "react-icons/fa";

import "./ListenerProfileMenu.css";

const ListenerProfileMenu = ({
  displayName = "Listener",
  profileImage = null,
}) => {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const menuRef = useRef(null);

  const firstName =
    displayName
      ?.trim()
      ?.split(" ")[0] ||
    "Listener";

  useEffect(() => {
    const handleOutsideClick = (
      event
    ) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(
          event.target
        )
      ) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (
      event
    ) => {
      if (
        event.key === "Escape"
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    window.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      window.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(
      "accessToken"
    );

    localStorage.removeItem(
      "refreshToken"
    );

    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "user"
    );

    localStorage.removeItem(
      "profileImage"
    );

    localStorage.removeItem(
      "profileBio"
    );

    localStorage.removeItem(
      "echooRole"
    );

    localStorage.removeItem(
      "echooProfileCompleted"
    );

    localStorage.removeItem(
      "echooOnboardingCompleted"
    );

    localStorage.removeItem(
      "creatorSetup"
    );

    sessionStorage.clear();

    window.location.replace("/");
  };

  return (
    <div
      className="listener-profile-menu-wrap"
      ref={menuRef}
    >
      {menuOpen && (
        <div
          className="listener-profile-dropdown"
          role="menu"
        >
          <button
            type="button"
            className="listener-profile-logout"
            onClick={handleLogout}
            role="menuitem"
          >
            <span className="listener-profile-logout-icon">
              <FaSignOutAlt />
            </span>

            <span className="listener-profile-logout-content">
              <strong>
                Log out
              </strong>

              <small>
                Sign out of Echoo
              </small>
            </span>
          </button>
        </div>
      )}

      <button
        type="button"
        className={`layout-profile ${
          menuOpen
            ? "profile-menu-open"
            : ""
        }`}
        onClick={() =>
          setMenuOpen(
            (previous) =>
              !previous
          )
        }
        aria-expanded={
          menuOpen
        }
        aria-haspopup="menu"
      >
        <div className="layout-profile-image">
          {profileImage ? (
            <img
              src={profileImage}
              alt={displayName}
            />
          ) : (
            <span>
              {firstName
                .charAt(0)
                .toUpperCase()}
            </span>
          )}
        </div>

        <div className="layout-profile-info">
          <strong>
            {firstName}
          </strong>

          <span>
            View profile
          </span>
        </div>

        <FaChevronDown
          className="listener-profile-chevron"
        />
      </button>

      <button
        type="button"
        className="listener-profile-logout-direct"
        onClick={handleLogout}
        aria-label="Log out of Echoo"
        title="Log out"
      >
        <span className="listener-profile-logout-direct-icon">
          <FaSignOutAlt />
        </span>
        <span className="listener-profile-logout-direct-label">
          Log out
        </span>
      </button>
    </div>
  );
};

export default ListenerProfileMenu;