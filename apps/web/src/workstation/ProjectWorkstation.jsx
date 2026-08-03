import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Aperture,
  Archive,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Focus,
  Film,
  FolderKanban,
  Globe2,
  Grid2X2,
  Hand,
  ImagePlus,
  Layers3,
  Menu,
  Minus,
  MoreHorizontal,
  MousePointer2,
  PanelRight,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Sparkles,
  WandSparkles,
  X
} from 'lucide-react';
import { clearSession, createStudioApi, loadSession, saveSession } from '../api/studioApi.js';
import { GenerationConfirmDialog } from './generation/GenerationConfirmDialog.jsx';
import { GenerationStatus } from './generation/GenerationStatus.jsx';
import { useGenerationWorkspace } from './generation/useGenerationWorkspace.js';
import { ProviderSettingsDialog } from './settings/ProviderSettingsDialog.jsx';
import { useWorkstationI18n } from './i18n.jsx';

const modes = ['single', 'canvas', 'video'];

const contextTabs = ['reference', 'prompt', 'inspector'];

function projectView(project) {
  const constraints = project.promptConstraints || {};
  const scenes = (project.scenes || []).map((scene, sceneIndex) => ({
    id: scene.id,
    number: String(scene.order || sceneIndex + 1).padStart(2, '0'),
    title: scene.title,
    description: scene.summary || '',
    continuity: scene.promptConstraints?.continuity || [],
    shots: (scene.shots || []).map((shot, shotIndex) => ({
      id: shot.id,
      code: `${String(scene.order || sceneIndex + 1).padStart(2, '0')}${String.fromCharCode(65 + shotIndex)}`,
      title: shot.title,
      frame: shot.promptConstraints?.camera || shot.mediaType || '',
      duration: shot.mediaType === 'video' ? `${shot.durationSeconds || 0}s` : '',
      status: shot.status || 'draft',
      image: null,
      prompt: shot.prompt || shot.intent || ''
    }))
  }));
  return {
    id: project.id,
    name: project.name,
    client: project.status || 'draft',
    updatedAt: project.updatedAt || '',
    color: '#376c58',
    cover: null,
    description: project.description || '',
    single: null,
    canvas: { boards: [] },
    scenes,
    references: [],
    prompt: {
      positive: [constraints.goal, constraints.subject, constraints.setting, constraints.composition, constraints.style, constraints.lighting, constraints.camera].filter(Boolean).join(', '),
      negative: (constraints.negative || []).join(', '),
      tokens: constraints.continuity || []
    }
  };
}

function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={`pw-icon-button ${className}`} title={label} type="button" {...props}>
      {children}
      <span className="pw-sr-only">{label}</span>
    </button>
  );
}

function ProjectHub({ activeProjectId, projects, onCreateProject, onOpenSettings, onProjectSelect, open, onClose }) {
  const { language, t, toggleLanguage } = useWorkstationI18n();
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState('');

  async function submitProject(event) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    await onCreateProject(name);
    setProjectName('');
    setCreating(false);
  }

  return (
    <aside className={`pw-project-hub ${open ? 'is-open' : ''}`} aria-label={t('hub.aria')}>
      <div className="pw-hub-brand">
        <span className="pw-brand-mark" aria-hidden="true"><Aperture size={19} /></span>
        <div><strong>Image Agent</strong><span>Studio</span></div>
        <IconButton className="pw-mobile-only" label={t('hub.close')} onClick={onClose}><X size={18} /></IconButton>
      </div>

      <div className="pw-hub-heading">
        <span>{t('hub.workspace')}</span>
        <div><h1>{t('hub.projects')}</h1><IconButton label={t('hub.createProject')} onClick={() => setCreating((value) => !value)}><Plus size={17} /></IconButton></div>
      </div>

      {creating && (
        <form className="pw-create-project" onSubmit={submitProject}>
          <input autoFocus onChange={(event) => setProjectName(event.target.value)} placeholder={t('hub.projectName')} value={projectName} />
          <button type="submit">{t('hub.create')}</button>
        </form>
      )}

      <label className="pw-search">
        <Search size={15} />
        <input aria-label={t('hub.search')} placeholder={t('hub.search')} type="search" />
      </label>

      <nav className="pw-hub-nav" aria-label={t('hub.navigation')}>
        <button className="is-active" type="button"><FolderKanban size={16} />{t('hub.active')}<span>{projects.length}</span></button>
        <button type="button"><Grid2X2 size={16} />{t('hub.all')}<span>{projects.length}</span></button>
        <button type="button"><Archive size={16} />{t('hub.archive')}</button>
      </nav>

      <div className="pw-project-list">
        <div className="pw-list-label"><span>{t('hub.recent')}</span><button type="button">{t('hub.viewAll')}</button></div>
        {projects.map((project) => (
          <button
            className={`pw-project-item ${project.id === activeProjectId ? 'is-active' : ''}`}
            key={project.id}
            onClick={() => { onProjectSelect(project.id); onClose(); }}
            type="button"
          >
            {project.cover ? <img alt="" src={project.cover} /> : <span className="pw-project-cover"><FolderKanban size={17} /></span>}
            <span><strong>{project.name}</strong><small>{t(`status.${project.client}`) === `status.${project.client}` ? project.client : t(`status.${project.client}`)}</small><small>{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(language) : t('project.justNow')}</small></span>
            <i style={{ background: project.color }} />
          </button>
        ))}
        {!projects.length && <p className="pw-project-list-empty">{t('hub.empty')}</p>}
      </div>

      <div className="pw-hub-footer">
        <button className="pw-settings-link" onClick={() => { onClose(); onOpenSettings(); }} type="button"><Settings2 size={16} />{t('hub.settings')}</button>
        <button aria-label={t('language.switch')} className="pw-language-switch" onClick={toggleLanguage} title={t('language.switch')} type="button"><Globe2 size={16} /><span>{t('language.short')}</span></button>
      </div>
    </aside>
  );
}

function Topbar({ activeProject, jobStatus, mode, onLogout, onModeChange, onOpenProjects, onOpenContext, user }) {
  const { t } = useWorkstationI18n();
  const translatedJobStatus = t(`status.${jobStatus}`);
  const translatedProjectStatus = t(`status.${activeProject.client}`);
  return (
    <header className="pw-topbar">
      <div className="pw-topbar-project">
        <IconButton className="pw-nav-trigger" label={t('top.openHub')} onClick={onOpenProjects}><Menu size={18} /></IconButton>
        <div><span>{translatedProjectStatus === `status.${activeProject.client}` ? activeProject.client : translatedProjectStatus}</span><strong>{activeProject.name}</strong></div>
        <span className={`pw-saved-state ${jobStatus ? 'is-working' : ''}`}><Check size={12} />{jobStatus ? t('top.job', { status: translatedJobStatus === `status.${jobStatus}` ? jobStatus : translatedJobStatus }) : t('top.saved')}</span>
      </div>

      <div className="pw-mode-switch" role="tablist" aria-label={t('top.modes')}>
        {modes.map((item) => (
          <button
            aria-selected={mode === item}
            className={mode === item ? 'is-active' : ''}
            key={item}
            onClick={() => onModeChange(item)}
            role="tab"
            type="button"
          >
            {t(`mode.${item}`)}
          </button>
        ))}
      </div>

      <div className="pw-topbar-actions">
        <IconButton className="pw-context-trigger" label={t('top.openContext')} onClick={onOpenContext}><PanelRight size={18} /></IconButton>
        <button className="pw-secondary-command" type="button"><Download size={16} /><span>{t('top.export')}</span></button>
        <button className="pw-primary-command" type="button"><Sparkles size={16} /><span>{t('top.render')}</span></button>
        <IconButton label={t('top.signOut', { name: user?.displayName || user?.email || '' })} onClick={onLogout}><X size={17} /></IconButton>
      </div>
    </header>
  );
}

function SingleMode({ project }) {
  const { t } = useWorkstationI18n();
  const single = project.single;
  const [variant, setVariant] = useState(0);

  if (!single) {
    return <WorkspaceEmpty icon={<ImagePlus size={24} />} title={t('single.emptyTitle')} text={t('single.emptyText')} />;
  }
  const images = [single.image, ...single.variants];

  return (
    <section className="pw-single-mode" aria-label={t('single.aria')}>
      <div className="pw-single-stage">
        <img alt={single.title} src={images[variant]} />
        <div className="pw-image-status"><Check size={13} />{t('single.selected')}</div>
        <div className="pw-image-nav">
          <IconButton label={t('single.previous')} onClick={() => setVariant((variant - 1 + images.length) % images.length)}><ChevronLeft size={17} /></IconButton>
          <span>{variant + 1} / {images.length}</span>
          <IconButton label={t('single.next')} onClick={() => setVariant((variant + 1) % images.length)}><ChevronRight size={17} /></IconButton>
        </div>
      </div>
      <div className="pw-single-details">
        <div><span>{t('single.current')}</span><h2>{single.title}</h2><p>2048 x 2560 / v12 / Seed 84219</p></div>
        <IconButton label={t('single.more')}><MoreHorizontal size={18} /></IconButton>
      </div>
      <div className="pw-variant-strip" aria-label={t('single.variants')}>
        {images.map((image, index) => (
          <button className={variant === index ? 'is-active' : ''} key={image} onClick={() => setVariant(index)} type="button">
            <img alt="" src={image} /><span>V{index + 9}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CanvasMode({ project }) {
  const { t } = useWorkstationI18n();
  if (!project.canvas.boards.length) {
    return <WorkspaceEmpty icon={<Layers3 size={24} />} title={t('canvas.ready')} text={t('canvas.readyText')} />;
  }
  return (
    <section className="pw-canvas-mode" aria-label={t('canvas.aria')}>
      <div className="pw-canvas-toolbar" aria-label={t('canvas.tools')}>
        <IconButton className="is-active" label={t('canvas.select')}><MousePointer2 size={16} /></IconButton>
        <IconButton label={t('canvas.pan')}><Hand size={16} /></IconButton>
        <span />
        <IconButton label={t('canvas.zoomOut')}><Minus size={16} /></IconButton>
        <small>64%</small>
        <IconButton label={t('canvas.zoomIn')}><Plus size={16} /></IconButton>
        <IconButton label={t('canvas.fit')}><Focus size={16} /></IconButton>
      </div>
      <div className="pw-canvas-surface">
        <svg aria-hidden="true" className="pw-canvas-links" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M 35 30 C 45 28, 49 23, 58 24" />
          <path d="M 68 40 C 70 50, 62 57, 58 62" />
        </svg>
        {project.canvas.boards.map((board, index) => (
          <article className={`pw-canvas-board board-${index + 1}`} key={board.id}>
            <img alt={board.title} src={board.image} />
            <div><strong>{board.title}</strong><span>{board.note}</span></div>
          </article>
        ))}
        <button className="pw-canvas-note" type="button"><Layers3 size={15} /><span>{t('canvas.note')}</span></button>
      </div>
    </section>
  );
}

function VideoMode({ resultMedia }) {
  const { t } = useWorkstationI18n();
  const videos = resultMedia.filter((item) => item.mediaType?.startsWith('video/'));
  if (!videos.length) {
    return <WorkspaceEmpty icon={<Film size={24} />} title={t('video.emptyTitle')} text={t('video.emptyText')} />;
  }
  const current = videos[0];

  return (
    <section className="pw-video-mode" aria-label={t('video.aria')}>
      <div className="pw-video-stage">
        <video controls playsInline preload="metadata" src={current.objectUrl} />
      </div>
      <div className="pw-video-details">
        <div><span>{t('video.latest')}</span><h2>{t('video.output')}</h2><p>{current.filename}</p></div>
        <a download={current.filename} href={current.objectUrl}><Download size={16} />{t('video.download')}</a>
      </div>
    </section>
  );
}

function WorkspaceEmpty({ icon, title, text }) {
  return <section className="pw-workspace-empty">{icon}<h2>{title}</h2><p>{text}</p></section>;
}

function Composer({ canGenerate, generation, mode, onGenerate, onOpenPrompt }) {
  const { t } = useWorkstationI18n();
  const fallback = t('composer.fallback');
  const [prompt, setPrompt] = useState(fallback);
  const previousFallback = useRef(fallback);

  useEffect(() => {
    setPrompt((current) => current === previousFallback.current ? fallback : current);
    previousFallback.current = fallback;
  }, [fallback]);

  return (
    <section className="pw-composer" aria-label={t('composer.aria')}>
      <GenerationStatus
        error={generation.error}
        job={generation.job}
        onCancel={generation.onCancel}
        onDismiss={generation.onDismiss}
        resultImages={generation.resultImages}
      />
      <div className="pw-composer-context">
        <span>{t('composer.generation', { mode: t(`mode.${mode}`) })}</span>
        <button type="button">{mode === 'video' ? t('composer.videoRatio') : t('composer.imageRatio')} <ChevronDown size={14} /></button>
      </div>
      <div className="pw-composer-row">
        <IconButton label={t('composer.addReference')}><ImagePlus size={18} /></IconButton>
        <label>
          <span className="pw-sr-only">{t('composer.prompt')}</span>
          <textarea onChange={(event) => setPrompt(event.target.value)} rows={2} value={prompt} />
        </label>
        <button className="pw-generate-button" disabled={!canGenerate || generation.busy} onClick={() => onGenerate(prompt)} title={canGenerate ? t('composer.review') : t('composer.needProject')} type="button"><WandSparkles size={18} /><span>{generation.busy ? t('composer.starting') : t('composer.generate')}</span><ArrowUp size={16} /></button>
      </div>
      <div className="pw-composer-meta">
        <button onClick={onOpenPrompt} type="button"><Settings2 size={14} />{t('composer.controls')}</button>
        <span>{generation.provider ? `${generation.provider.label} / ${generation.model || t('composer.syncModel')}` : t('composer.chooseProvider')}</span>
      </div>
    </section>
  );
}

function ReferencePanel({ references }) {
  const { t } = useWorkstationI18n();
  return (
    <>
      <div className="pw-context-heading"><div><span>{t('reference.pinned')}</span><h2>{t('reference.set')}</h2></div><IconButton label={t('reference.attach')}><Paperclip size={17} /></IconButton></div>
      <div className="pw-reference-list">
        {references.map((reference) => (
          <article className="pw-reference-item" key={reference.id}>
            <img alt="" src={reference.image} />
            <div><strong>{reference.name}</strong><span>{reference.role}</span></div>
            <label><span>{t('reference.influence')}</span><input aria-label={`${reference.name} ${t('reference.influence')}`} max="100" min="0" readOnly type="range" value={reference.weight} /><b>{reference.weight}</b></label>
          </article>
        ))}
        {!references.length && <p className="pw-context-empty">{t('reference.empty')}</p>}
      </div>
      <button className="pw-wide-command" type="button"><ImagePlus size={16} />{t('reference.add')}</button>
    </>
  );
}

function PromptPanel({ prompt }) {
  const { t } = useWorkstationI18n();
  return (
    <>
      <div className="pw-context-heading"><div><span>{t('prompt.projectLanguage')}</span><h2>{t('prompt.continuity')}</h2></div><IconButton label={t('prompt.copyAnchors')}><Copy size={16} /></IconButton></div>
      <section className="pw-prompt-block"><span>{t('prompt.positive')}</span><p>{prompt.positive || t('prompt.noPositive')}</p></section>
      <section className="pw-prompt-block"><span>{t('prompt.negative')}</span><p>{prompt.negative || t('prompt.noNegative')}</p></section>
      <section className="pw-prompt-block"><span>{t('prompt.locked')}</span><div className="pw-token-list">{prompt.tokens.map((token) => <button key={token} type="button"><Check size={12} />{token}</button>)}</div></section>
      <section className="pw-continuity-score"><div><span>{t('prompt.score')}</span><strong>92%</strong></div><progress max="100" value="92">92%</progress></section>
    </>
  );
}

function InspectorPanel({ scene, shot }) {
  const { t } = useWorkstationI18n();
  if (!scene || !shot) return <p className="pw-context-empty">{t('inspector.empty')}</p>;
  return (
    <>
      <div className="pw-context-heading"><div><span>{t('inspector.selection')}</span><h2>{shot.code} / {shot.title}</h2></div></div>
      <dl className="pw-inspector-list">
        <div><dt>{t('inspector.scene')}</dt><dd>{scene.number} / {scene.title}</dd></div>
        <div><dt>{t('inspector.framing')}</dt><dd>{shot.frame || t('media.image')}</dd></div>
        <div><dt>{t('inspector.duration')}</dt><dd>{shot.duration || t('media.still')}</dd></div>
        <div><dt>{t('inspector.status')}</dt><dd><i />{t(`status.${shot.status.toLowerCase()}`)}</dd></div>
        <div><dt>{t('inspector.seed')}</dt><dd>84219</dd></div>
        <div><dt>{t('inspector.model')}</dt><dd>FLUX 1.1 Pro</dd></div>
        <div><dt>{t('inspector.canvas')}</dt><dd>2048 x 2560</dd></div>
      </dl>
      <button className="pw-wide-command" type="button">{t('inspector.details')} <ChevronRight size={16} /></button>
    </>
  );
}

function ContextRail({ activeTab, onTabChange, project, scene, shot, open, onClose }) {
  const { t } = useWorkstationI18n();
  return (
    <aside className={`pw-context-rail ${open ? 'is-open' : ''}`} aria-label={t('context.aria')}>
      <div className="pw-context-tabs" role="tablist" aria-label={t('context.panels')}>
        {contextTabs.map((tab) => <button aria-selected={activeTab === tab} className={activeTab === tab ? 'is-active' : ''} key={tab} onClick={() => onTabChange(tab)} role="tab" type="button">{t(`context.${tab}`)}</button>)}
        <IconButton className="pw-mobile-only" label={t('context.close')} onClick={onClose}><X size={17} /></IconButton>
      </div>
      <div className="pw-context-body">
        {activeTab === 'reference' && <ReferencePanel references={project.references} />}
        {activeTab === 'prompt' && <PromptPanel prompt={project.prompt} />}
        {activeTab === 'inspector' && <InspectorPanel scene={scene} shot={shot} />}
      </div>
    </aside>
  );
}

function AuthGate({ error, loading, onSubmit }) {
  const { t, toggleLanguage } = useWorkstationI18n();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="pw-auth-shell">
      <section className="pw-auth-panel">
        <span className="pw-brand-mark" aria-hidden="true"><Aperture size={22} /></span>
        <div className="pw-auth-heading"><span>Image Agent Studio</span><h1>{mode === 'login' ? t('auth.welcome') : t('auth.createWorkspace')}</h1></div>
        <div className="pw-auth-switch" role="tablist">
          <button className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')} type="button">{t('auth.signIn')}</button>
          <button className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')} type="button">{t('auth.register')}</button>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(mode, form); }}>
          {mode === 'register' && <label><span>{t('auth.name')}</span><input autoComplete="name" onChange={(event) => update('displayName', event.target.value)} required value={form.displayName} /></label>}
          <label><span>{t('auth.email')}</span><input autoComplete="email" onChange={(event) => update('email', event.target.value)} required type="email" value={form.email} /></label>
          <label><span>{t('auth.password')}</span><input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} onChange={(event) => update('password', event.target.value)} required type="password" value={form.password} /></label>
          {error && <p className="pw-auth-error" role="alert">{error}</p>}
          <button className="pw-auth-submit" disabled={loading} type="submit">{loading ? t('auth.connecting') : mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}</button>
        </form>
        <button aria-label={t('language.switch')} className="pw-auth-language" onClick={toggleLanguage} type="button"><Globe2 size={15} />{t('language.name')}</button>
      </section>
    </main>
  );
}

export function ProjectWorkstation() {
  const { t } = useWorkstationI18n();
  const api = useMemo(() => createStudioApi(), []);
  const [authState, setAuthState] = useState(loadSession() ? 'checking' : 'unauthenticated');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [user, setUser] = useState(loadSession()?.user || null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [mode, setMode] = useState('single');
  const [activeTab, setActiveTab] = useState('reference');
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [selectedShotId, setSelectedShotId] = useState('');
  const [projectHubOpen, setProjectHubOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const generation = useGenerationWorkspace({ api, authState, mode });

  async function loadWorkspace() {
    const [mePayload, projectPayload] = await Promise.all([api.getMe(), api.listProjects()]);
    const nextProjects = (projectPayload.projects || []).map(projectView);
    setUser(mePayload.user);
    setProjects(nextProjects);
    setActiveProjectId((current) => nextProjects.some((project) => project.id === current) ? current : nextProjects[0]?.id || '');
    setAuthState('authenticated');
  }

  useEffect(() => {
    if (!loadSession()) return;
    loadWorkspace().catch((error) => {
      clearSession();
      setAuthError(error.message);
      setAuthState('unauthenticated');
    });
  }, []);

  const blankProject = useMemo(() => ({
    id: '', name: t('project.new'), client: t('project.workspace'), updatedAt: '', color: '#376c58', cover: null,
    single: null, canvas: { boards: [] }, scenes: [], references: [],
    prompt: { positive: '', negative: '', tokens: [] }
  }), [t]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? blankProject;
  const activeScene = useMemo(() => activeProject.scenes.find((scene) => scene.id === selectedSceneId) ?? activeProject.scenes[0] ?? null, [activeProject, selectedSceneId]);
  const activeShot = activeScene?.shots.find((shot) => shot.id === selectedShotId) ?? activeScene?.shots[0] ?? null;

  useEffect(() => {
    setSelectedSceneId(activeProject.scenes[0]?.id || '');
    setSelectedShotId(activeProject.scenes[0]?.shots[0]?.id || '');
  }, [activeProject.id]);

  useEffect(() => {
    let disposed = false;
    generation.setJob(null);
    if (authState !== 'authenticated' || !activeProjectId) return undefined;
    api.listJobs(activeProjectId).then((payload) => {
      if (disposed) return;
      const expectedMode = mode === 'video' ? 'video' : 'image';
      const jobs = payload.jobs || [];
      generation.setJob(jobs.find((item) => item.mode === expectedMode) || null);
    }).catch((error) => {
      if (!disposed) generation.setJob(null);
      if (!disposed) setAuthError(error.message);
    });
    return () => { disposed = true; };
  }, [api, authState, activeProjectId, mode]);

  async function authenticate(authMode, input) {
    setAuthBusy(true);
    setAuthError('');
    try {
      const payload = authMode === 'login' ? await api.login(input) : await api.register(input);
      saveSession(payload);
      setUser(payload.user);
      await loadWorkspace();
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function createProject(name) {
    const payload = await api.createProject({ name });
    const created = projectView(payload.project);
    setProjects((current) => [created, ...current]);
    setActiveProjectId(created.id);
  }

  function logout() {
    clearSession();
    generation.reset();
    setProjects([]);
    setUser(null);
    setAuthState('unauthenticated');
  }

  function openPromptPanel() {
    setActiveTab('prompt');
    setContextOpen(true);
  }

  function requestGeneration(prompt) {
    setGenerationPrompt(prompt);
    generation.requestGeneration();
  }

  if (authState === 'checking') {
    return <main className="pw-loading-screen"><Aperture size={25} /><span>{t('common.loading')}</span></main>;
  }
  if (authState !== 'authenticated') {
    return <AuthGate error={authError} loading={authBusy} onSubmit={authenticate} />;
  }

  return (
    <div className="pw-workstation">
      <ProjectHub activeProjectId={activeProjectId} onClose={() => setProjectHubOpen(false)} onCreateProject={createProject} onOpenSettings={() => generation.setSettingsOpen(true)} onProjectSelect={setActiveProjectId} open={projectHubOpen} projects={projects} />
      <div className="pw-work-area">
        <Topbar activeProject={activeProject} jobStatus={generation.job?.stage || generation.job?.status || ''} mode={mode} onLogout={logout} onModeChange={setMode} onOpenContext={() => setContextOpen(true)} onOpenProjects={() => setProjectHubOpen(true)} user={user} />
        <main className="pw-center-stage">
          <div className="pw-mode-viewport">
            {mode === 'single' && <SingleMode project={activeProject} />}
            {mode === 'canvas' && <CanvasMode project={activeProject} />}
            {mode === 'video' && <VideoMode resultMedia={generation.resultImages} />}
          </div>
          <Composer
            canGenerate={Boolean(activeProject.id)}
            generation={{
              busy: generation.generationBusy,
              error: generation.generationError,
              job: generation.job,
              model: generation.selectedModel,
              onCancel: generation.cancelGeneration,
              onDismiss: generation.dismissGeneration,
              provider: generation.selectedProvider,
              resultImages: generation.resultImages
            }}
            key={mode}
            mode={mode}
            onGenerate={requestGeneration}
            onOpenPrompt={openPromptPanel}
          />
        </main>
      </div>
      <ContextRail activeTab={activeTab} onClose={() => setContextOpen(false)} onTabChange={setActiveTab} open={contextOpen} project={activeProject} scene={activeScene} shot={activeShot} />
      {(projectHubOpen || contextOpen) && <button aria-label={t('panel.closeOpen')} className="pw-backdrop" onClick={() => { setProjectHubOpen(false); setContextOpen(false); }} type="button" />}
      <ProviderSettingsDialog
        availableModels={generation.models}
        busy={generation.providerBusy}
        connections={generation.connections}
        error={generation.providerError}
        onClose={() => generation.setSettingsOpen(false)}
        onCreate={generation.createConnection}
        onDelete={generation.deleteConnection}
        onSelect={generation.selectProvider}
        onSync={generation.syncProvider}
        open={generation.settingsOpen}
        selectedModel={generation.selectedModel}
        selectedProvider={generation.selectedProviderId}
        sharedProviders={generation.sharedProviders}
      />
      <GenerationConfirmDialog
        busy={generation.generationBusy}
        error={generation.generationError}
        models={generation.models}
        onClose={() => generation.setConfirmationOpen(false)}
        mode={mode}
        onConfirm={(options) => generation.confirmGeneration({ projectId: activeProject.id, prompt: generationPrompt, mode, options }).catch(() => {})}
        open={generation.confirmationOpen}
        prompt={generationPrompt}
        provider={generation.selectedProvider}
        selectedModel={generation.selectedModel}
      />
    </div>
  );
}
