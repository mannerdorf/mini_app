import { trackPublicPage } from './lib/publicMetrika';

// Standalone route landings have no React shell; use the same public-only policy.
trackPublicPage(window.location.href, document.title);
