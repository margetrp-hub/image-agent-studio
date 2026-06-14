import { Image, LoaderCircle, Maximize2 } from 'lucide-react';

export function CanvasWorkspace({ generations, queue }) {
  return (
    <section className="canvas-workspace" aria-label="Canvas workspace">
      <div className="canvas-grid">
        {generations.map((generation) => (
          <article className="generation-tile" key={generation.id}>
            <div className="tile-preview" aria-hidden="true">
              <Image size={34} />
            </div>
            <div className="tile-meta">
              <div>
                <strong>{generation.title}</strong>
                <span>{generation.state}</span>
              </div>
              <button type="button" title={`Open ${generation.title}`}>
                <Maximize2 size={16} />
              </button>
            </div>
            <small>{generation.ratio}</small>
          </article>
        ))}
      </div>

      <div className="queue-lane" aria-label="Generation queue">
        {queue.map((item) => (
          <div className="queue-item" key={item.id}>
            <LoaderCircle size={16} />
            <span>{item.prompt}</span>
            <progress max="100" value={item.progress}>
              {item.progress}%
            </progress>
          </div>
        ))}
      </div>
    </section>
  );
}
