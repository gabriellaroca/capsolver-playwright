import type { Page } from 'playwright-core';
import {
  CapsolverBrowserPlugin,
  type CapsolverBrowserPluginOptions,
} from './browser/capsolver-browser-plugin.js';

/** Adapter tipado para páginas Playwright. */
export class CapsolverPlaywrightPlugin extends CapsolverBrowserPlugin<Page> {
  constructor(options: CapsolverBrowserPluginOptions) {
    super(options);
  }
}
