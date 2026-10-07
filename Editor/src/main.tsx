import { createRoot } from 'react-dom/client';
import { AutomationPreview } from './editor/AutomationPreview';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('uiePreview') === '1' ? <AutomationPreview /> : <App />);
