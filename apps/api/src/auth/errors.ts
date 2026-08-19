export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED'
  readonly status = 401
  constructor(message = '请先登录') {
    super(message)
  }
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN'
  readonly status = 403
  constructor(message = '当前角色不能执行该操作') {
    super(message)
  }
}

export class AuthConflictError extends Error {
  readonly code = 'AUTH_CONFLICT'
  readonly status = 409
  constructor(message: string) {
    super(message)
  }
}

export class AuthNotFoundError extends Error {
  readonly code = 'NOT_FOUND'
  readonly status = 404
  constructor(message = '用户不存在') {
    super(message)
  }
}

export class RateLimitedError extends Error {
  readonly code = 'RATE_LIMITED'
  readonly status = 429
  constructor(message = '尝试过于频繁，请稍后再试') {
    super(message)
  }
}
