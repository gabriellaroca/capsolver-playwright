import { CapsolverClient } from '../capsolver.client.js';
import { CapsolverConfigurationError } from '../capsolver.errors.js';
import type {
  CapsolverClientOptions,
  CapsolverReadyResult,
  RecaptchaOptions,
  RecaptchaSolution,
  SolveTaskOptions,
  TurnstileSolution,
} from '../capsolver.types.js';

interface BrowserPageLike {
  url(): string;
  evaluate<TArgument, TResult>(
    pageFunction: (argument: TArgument) => TResult | Promise<TResult>,
    argument: TArgument,
  ): Promise<TResult>;
}

export interface CapsolverBrowserPluginOptions
  extends CapsolverClientOptions {
  /**
   * Restringe o plugin aos hosts informados e seus subdomínios.
   * Quando omitido, não há restrição adicional.
   */
  allowedHosts?: readonly string[];
}

export interface BrowserTokenInjectionResult {
  updatedFields: number;
  callbackCalled: boolean;
}

export interface BrowserSolveResult<TSolution extends object>
  extends CapsolverReadyResult<TSolution> {
  injection?: BrowserTokenInjectionResult;
}

export interface BrowserCaptchaOptions extends SolveTaskOptions {
  websiteURL?: string;
  websiteKey?: string;
  /** Atualiza o campo de resposta na página. Padrão: true. */
  injectToken?: boolean;
  /** Caminho exato de uma função global, por exemplo app.onCaptchaSolved. */
  callbackName?: string;
}

export interface RecaptchaV2BrowserOptions
  extends BrowserCaptchaOptions,
    RecaptchaOptions {
  proxy?: string;
  enterprise?: boolean;
}

export interface RecaptchaV3BrowserOptions
  extends BrowserCaptchaOptions {
  pageAction?: string;
  minScore?: number;
  enterprisePayload?: Record<string, string | number | boolean | null>;
  isSession?: boolean;
  apiDomain?: string;
  proxy?: string;
  enterprise?: boolean;
}

export interface TurnstileBrowserOptions extends BrowserCaptchaOptions {
  metadata?: {
    action?: string;
    cdata?: string;
  };
}

/** Implementação comum usada pelos adapters tipados de Playwright e Puppeteer. */
export class CapsolverBrowserPlugin<TPage> {
  protected readonly client: CapsolverClient;
  private readonly allowedHosts: readonly string[];

  constructor(options: CapsolverBrowserPluginOptions) {
    const { allowedHosts = [], ...clientOptions } = options;
    this.client = new CapsolverClient(clientOptions);
    this.allowedHosts = allowedHosts.map((host) =>
      host.trim().toLowerCase().replace(/^\./, ''),
    );
  }

  get capsolver(): CapsolverClient {
    return this.client;
  }

  async detectRecaptchaV2SiteKey(page: TPage): Promise<string | null> {
    this.assertAllowedPage(page);
    return this.asPage(page).evaluate(() => {
      const widget = document.querySelector<HTMLElement>(
        '.g-recaptcha[data-sitekey], [data-sitekey][class*="recaptcha"]',
      );
      const directKey = widget?.dataset.sitekey;
      if (directKey) return directKey;

      const frame = document.querySelector<HTMLIFrameElement>(
        'iframe[src*="recaptcha"]',
      );
      if (!frame?.src) return null;

      try {
        return new URL(frame.src).searchParams.get('k');
      } catch {
        return null;
      }
    }, undefined);
  }

  async detectTurnstileSiteKey(page: TPage): Promise<string | null> {
    this.assertAllowedPage(page);
    return this.asPage(page).evaluate(() => {
      const widget = document.querySelector<HTMLElement>(
        '.cf-turnstile[data-sitekey]',
      );
      return widget?.dataset.sitekey ?? null;
    }, undefined);
  }

  async solveRecaptchaV2(
    page: TPage,
    options: RecaptchaV2BrowserOptions = {},
  ): Promise<BrowserSolveResult<RecaptchaSolution>> {
    const websiteURL = this.resolveWebsiteUrl(page, options.websiteURL);
    const websiteKey =
      options.websiteKey ?? (await this.detectRecaptchaV2SiteKey(page));
    if (!websiteKey) {
      throw new CapsolverConfigurationError(
        'Não foi possível localizar a websiteKey do reCAPTCHA v2.',
      );
    }

    const {
      websiteURL: _websiteURL,
      websiteKey: _websiteKey,
      injectToken = true,
      callbackName,
      proxy,
      enterprise = false,
      signal,
      callbackUrl,
      pollIntervalMs,
      pollTimeoutMs,
      maxPollAttempts,
      ...recaptchaOptions
    } = options;

    const type = proxy
      ? enterprise
        ? 'ReCaptchaV2EnterpriseTask'
        : 'ReCaptchaV2Task'
      : enterprise
        ? 'ReCaptchaV2EnterpriseTaskProxyLess'
        : 'ReCaptchaV2TaskProxyLess';

    const result = await this.client.solve<RecaptchaSolution>({
      type,
      websiteURL,
      websiteKey,
      ...(proxy ? { proxy } : {}),
      ...recaptchaOptions,
    }, {
      ...(signal ? { signal } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
      ...(pollIntervalMs ? { pollIntervalMs } : {}),
      ...(pollTimeoutMs ? { pollTimeoutMs } : {}),
      ...(maxPollAttempts ? { maxPollAttempts } : {}),
    });

    if (!injectToken) return result;

    const injection = await this.injectRecaptchaToken(
      page,
      result.solution.gRecaptchaResponse,
      callbackName,
    );
    return { ...result, injection };
  }

  async solveRecaptchaV3(
    page: TPage,
    options: RecaptchaV3BrowserOptions,
  ): Promise<BrowserSolveResult<RecaptchaSolution>> {
    const websiteURL = this.resolveWebsiteUrl(page, options.websiteURL);
    const websiteKey = options.websiteKey;
    if (!websiteKey) {
      throw new CapsolverConfigurationError(
        'websiteKey é obrigatória para reCAPTCHA v3.',
      );
    }

    const {
      websiteURL: _websiteURL,
      websiteKey: _websiteKey,
      injectToken = false,
      callbackName,
      proxy,
      enterprise = false,
      signal,
      callbackUrl,
      pollIntervalMs,
      pollTimeoutMs,
      maxPollAttempts,
      ...recaptchaOptions
    } = options;

    const type = proxy
      ? enterprise
        ? 'ReCaptchaV3EnterpriseTask'
        : 'ReCaptchaV3Task'
      : enterprise
        ? 'ReCaptchaV3EnterpriseTaskProxyLess'
        : 'ReCaptchaV3TaskProxyLess';

    const result = await this.client.solve<RecaptchaSolution>({
      type,
      websiteURL,
      websiteKey,
      ...(proxy ? { proxy } : {}),
      ...recaptchaOptions,
    }, {
      ...(signal ? { signal } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
      ...(pollIntervalMs ? { pollIntervalMs } : {}),
      ...(pollTimeoutMs ? { pollTimeoutMs } : {}),
      ...(maxPollAttempts ? { maxPollAttempts } : {}),
    });

    if (!injectToken) return result;

    const injection = await this.injectRecaptchaToken(
      page,
      result.solution.gRecaptchaResponse,
      callbackName,
    );
    return { ...result, injection };
  }

  async solveTurnstile(
    page: TPage,
    options: TurnstileBrowserOptions = {},
  ): Promise<BrowserSolveResult<TurnstileSolution>> {
    const websiteURL = this.resolveWebsiteUrl(page, options.websiteURL);
    const websiteKey =
      options.websiteKey ?? (await this.detectTurnstileSiteKey(page));
    if (!websiteKey) {
      throw new CapsolverConfigurationError(
        'Não foi possível localizar a websiteKey do Turnstile.',
      );
    }

    const {
      websiteURL: _websiteURL,
      websiteKey: _websiteKey,
      injectToken = true,
      callbackName,
      signal,
      callbackUrl,
      pollIntervalMs,
      pollTimeoutMs,
      maxPollAttempts,
      metadata,
    } = options;

    const result = await this.client.solve<TurnstileSolution>({
      type: 'AntiTurnstileTaskProxyLess',
      websiteURL,
      websiteKey,
      ...(metadata ? { metadata } : {}),
    }, {
      ...(signal ? { signal } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
      ...(pollIntervalMs ? { pollIntervalMs } : {}),
      ...(pollTimeoutMs ? { pollTimeoutMs } : {}),
      ...(maxPollAttempts ? { maxPollAttempts } : {}),
    });

    if (!injectToken) return result;

    const injection = await this.injectToken(page, {
      token: result.solution.token,
      selectors: [
        'input[name="cf-turnstile-response"]',
        'textarea[name="cf-turnstile-response"]',
      ],
      ...(callbackName ? { callbackName } : {}),
    });
    return { ...result, injection };
  }

  protected async injectRecaptchaToken(
    page: TPage,
    token: string,
    callbackName?: string,
  ): Promise<BrowserTokenInjectionResult> {
    return this.injectToken(page, {
      token,
      selectors: [
        'textarea[name="g-recaptcha-response"]',
        'input[name="g-recaptcha-response"]',
      ],
      ...(callbackName ? { callbackName } : {}),
    });
  }

  private async injectToken(
    page: TPage,
    payload: {
      token: string;
      selectors: string[];
      callbackName?: string;
    },
  ): Promise<BrowserTokenInjectionResult> {
    this.assertAllowedPage(page);
    return this.asPage(page).evaluate((input) => {
      const fields = Array.from(
        document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          input.selectors.join(','),
        ),
      );

      for (const field of fields) {
        field.value = input.token;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }

      let callbackCalled = false;
      if (input.callbackName) {
        const parts = input.callbackName.split('.').filter(Boolean);
        let owner: unknown = window;
        let candidate: unknown = window;

        for (const part of parts) {
          owner = candidate;
          candidate =
            typeof candidate === 'object' && candidate !== null
              ? (candidate as Record<string, unknown>)[part]
              : undefined;
        }

        if (typeof candidate === 'function') {
          candidate.call(owner, input.token);
          callbackCalled = true;
        }
      }

      return { updatedFields: fields.length, callbackCalled };
    }, payload);
  }

  private resolveWebsiteUrl(page: TPage, supplied?: string): string {
    this.assertAllowedPage(page);
    const websiteURL = supplied ?? this.asPage(page).url();
    this.assertAllowedUrl(websiteURL);
    return websiteURL;
  }

  private assertAllowedPage(page: TPage): void {
    this.assertAllowedUrl(this.asPage(page).url());
  }

  private assertAllowedUrl(rawUrl: string): void {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new CapsolverConfigurationError(
        `A página atual não possui uma URL HTTP válida: ${rawUrl}`,
      );
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new CapsolverConfigurationError(
        `A página atual não possui uma URL HTTP válida: ${rawUrl}`,
      );
    }

    if (this.allowedHosts.length === 0) return;

    const hostname = url.hostname.toLowerCase();

    const allowed = this.allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
    if (!allowed) {
      throw new CapsolverConfigurationError(
        `O host ${hostname} não está autorizado em allowedHosts.`,
      );
    }
  }

  private asPage(page: TPage): BrowserPageLike {
    if (!page || typeof page !== 'object') {
      throw new CapsolverConfigurationError('Uma página do browser é obrigatória.');
    }
    return page as unknown as BrowserPageLike;
  }
}
