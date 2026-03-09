/*!
 * connect
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2015 Douglas Christopher Wilson
 * Copyright(c) 2025 Rstackjs
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

import createDebug from 'debug';
import { EventEmitter } from 'node:events';
import finalhandler from 'finalhandler';
import * as http from 'node:http';
import type { ListenOptions } from 'node:net';
import parseUrl from 'parseurl';

/**
 * Public and internal Connect types.
 */

export interface IncomingMessage extends http.IncomingMessage {
  originalUrl?: http.IncomingMessage['url'] | undefined;
}

export type NextFunction = (err?: any) => void;
export type SimpleHandleFunction = (
  req: IncomingMessage,
  res: http.ServerResponse,
) => void;
export type NextHandleFunction = (
  req: IncomingMessage,
  res: http.ServerResponse,
  next: NextFunction,
) => void;
export type ErrorHandleFunction = (
  err: any,
  req: IncomingMessage,
  res: http.ServerResponse,
  next: NextFunction,
) => void;
export type HandleFunction =
  | SimpleHandleFunction
  | NextHandleFunction
  | ErrorHandleFunction;
export type ServerHandle = HandleFunction | http.Server;

type Middleware = HandleFunction | Server | http.Server;

export interface ServerStackItem {
  route: string;
  handle: ServerHandle;
}

interface Layer extends ServerStackItem {
  handle: HandleFunction;
}

export interface Server extends EventEmitter {
  (req: http.IncomingMessage, res: http.ServerResponse, next?: Function): void;
  route: string;
  stack: ServerStackItem[];
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next?: Function,
  ): void;
  use(fn: NextHandleFunction): Server;
  use(fn: HandleFunction): Server;
  use(fn: http.Server): Server;
  use(route: string, fn: NextHandleFunction): Server;
  use(route: string, fn: HandleFunction): Server;
  use(route: string, fn: http.Server): Server;
  listen(
    port: number,
    hostname?: string,
    backlog?: number,
    callback?: Function,
  ): http.Server;
  listen(port: number, hostname?: string, callback?: Function): http.Server;
  listen(path: string, callback?: Function): http.Server;
  listen(options: ListenOptions, callback?: Function): http.Server;
  listen(handle: unknown, listeningListener?: Function): http.Server;
}

/**
 * Module variables.
 * @private
 */

const debug = createDebug('connect:dispatcher');
const env = process.env.NODE_ENV || 'development';
const defer: typeof setImmediate = setImmediate;

/**
 * Create a new connect server.
 *
 * @return {function}
 * @public
 */

function connect(): Server {
  const app = function (
    req: IncomingMessage,
    res: http.ServerResponse,
    next?: NextFunction,
  ): void {
    app.handle(req, res, next);
  } as Server;

  Object.assign(app, proto);
  Object.assign(app, EventEmitter.prototype);
  app.route = '/';
  app.stack = [];

  return app;
}

export { connect };

const proto = {
  /**
   * Utilize the given middleware `handle` to the given `route`,
   * defaulting to _/_. This "route" is the mount-point for the
   * middleware, when given a value other than _/_ the middleware
   * is only effective when that segment is present in the request's
   * pathname.
   *
   * For example if we were to mount a function at _/admin_, it would
   * be invoked on _/admin_, and _/admin/settings_, however it would
   * not be invoked for _/_, or _/posts_.
   *
   * @param {String|Function|Server} route, callback or server
   * @param {Function|Server} callback or server
   * @return {Server} for chaining
   * @public
   */
  use(this: Server, route: string | Middleware, fn?: Middleware): Server {
    let handle: Middleware | undefined = fn;
    let path = '/';

    // default route to '/'
    if (typeof route === 'string') {
      path = route;
    } else {
      handle = route;
    }

    if (handle === undefined) {
      throw new TypeError('app.use() requires a middleware function');
    }

    // wrap sub-apps
    if (isConnectServer(handle)) {
      const server = handle;
      server.route = path;
      handle = function mountedApp(
        req: IncomingMessage,
        res: http.ServerResponse,
        next: NextFunction,
      ): void {
        server.handle(req, res, next);
      };
    }

    // wrap vanilla http.Servers
    if (isHttpServer(handle)) {
      const requestListener = handle.listeners('request')[0];

      if (typeof requestListener !== 'function') {
        throw new TypeError('http.Server has no request listener');
      }

      handle = requestListener as SimpleHandleFunction;
    }

    if (!isConnectHandle(handle)) {
      throw new TypeError('app.use() requires a middleware function');
    }

    // strip trailing slash
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // add the middleware
    debug('use %s %s', path || '/', handle.name || 'anonymous');
    this.stack.push({ route: path, handle });

    return this;
  },

  /**
   * Handle server requests, punting them down
   * the middleware stack.
   *
   * @private
   */
  handle(
    this: Server,
    req: IncomingMessage,
    res: http.ServerResponse,
    out?: NextFunction,
  ): void {
    let index = 0;
    const protohost = getProtohost(req.url || '') || '';
    let removed = '';
    let slashAdded = false;
    const stack = this.stack as Layer[];

    // final function handler
    const done = (out ??
      finalhandler(req, res, {
        env,
        onerror: logerror,
      })) as NextFunction;

    // store the original URL
    req.originalUrl = req.originalUrl || req.url;

    function next(err?: unknown): void {
      if (slashAdded) {
        req.url = (req.url || '').slice(1);
        slashAdded = false;
      }

      if (removed.length !== 0) {
        req.url = protohost + removed + (req.url || '').slice(protohost.length);
        removed = '';
      }

      // next callback
      const layer = stack[index++];

      // all done
      if (!layer) {
        defer(done, err);
        return;
      }

      // route data
      const path = parseUrl(req)?.pathname || '/';
      const route = layer.route;
      const lowerPath = path.toLowerCase();
      const lowerRoute = route.toLowerCase();

      // skip this layer if the route doesn't match
      if (!lowerPath.startsWith(lowerRoute)) {
        next(err);
        return;
      }

      // skip if route match does not border "/", ".", or end
      const c = path.length > route.length ? path.charAt(route.length) : '';
      if (c !== '' && c !== '/' && c !== '.') {
        next(err);
        return;
      }

      // trim off the part of the url that matches the route
      if (route.length !== 0 && route !== '/') {
        removed = route;
        req.url =
          protohost + (req.url || '').slice(protohost.length + removed.length);

        // ensure leading slash
        if (!protohost && (req.url || '').charAt(0) !== '/') {
          req.url = '/' + (req.url || '');
          slashAdded = true;
        }
      }

      // call the layer handle
      call(layer.handle, route, err, req, res, next);
    }

    next();
  },

  /**
   * Listen for connections.
   *
   * This method takes the same arguments
   * as node's `http.Server#listen()`.
   *
   * HTTP and HTTPS:
   *
   * If you run your application both as HTTP
   * and HTTPS you may wrap them individually,
   * since your Connect "server" is really just
   * a JavaScript `Function`.
   *
   *      import { createServer as createHttpServer } from 'node:http';
   *      import { createServer as createHttpsServer } from 'node:https';
   *      import { connect } from 'connect-next';
   *
   *      const app = connect();
   *
   *      createHttpServer(app).listen(80);
   *      createHttpsServer(options, app).listen(443);
   *
   * @return {http.Server}
   * @api public
   */
  listen(this: Server, ...args: unknown[]): http.Server {
    const server = http.createServer(this);
    return server.listen(...(args as Parameters<http.Server['listen']>));
  },
} satisfies Pick<Server, 'handle' | 'use' | 'listen'>;

/**
 * Invoke a route handle.
 * @private
 */

function call(
  handle: HandleFunction,
  route: string,
  err: unknown,
  req: IncomingMessage,
  res: http.ServerResponse,
  next: NextFunction,
): void {
  const arity = handle.length;
  let error = err;
  const hasError = err !== undefined;

  debug('%s %s : %s', handle.name || '<anonymous>', route, req.originalUrl);

  try {
    if (hasError && arity === 4) {
      // error-handling middleware
      (handle as ErrorHandleFunction)(err, req, res, next);
      return;
    }

    if (!hasError && arity < 4) {
      // request-handling middleware
      (
        handle as (
          req: IncomingMessage,
          res: http.ServerResponse,
          next: NextFunction,
        ) => void
      )(req, res, next);
      return;
    }
  } catch (caughtError: unknown) {
    // replace the error
    error = caughtError;
  }

  // continue
  next(error);
}

/**
 * Log error using console.error.
 *
 * @param {Error} err
 * @private
 */

function logerror(err: unknown): void {
  if (env !== 'test') {
    if (err instanceof Error) {
      console.error(err.stack || err.toString());
      return;
    }

    console.error(String(err));
  }
}

/**
 * Get get protocol + host for a URL.
 *
 * @param {string} url
 * @private
 */

function getProtohost(url: string): string | undefined {
  if (url.length === 0 || url[0] === '/') {
    return undefined;
  }

  const fqdnIndex = url.indexOf('://');

  return fqdnIndex !== -1 && url.lastIndexOf('?', fqdnIndex) === -1
    ? url.slice(0, url.indexOf('/', 3 + fqdnIndex))
    : undefined;
}

function isConnectHandle(value: Middleware): value is HandleFunction {
  return typeof value === 'function';
}

function isConnectServer(value: Middleware): value is Server {
  return (
    typeof value === 'function' &&
    'handle' in value &&
    typeof value.handle === 'function'
  );
}

function isHttpServer(value: Middleware): value is http.Server {
  return value instanceof http.Server;
}
