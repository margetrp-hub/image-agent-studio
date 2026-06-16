import {
  Aperture,
  Bell,
  Command,
  Download,
  PanelLeft,
  Sparkles
} from 'lucide-react';
import { CanvasWorkspace } from '../features/canvas-workspace/CanvasWorkspace.jsx';
import { Composer } from '../features/composer/Composer.jsx';
import { InspirationPlaza } from '../features/inspiration-plaza/InspirationPlaza.jsx';
import { ProjectRail } from '../features/project-rail/ProjectRail.jsx';
import { ReferenceRail } from '../features/reference-rail/ReferenceRail.jsx';

export function WorkbenchShell({ workspace }) {
  return (
    <div className="workbench-shell">
      <header className="topbar" aria-label="Studio workspace header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Aperture size={20} />
          </span>
          <div>
            <strong>Image Agent Studio</strong>
            <span>{workspace.environment}</span>
          </div>
        </div>

        <nav className="topbar-actions" aria-label="Workspace tools">
          <button type="button" title="Toggle project rail">
            <PanelLeft size={18} />
          </button>
          <button type="button" title="Command palette">
            <Command size={18} />
          </button>
          <button type="button" title="Notifications">
            <Bell size={18} />
          </button>
          <button className="primary-action" type="button">
            <Download size={17} />
            Export
          </button>
        </nav>
      </header>

      <main className="workbench-grid">
        <ProjectRail projects={workspace.projects} activeProjectId={workspace.activeProjectId} />

        <section className="center-stage" aria-label="Generation workspace">
          <div className="workspace-heading">
            <div>
              <span className="eyebrow">Live workspace</span>
              <h1>{workspace.title}</h1>
            </div>
            <div className="run-status" aria-label="Active generation status">
              <Sparkles size={16} />
              {workspace.status}
            </div>
          </div>

          <CanvasWorkspace generations={workspace.generations} queue={workspace.queue} />
          <Composer presets={workspace.composerPresets} />
          <InspirationPlaza inspirations={workspace.inspirations} />
        </section>

        <ReferenceRail references={workspace.references} />
      </main>
    </div>
  );
}
