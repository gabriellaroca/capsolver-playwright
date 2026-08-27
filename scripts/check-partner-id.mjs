import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const partnerSource = await readFile(
  new URL('../src/internal/partner.ts', import.meta.url),
  'utf8',
);

if (partnerSource.includes("'REPLACE_WITH_APPROVED_APP_ID'")) {
  throw new Error(
    'Defina o appId aprovado em src/internal/partner.ts antes de publicar.',
  );
}
