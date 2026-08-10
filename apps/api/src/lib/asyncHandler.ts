import { NextFunction, Request, Response } from "express";

/**
 * Express 4 doesn't catch rejected promises from async handlers — an
 * unawaited rejection just hangs the request. Wrap every handler that
 * awaits the (now Prisma-backed, async) store layer in this so errors
 * reach the error middleware instead of hanging or crashing the process.
 */
export function asyncHandler<Req extends Request = Request>(fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Req, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
