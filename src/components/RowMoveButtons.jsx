export default function RowMoveButtons({ index, total, onMoveUp, onMoveDown, stopPropagation }) {
  const wrapClick = (fn) => (e) => {
    if (stopPropagation) e.stopPropagation();
    fn();
  };

  return (
    <div className="row-order-btns">
      <button
        type="button"
        className="row-order-btn"
        disabled={index <= 0}
        onClick={wrapClick(onMoveUp)}
        title="Move up"
        aria-label="Move row up"
      >
        ▲
      </button>
      <button
        type="button"
        className="row-order-btn"
        disabled={index >= total - 1}
        onClick={wrapClick(onMoveDown)}
        title="Move down"
        aria-label="Move row down"
      >
        ▼
      </button>
    </div>
  );
}
