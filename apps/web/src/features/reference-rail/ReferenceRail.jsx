import { Link2, Paperclip, SlidersHorizontal } from 'lucide-react';

export function ReferenceRail({ references }) {
  return (
    <aside className="reference-rail" aria-label="References">
      <div className="rail-title">
        <Paperclip size={18} />
        References
      </div>

      <div className="reference-stack">
        {references.map((reference) => (
          <article className="reference-card" key={reference.id}>
            <div className="reference-thumb" aria-hidden="true">
              <Link2 size={22} />
            </div>
            <div>
              <strong>{reference.name}</strong>
              <span>{reference.role}</span>
            </div>
            <label>
              <SlidersHorizontal size={14} />
              <input aria-label={`${reference.name} influence`} max="100" min="0" type="range" value={reference.weight} readOnly />
            </label>
          </article>
        ))}
      </div>
    </aside>
  );
}
