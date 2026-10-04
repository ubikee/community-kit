import { useEffect, useRef } from 'react';

export default function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ck-overlay" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="ck-dialog"
      >
        <header className="ck-dialog__head">
          <h2 className="ck-dialog__title">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="ck-dialog__close">
            ×
          </button>
        </header>
        <div className="ck-dialog__body">{children}</div>
      </div>
    </div>
  );
}
