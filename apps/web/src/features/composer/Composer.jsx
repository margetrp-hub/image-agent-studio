import { ImagePlus, Send, SlidersHorizontal, WandSparkles } from 'lucide-react';

export function Composer({ presets }) {
  return (
    <section className="composer-panel" aria-label="Prompt composer">
      <div className="mode-strip" role="tablist" aria-label="Composer modes">
        {presets.map((preset, index) => (
          <button
            aria-selected={index === 0}
            className={index === 0 ? 'mode-pill is-active' : 'mode-pill'}
            key={preset}
            role="tab"
            type="button"
          >
            {preset}
          </button>
        ))}
      </div>

      <label className="prompt-box">
        <span>Prompt</span>
        <textarea
          defaultValue="Create a controlled product image with crisp surface detail, accurate packaging geometry, and a soft studio shadow."
          rows={4}
        />
      </label>

      <div className="composer-actions">
        <button type="button">
          <ImagePlus size={17} />
          Add reference
        </button>
        <button type="button">
          <SlidersHorizontal size={17} />
          Parameters
        </button>
        <button className="primary-action" type="button">
          <WandSparkles size={17} />
          Generate
          <Send size={15} />
        </button>
      </div>
    </section>
  );
}
