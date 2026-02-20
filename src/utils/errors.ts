export class AppError extends Error {
    constructor(
        public readonly message: string,
        public readonly statusCode: number = 500,
        public readonly code?: string
    ) {
        super(message);
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
        super(
            id ? `${resource} with id '${id}' not found` : `${resource} not found`,
            404,
            'NOT_FOUND'
        );
    }
}

export class InsufficientBalanceError extends AppError {
    constructor(available: string, requested: string) {
        super(
            `Insufficient balance. Available: ${available}, Requested: ${requested}`,
            422,
            'INSUFFICIENT_BALANCE'
        );
    }
}

export class IdempotencyConflictError extends AppError {
    constructor(key: string) {
        super(`Idempotency key '${key}' already used`, 409, 'IDEMPOTENCY_CONFLICT');
    }
}

export class ValidationError extends AppError {
    constructor(message: string) {
        super(message, 400, 'VALIDATION_ERROR');
    }
}
