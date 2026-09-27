import { render } from 'preact';
import { App } from './app.jsx';
import { setupPwa } from './pwa.js';
import { setupViewport } from './viewport.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import './styles.css';

applyTheme();
watchSystemTheme();
setupPwa();
setupViewport();
render(<App />, document.getElementById('app'));
