import {
  CAPSOLVER_MAX_POLL_ATTEMPTS,
  CAPSOLVER_MAX_POLL_TIMEOUT_MS,
  DEFAULT_CAPSOLVER_BASE_URL,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from './capsolver.constants.js';
import {
  CapsolverApiError,
  CapsolverConfigurationError,
  CapsolverHttpError,
  CapsolverPollingTimeoutError,
  CapsolverProtocolError,
  CapsolverRequestTimeoutError,
  CapsolverTaskFailedError,
} from './capsolver.errors.js';
import type {
  CapsolverApiResponse,
  CapsolverBalanceResponse,
  CapsolverClientOptions,
  CapsolverReadyResult,
  CapsolverTask,
  CapsolverTaskResponse,
  CreateTaskOptions,
  JsonObject,
  SolveTaskOptions,
  WaitForTaskOptions,
} from './capsolver.types.js';
import { CAPSOLVER_PARTNER_APP_ID } from './internal/partner.js';

interface ResolvedOptions {
  clientKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  maxPollAttempts: number;
}

export class CapsolverClient {
  private readonly options: ResolvedOptions;

  constructor(options: CapsolverClientOptions) {
    this.options = this.resolveOptions(options);
  }

  async getBalance(signal?: AbortSignal): Promise<CapsolverBalanceResponse> {
    return this.post<CapsolverBalanceResponse>(
      '/getBalance',
      { clientKey: this.options.clientKey },
      signal,
    );
  }

  async createTask<
    TSolution extends object = JsonObject,
    TTask extends CapsolverTask = CapsolverTask,
  >(
    task: TTask,
    options: CreateTaskOptions = {},
  ): Promise<CapsolverTaskResponse<TSolution>> {
    this.assertTask(task);

    const response = await this.post<CapsolverTaskResponse<TSolution>>(
      '/createTask',
      {
        clientKey: this.options.clientKey,
        appId: CAPSOLVER_PARTNER_APP_ID,
        task,
        ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
      },
      options.signal,
    );

    if (!response.taskId) {
      throw new CapsolverProtocolError(
        'O CapSolver respondeu sem taskId ao criar a tarefa.',
      );
    }

    return response;
  }

  async getTaskResult<TSolution extends object = JsonObject>(
    taskId: string,
    signal?: AbortSignal,
  ): Promise<CapsolverTaskResponse<TSolution>> {
    this.assertNonEmptyString(taskId, 'taskId');

    return this.post<CapsolverTaskResponse<TSolution>>(
      '/getTaskResult',
      { clientKey: this.options.clientKey, taskId },
      signal,
    );
  }

  async getToken<
    TSolution extends object = JsonObject,
    TTask extends CapsolverTask = CapsolverTask,
  >(
    task: TTask,
    options: CreateTaskOptions = {},
  ): Promise<CapsolverReadyResult<TSolution>> {
    this.assertTask(task);

    const response = await this.post<CapsolverTaskResponse<TSolution>>(
      '/getToken',
      {
        clientKey: this.options.clientKey,
        appId: CAPSOLVER_PARTNER_APP_ID,
        task,
        ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
      },
      options.signal,
    );

    return this.toReadyResult(response);
  }

  async solve<
    TSolution extends object = JsonObject,
    TTask extends CapsolverTask = CapsolverTask,
  >(
    task: TTask,
    options: SolveTaskOptions = {},
  ): Promise<CapsolverReadyResult<TSolution>> {
    const created = await this.createTask<TSolution, TTask>(task, options);

    if (created.status === 'ready') {
      return this.toReadyResult(created);
    }

    return this.waitForTask<TSolution>(created.taskId as string, options);
  }

  async waitForTask<TSolution extends object = JsonObject>(
    taskId: string,
    options: WaitForTaskOptions = {},
  ): Promise<CapsolverReadyResult<TSolution>> {
    this.assertNonEmptyString(taskId, 'taskId');

    const pollIntervalMs =
      options.pollIntervalMs ?? this.options.pollIntervalMs;
    const pollTimeoutMs = options.pollTimeoutMs ?? this.options.pollTimeoutMs;
    const maxPollAttempts =
      options.maxPollAttempts ?? this.options.maxPollAttempts;

    this.validatePolling(pollIntervalMs, pollTimeoutMs, maxPollAttempts);

    const startedAt = Date.now();
    let attempts = 0;

    while (
      attempts < maxPollAttempts &&
      Date.now() - startedAt < pollTimeoutMs
    ) {
      const elapsed = Date.now() - startedAt;
      await this.delay(
        Math.min(pollIntervalMs, Math.max(0, pollTimeoutMs - elapsed)),
        options.signal,
      );

      if (Date.now() - startedAt >= pollTimeoutMs) {
        break;
      }

      attempts += 1;
      const response = await this.getTaskResult<TSolution>(
        taskId,
        options.signal,
      );

      if (response.status === 'ready') {
        return this.toReadyResult(response, taskId);
      }

      if (response.status === 'failed') {
        throw new CapsolverTaskFailedError(
          `A tarefa ${taskId} falhou no CapSolver.`,
          taskId,
        );
      }
    }

    throw new CapsolverPollingTimeoutError(
      `A tarefa ${taskId} não foi concluída dentro dos limites de polling.`,
      taskId,
      attempts,
    );
  }

  private async post<TResponse extends CapsolverApiResponse>(
    path: string,
    payload: object,
    externalSignal?: AbortSignal,
  ): Promise<TResponse> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = (): void => controller.abort(externalSignal?.reason);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.requestTimeoutMs);

    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new CapsolverHttpError(
          `O CapSolver respondeu com HTTP ${response.status}.`,
          response.status,
        );
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new CapsolverProtocolError(
          'O CapSolver retornou uma resposta que não é JSON válido.',
        );
      }

      if (!this.isApiResponse(parsed)) {
        throw new CapsolverProtocolError(
          'O CapSolver retornou uma estrutura de resposta inválida.',
        );
      }

      this.throwIfApiError(parsed);
      return parsed as TResponse;
    } catch (error: unknown) {
      if (timedOut) {
        throw new CapsolverRequestTimeoutError(
          `A chamada ao CapSolver excedeu ${this.options.requestTimeoutMs} ms.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private toReadyResult<TSolution extends object>(
    response: CapsolverTaskResponse<TSolution>,
    fallbackTaskId?: string,
  ): CapsolverReadyResult<TSolution> {
    const taskId = response.taskId ?? fallbackTaskId;
    if (response.status !== 'ready' || !response.solution || !taskId) {
      throw new CapsolverProtocolError(
        'O CapSolver não retornou uma solução pronta válida.',
      );
    }

    return {
      errorId: response.errorId,
      ...(response.errorCode !== undefined
        ? { errorCode: response.errorCode }
        : {}),
      ...(response.errorDescription !== undefined
        ? { errorDescription: response.errorDescription }
        : {}),
      taskId,
      status: 'ready',
      solution: response.solution,
    };
  }

  private throwIfApiError(response: CapsolverApiResponse): void {
    if (response.errorId > 0) {
      throw new CapsolverApiError(
        response.errorDescription || 'O CapSolver retornou um erro.',
        response.errorId,
        response.errorCode,
      );
    }
  }

  private isApiResponse(value: unknown): value is CapsolverApiResponse {
    return (
      typeof value === 'object' &&
      value !== null &&
      'errorId' in value &&
      typeof value.errorId === 'number'
    );
  }

  private resolveOptions(options: CapsolverClientOptions): ResolvedOptions {
    if (!options || typeof options !== 'object') {
      throw new CapsolverConfigurationError(
        'As opções do CapsolverClient são obrigatórias.',
      );
    }

    this.assertNonEmptyString(options.clientKey, 'clientKey');

    const baseUrl = (options.baseUrl ?? DEFAULT_CAPSOLVER_BASE_URL).replace(
      /\/$/,
      '',
    );
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new CapsolverConfigurationError(
        'baseUrl deve ser uma URL HTTPS válida.',
      );
    }

    const requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const pollIntervalMs =
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const maxPollAttempts =
      options.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

    this.assertPositiveInteger(requestTimeoutMs, 'requestTimeoutMs');
    this.validatePolling(pollIntervalMs, pollTimeoutMs, maxPollAttempts);

    return {
      clientKey: options.clientKey.trim(),
      baseUrl,
      requestTimeoutMs,
      pollIntervalMs,
      pollTimeoutMs,
      maxPollAttempts,
    };
  }

  private validatePolling(
    pollIntervalMs: number,
    pollTimeoutMs: number,
    maxPollAttempts: number,
  ): void {
    this.assertPositiveInteger(pollIntervalMs, 'pollIntervalMs');
    this.assertPositiveInteger(pollTimeoutMs, 'pollTimeoutMs');
    this.assertPositiveInteger(maxPollAttempts, 'maxPollAttempts');

    if (pollTimeoutMs > CAPSOLVER_MAX_POLL_TIMEOUT_MS) {
      throw new CapsolverConfigurationError(
        `pollTimeoutMs não pode exceder ${CAPSOLVER_MAX_POLL_TIMEOUT_MS}.`,
      );
    }

    if (maxPollAttempts > CAPSOLVER_MAX_POLL_ATTEMPTS) {
      throw new CapsolverConfigurationError(
        `maxPollAttempts não pode exceder ${CAPSOLVER_MAX_POLL_ATTEMPTS}.`,
      );
    }
  }

  private assertTask(task: CapsolverTask): void {
    if (!task || typeof task !== 'object') {
      throw new CapsolverConfigurationError('A tarefa é obrigatória.');
    }
    this.assertNonEmptyString(task.type, 'task.type');
  }

  private assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new CapsolverConfigurationError(`${field} deve ser preenchido.`);
    }
  }

  private assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new CapsolverConfigurationError(
        `${field} deve ser um número inteiro positivo.`,
      );
    }
  }

  private async delay(ms: number, signal?: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        return;
      }

      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
