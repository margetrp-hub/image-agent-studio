import { ProjectWorkstation } from './workstation/ProjectWorkstation.jsx';
import { WorkstationI18nProvider } from './workstation/i18n.jsx';

export function App() {
  return <WorkstationI18nProvider><ProjectWorkstation /></WorkstationI18nProvider>;
}
