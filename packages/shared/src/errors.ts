/**
 * Typed domain errors mapped centrally to transport codes
 * (CONTRIBUTING.md §1.8, DEVELOPMENT.md §5). Never swallow; never leak details.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
  /** Client-safe representation: generic code + message, no internals. */
  toPublicShape(): { error: { code: string; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}

export class NotFoundError extends DomainError {
  constructor(resource = "resource") {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ForbiddenError extends DomainError {
  constructor(reason = "forbidden") {
    super(reason, "FORBIDDEN", 403);
  }
}

export class ValidationError extends DomainError {
  constructor(detail: string) {
    super(detail, "VALIDATION_ERROR", 400);
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(upstream: string) {
    // Generic client-facing message; upstream name goes to logs only.
    super("upstream service unavailable", "UPSTREAM_UNAVAILABLE", 503);
    this.upstream = upstream;
  }
  readonly upstream: string;
}
