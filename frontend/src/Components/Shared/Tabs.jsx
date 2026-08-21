import { useId } from 'react';

import './SharedPrimitives.css';

const Tabs = ({ items = [], value, onChange, ariaLabel = 'Sections', className = '' }) => {
  const id = useId();

  return (
    <div className={`echoo-ui-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            id={`${id}-${item.value}`}
            className={`echoo-ui-tab${active ? ' is-active' : ''}`}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange?.(item.value)}
          >
            {item.icon && <span className="echoo-ui-tab__icon" aria-hidden="true">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;
