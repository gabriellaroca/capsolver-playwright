export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue | undefined };
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface CapsolverClientOptions {
  /** Chave da conta CapSolver pertencente à aplicação consumidora. */
  clientKey: string;
  /** Sobrescreve o endpoint apenas para testes ou ambientes controlados. */
  baseUrl?: string;
  /** Timeout individual de cada chamada HTTP. Padrão: 30 segundos. */
  requestTimeoutMs?: number;
  /** Intervalo padrão entre consultas de resultado. Padrão: 3 segundos. */
  pollIntervalMs?: number;
  /** Janela total de polling. Máximo oficial: 5 minutos. */
  pollTimeoutMs?: number;
  /** Quantidade máxima de consultas por tarefa. Máximo oficial: 120. */
  maxPollAttempts?: number;
}

export interface ProxyFields {
  /** Formato aceito pelo CapSolver, por exemplo http:ip:port:user:password. */
  proxy: string;
}

export interface WebsiteTaskFields {
  websiteURL: string;
  websiteKey: string;
}

export interface RecaptchaOptions {
  pageAction?: string;
  recaptchaDataSValue?: string;
  enterprisePayload?: JsonObject;
  isInvisible?: boolean;
  isSession?: boolean;
  apiDomain?: string;
}

export type ReCaptchaV2TaskProxyLess = WebsiteTaskFields &
  RecaptchaOptions & {
    type: 'ReCaptchaV2TaskProxyLess';
  };

export type ReCaptchaV2Task = WebsiteTaskFields &
  RecaptchaOptions &
  ProxyFields & {
    type: 'ReCaptchaV2Task' | 'ReCaptchaV2EnterpriseTask';
  };

export type ReCaptchaV2EnterpriseTaskProxyLess = WebsiteTaskFields &
  RecaptchaOptions & {
    type: 'ReCaptchaV2EnterpriseTaskProxyLess';
  };

export type ReCaptchaV3TaskProxyLess = WebsiteTaskFields & {
  type: 'ReCaptchaV3TaskProxyLess' | 'ReCaptchaV3EnterpriseTaskProxyLess';
  pageAction?: string;
  minScore?: number;
  enterprisePayload?: JsonObject;
  isSession?: boolean;
  apiDomain?: string;
}

export type ReCaptchaV3Task = WebsiteTaskFields &
  ProxyFields & {
    type: 'ReCaptchaV3Task' | 'ReCaptchaV3EnterpriseTask';
    pageAction?: string;
    minScore?: number;
    enterprisePayload?: JsonObject;
    isSession?: boolean;
    apiDomain?: string;
  };

export interface AntiTurnstileTaskProxyLess extends WebsiteTaskFields {
  type: 'AntiTurnstileTaskProxyLess';
  metadata?: {
    action?: string;
    cdata?: string;
  };
}

export interface ImageToTextTask {
  type: 'ImageToTextTask';
  /** Conteúdo da imagem codificado em base64, sem o prefixo data URI. */
  body: string;
  module?: string;
  score?: number;
  case?: boolean;
}

export type KnownCapsolverTask =
  | ReCaptchaV2TaskProxyLess
  | ReCaptchaV2Task
  | ReCaptchaV2EnterpriseTaskProxyLess
  | ReCaptchaV3TaskProxyLess
  | ReCaptchaV3Task
  | AntiTurnstileTaskProxyLess
  | ImageToTextTask;

/** Permite usar tipos novos do CapSolver sem aguardar uma atualização da lib. */
export type CustomCapsolverTask<
  TType extends string = string,
  TFields extends object = Record<string, JsonValue | undefined>,
> = TFields & { type: TType };

export type CapsolverTask = KnownCapsolverTask | CustomCapsolverTask;

export type CapsolverTaskStatus =
  | 'idle'
  | 'processing'
  | 'ready'
  | 'failed';

export interface CapsolverApiResponse {
  errorId: number;
  errorCode?: string | null;
  errorDescription?: string | null;
}

export interface CapsolverTaskResponse<
  TSolution extends object = JsonObject,
> extends CapsolverApiResponse {
  taskId?: string;
  status?: CapsolverTaskStatus;
  solution?: TSolution;
}

export interface CapsolverReadyResult<
  TSolution extends object = JsonObject,
> extends CapsolverApiResponse {
  taskId: string;
  status: 'ready';
  solution: TSolution;
}

export interface CapsolverPackage {
  packageId: string;
  type: number;
  title: string;
  numberOfCalls: number;
  status: number;
  token: string;
  expireTime: number;
}

export interface CapsolverBalanceResponse extends CapsolverApiResponse {
  balance: number;
  packages?: CapsolverPackage[];
}

export interface CreateTaskOptions {
  callbackUrl?: string;
  signal?: AbortSignal;
}

export interface WaitForTaskOptions {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  maxPollAttempts?: number;
  signal?: AbortSignal;
}

export interface SolveTaskOptions
  extends CreateTaskOptions,
    WaitForTaskOptions {}

export interface RecaptchaSolution extends JsonObject {
  gRecaptchaResponse: string;
  userAgent?: string;
  secChUa?: string;
  createTime?: number;
  'recaptcha-ca-t'?: string;
  'recaptcha-ca-e'?: string;
}

export interface TurnstileSolution extends JsonObject {
  token: string;
  type?: string;
  userAgent?: string;
}

export interface ImageToTextSolution extends JsonObject {
  text: string;
}
