import { Clipboard, Sparkle } from 'lucide-react';

export function InspirationPlaza({ inspirations }) {
  return (
    <section className="inspiration-plaza" aria-label="Inspiration plaza">
      <div className="section-heading">
        <Sparkle size={17} />
        <h2>Inspiration Plaza</h2>
      </div>

      <div className="inspiration-row">
        {inspirations.map((item) => (
          <article className="inspiration-card" key={item.id}>
            <strong>{item.label}</strong>
            <p>{item.prompt}</p>
            <button type="button">
              <Clipboard size={15} />
              Use prompt
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
