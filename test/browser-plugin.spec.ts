import { afterEach, describe, expect, it, vi } from 'vitest';
import { CapsolverConfigurationError } from '../src/capsolver.errors.js';
import { CAPSOLVER_PARTNER_APP_ID } from '../src/internal/partner.js';
import { CapsolverPlaywrightPlugin } from '../src/index.js';

const jsonResponse = (body: object): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const readyRecaptcha = (): Response =>
  jsonResponse({
    errorId: 0,
    taskId: 'task-browser',
    status: 'ready',
    solution: { gRecaptchaResponse: 'browser-token' },
  });

describe('CapsolverPlaywrightPlugin', () => {
  const Plugin = CapsolverPlaywrightPlugin;
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detecta a site key, resolve e injeta o token', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(readyRecaptcha()),
    );
    vi.stubGlobal('fetch', fetchMock);

    const evaluate = vi
      .fn()
      .mockResolvedValueOnce('detected-site-key')
      .mockResolvedValueOnce({ updatedFields: 1, callbackCalled: true });
    const page = {
      url: () => 'https://app.example.com/login',
      evaluate,
    };
    const plugin = new Plugin({
      clientKey: 'consumer-key',
      allowedHosts: ['example.com'],
    });

    const result = await plugin.solveRecaptchaV2(page as never, {
      callbackName: 'app.onCaptchaSolved',
    });

    expect(result.solution.gRecaptchaResponse).toBe('browser-token');
    expect(result.injection).toEqual({
      updatedFields: 1,
      callbackCalled: true,
    });
    expect(evaluate).toHaveBeenCalledTimes(2);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      clientKey: 'consumer-key',
      appId: CAPSOLVER_PARTNER_APP_ID,
      task: {
        type: 'ReCaptchaV2TaskProxyLess',
        websiteURL: 'https://app.example.com/login',
        websiteKey: 'detected-site-key',
      },
    });
  });

  it('permite somente obter o token sem alterar a página', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(readyRecaptcha())),
    );
    const evaluate = vi.fn();
    const page = {
      url: () => 'https://example.com',
      evaluate,
    };
    const plugin = new Plugin({ clientKey: 'key' });

    const result = await plugin.solveRecaptchaV2(page as never, {
      websiteKey: 'explicit-key',
      injectToken: false,
    });

    expect(result.injection).toBeUndefined();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('bloqueia páginas fora de allowedHosts', async () => {
    const page = {
      url: () => 'https://unauthorized.example.net',
      evaluate: vi.fn(),
    };
    const plugin = new Plugin({
      clientKey: 'key',
      allowedHosts: ['example.com'],
    });

    await expect(
      plugin.solveRecaptchaV2(page as never, { websiteKey: 'key' }),
    ).rejects.toBeInstanceOf(CapsolverConfigurationError);
  });

  it('bloqueia websiteURL explícita fora de allowedHosts', async () => {
    const page = {
      url: () => 'https://example.com',
      evaluate: vi.fn(),
    };
    const plugin = new Plugin({
      clientKey: 'key',
      allowedHosts: ['example.com'],
    });

    await expect(
      plugin.solveRecaptchaV2(page as never, {
        websiteURL: 'https://unauthorized.example.net',
        websiteKey: 'key',
      }),
    ).rejects.toBeInstanceOf(CapsolverConfigurationError);
  });
});
