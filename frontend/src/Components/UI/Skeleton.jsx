
import './UI.css';

const SkeletonCard = () => {
  return (
    <div className="echoo-skeleton-card">
      <div className="echoo-skeleton echoo-skeleton-cover" />

      <div className="echoo-skeleton-card-body">
        <div className="echoo-skeleton echoo-skeleton-title" />

        <div className="echoo-skeleton echoo-skeleton-text" />

        <div className="echoo-skeleton echoo-skeleton-text short" />
      </div>
    </div>
  );
};

const SkeletonRow = () => {
  return (
    <div className="echoo-skeleton-row">
      <div className="echoo-skeleton echoo-skeleton-avatar" />

      <div className="echoo-skeleton-row-body">
        <div className="echoo-skeleton echoo-skeleton-title" />

        <div className="echoo-skeleton echoo-skeleton-text short" />
      </div>

      <div className="echoo-skeleton echoo-skeleton-action" />
    </div>
  );
};

const Skeleton = ({
  type = 'card',
  count = 4,
}) => {
  const items =
    Array.from({
      length: count,
    });

  if (
    type === 'row'
  ) {
    return (
      <div className="echoo-skeleton-list">
        {items.map(
          (
            _,
            index
          ) => (
            <SkeletonRow
              key={
                index
              }
            />
          )
        )}
      </div>
    );
  }

  return (
    <div className="echoo-skeleton-grid">
      {items.map(
        (
          _,
          index
        ) => (
          <SkeletonCard
            key={index}
          />
        )
      )}
    </div>
  );
};

export default Skeleton;