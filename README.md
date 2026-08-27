# @gabriellb438/capsolver-playwright

Plugin independente do CapSolver para Playwright. Não usa NestJS e não depende
do plugin Puppeteer.

## Instalação

```bash
pnpm add @gabriellb438/capsolver-playwright playwright
```

## Uso

```ts
import { chromium } from 'playwright';
import { CapsolverPlaywrightPlugin } from '@gabriellb438/capsolver-playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

const capsolver = new CapsolverPlaywrightPlugin({
  clientKey: process.env.CAPSOLVER_CLIENT_KEY!,
  allowedHosts: ['example.com'],
});

await page.goto('https://example.com/login');

const result = await capsolver.solveRecaptchaV2(page, {
  callbackName: 'app.onCaptchaSolved',
});

console.log(result.solution.gRecaptchaResponse);
await browser.close();
```

Também estão disponíveis `solveRecaptchaV3`, `solveTurnstile`, detecção de
site key, injeção opcional do token e o cliente de baixo nível em
`plugin.capsolver`.

O plugin não envia formulários nem executa cliques automaticamente.

## Desenvolvimento

```bash
pnpm install
pnpm validate
```