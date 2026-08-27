export class CapsolverError extends Error {
  override readonly name: string = 'CapsolverError';
}

export class CapsolverConfigurationError extends CapsolverError {
  override readonly name = 'CapsolverConfigurationError';
}

export class CapsolverApiError extends CapsolverError {
  override readonly name = 'CapsolverApiError';

  constructor(
    message: string,
    readonly errorId: number,
    readonly errorCode?: string | null,
  ) {
    super(message);
  }
}

export class CapsolverHttpError extends CapsolverError {
  override readonly name = 'CapsolverHttpError';

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class CapsolverProtocolError extends CapsolverError {
  override readonly name = 'CapsolverProtocolError';
}

export class CapsolverRequestTimeoutError extends CapsolverError {
  override readonly name = 'CapsolverRequestTimeoutError';
}

export class CapsolverPollingTimeoutError extends CapsolverError {
  override readonly name = 'CapsolverPollingTimeoutError';

  constructor(
    message: string,
    readonly taskId: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export class CapsolverTaskFailedError extends CapsolverError {
  override readonly name = 'CapsolverTaskFailedError';

  constructor(
    message: string,
    readonly taskId: string,
  ) {
    super(message);
  }
}
