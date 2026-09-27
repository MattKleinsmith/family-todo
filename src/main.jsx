import { render } from 'preact';
import { App } from './app.jsx';
import { setupPwa } from './pwa.js';
import './styles.css';

setupPwa();
render(<App />, document.getElementById('app'));
