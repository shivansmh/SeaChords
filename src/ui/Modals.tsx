import type { ReactNode } from 'react';

export function Modal({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: string; rows: [string, string][] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th colSpan={2}>{head}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b]) => (
          <tr key={a}>
            <td>{a}</td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GesturesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Gestures" onClose={onClose}>
      <div className="tables">
        <Table
          head="Left hand"
          rows={[
            ['1–5 extended fingers', 'Scale degree 1–5'],
            ['Closed fist', 'Degree 6'],
            ['Thumb only', 'Degree 7'],
            ['Wrist top / middle / bottom', '+1 / base / −1 octave'],
          ]}
        />
        <Table
          head="Right hand"
          rows={[
            ['Fist or thumb only', 'Mute and release'],
            ['1 finger', 'Triad'],
            ['2 fingers', '7th'],
            ['3 fingers', '9th'],
            ['4 fingers', 'Suspended'],
            ['5 fingers', 'Wide spread'],
          ]}
        />
      </div>
      <Table
        head="Keys"
        rows={[
          ['Space', 'Start or stop camera'],
          ['D', 'Debug'],
          ['H', 'Gestures'],
          ['Esc', 'Close'],
        ]}
      />
      <button className="btn" onClick={onClose} autoFocus>
        Close
      </button>
    </Modal>
  );
}

export function HandCheckModal({
  onConfirm,
  onSwap,
}: {
  onConfirm: () => void;
  onSwap: () => void;
}) {
  return (
    <Modal label="Hand check" onClose={onConfirm}>
      <p>Your hands look reversed.</p>
      <div className="tables">
        <button className="btn" onClick={onConfirm} autoFocus>
          Confirm
        </button>
        <button className="btn" onClick={onSwap}>
          Swap hands
        </button>
      </div>
    </Modal>
  );
}
