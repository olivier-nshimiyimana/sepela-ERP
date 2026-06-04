type RowActionsProps = {
  onEdit: () => void;
  onToggle?: () => void;
  onDelete: () => void;
  toggleLabel?: string;
  busy?: boolean;
};

export function RowActions({ onEdit, onToggle, onDelete, toggleLabel, busy }: RowActionsProps) {
  return (
    <div className="row-actions">
      <button type="button" className="ghost-button sm" onClick={onEdit} disabled={busy}>
        Edit
      </button>
      {onToggle && toggleLabel ? (
        <button type="button" className="ghost-button sm" onClick={onToggle} disabled={busy}>
          {toggleLabel}
        </button>
      ) : null}
      <button type="button" className="danger-button sm" onClick={onDelete} disabled={busy}>
        Delete
      </button>
    </div>
  );
}
