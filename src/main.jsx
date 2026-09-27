import { render } from 'preact';
import { App } from './app.jsx';
import { setupPwa } from './pwa.js';
import { setupViewport } from './viewport.js';
import './styles.css';

setupPwa();
setupViewport();
render(<App />, document.getElementById('app'));
