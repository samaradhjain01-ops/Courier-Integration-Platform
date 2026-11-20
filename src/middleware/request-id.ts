import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header("x-request-id");
  const id = supplied && supplied.length <= 128 ? supplied : randomUUID();
  res.setHeader("x-request-id", id);
  res.locals.requestId = id;
  (req as any).requestId = id;
  next();
}
