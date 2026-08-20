
import {
  FaHeadphones,
} from 'react-icons/fa';

import './UI.css';

const EchooLoader = ({
  message = 'Loading...',
  subtext = '',
  fullPage = false,
  compact = false,
}) => {
  return (
    <div
      className={`echoo-loader ${
        fullPage
          ? 'echoo-loader-full'
          : ''
      } ${
        compact
          ? 'echoo-loader-compact'
          : ''
      }`}
    >
      <div className="echoo-loader-mark">
        <div className="echoo-loader-ring" />

        <div className="echoo-loader-logo">
          <FaHeadphones />
        </div>
      </div>

      {message && (
        <strong className="echoo-loader-title">
          {message}
        </strong>
      )}

      {subtext && (
        <span className="echoo-loader-subtext">
          {subtext}
        </span>
      )}
    </div>
  );
};

export default EchooLoader;