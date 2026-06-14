import { FolderKanban, Plus, Search } from 'lucide-react';

export function ProjectRail({ projects, activeProjectId }) {
  return (
    <aside className="project-rail" aria-label="Projects">
      <div className="rail-toolbar">
        <button type="button" title="Search projects">
          <Search size={17} />
        </button>
        <button type="button" title="Create project">
          <Plus size={17} />
        </button>
      </div>

      <div className="rail-title">
        <FolderKanban size={18} />
        Projects
      </div>

      <div className="project-list">
        {projects.map((project) => (
          <button
            className={project.id === activeProjectId ? 'project-item is-active' : 'project-item'}
            key={project.id}
            type="button"
          >
            <span>{project.name}</span>
            <small>{project.tone}</small>
            <b>{project.count}</b>
          </button>
        ))}
      </div>
    </aside>
  );
}
