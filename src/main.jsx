import { render } from 'preact';
import { App } from './app.jsx';
import { setupPwa } from './pwa.js';
import { setupViewport } from './viewport.js';
import { applyTheme, watchSystemTheme } from './theme.js';
import { restoreLastView, rememberViews } from './viewstate.js';
import './styles.css';

// Back to where you were, before anything renders.
restoreLastView();
rememberViews();
applyTheme();
watchSystemTheme();
setupPwa();
setupViewport();
render(<App />, document.getElementById('app'));
