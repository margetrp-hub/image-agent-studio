import { WorkbenchShell } from './app/WorkbenchShell.jsx';
import { workspaceMock } from './data/workspaceMock.js';

export function App() {
  return <WorkbenchShell workspace={workspaceMock} />;
}
