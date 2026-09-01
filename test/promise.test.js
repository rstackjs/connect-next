import assert from 'node:assert';
import { describe, it } from 'rstack/test';
import request from 'supertest';

import { connect } from '../dist/index.js';

describe('promise support', function () {
  it('should pass a rejected promise value', async function () {
    const app = connect();
    let unexpected = false;

    app.use(async function createError() {
      throw new Error('boom!');
    });
    app.use(function unexpectedMiddleware(_req, _res, _next) {
      unexpected = true;
    });
    app.use(function handleError(err, _req, res, _next) {
      res.statusCode = 500;
      res.end(`caught: ${err.message}`);
    });

    await request(app).get('/').expect(500, 'caught: boom!');
    assert.ok(!unexpected, 'Unexpected middleware invoke');
  });

  it('should pass a non-Error rejection value', async function () {
    const app = connect();

    app.use(function createError() {
      return Promise.reject('boom!');
    });
    app.use(function handleError(err, _req, res, _next) {
      res.statusCode = 500;
      res.end(`caught: ${err}`);
    });

    await request(app).get('/').expect(500, 'caught: boom!');
  });

  it('should create an Error for a rejected promise without a value', async function () {
    const app = connect();

    app.use(function createError() {
      return Promise.reject();
    });
    app.use(function handleError(err, _req, res, _next) {
      assert.ok(err instanceof Error);
      res.statusCode = 500;
      res.end(`caught: ${err.message}`);
    });

    await request(app).get('/').expect(500, 'caught: Rejected promise');
  });

  it('should ignore a resolved promise', async function () {
    const app = connect();
    let unexpected = false;

    app.use(function resolvePromise(_req, res) {
      res.end('resolved');
      return Promise.resolve('value');
    });
    app.use(function unexpectedMiddleware(_req, _res, _next) {
      unexpected = true;
    });

    await request(app).get('/').expect(200, 'resolved');
    assert.ok(!unexpected, 'Unexpected middleware invoke');
  });

  it('should continue when async middleware calls next', async function () {
    const app = connect();

    app.use(async function waitForPromise(_req, _res, next) {
      await Promise.resolve();
      next();
    });
    app.use(function respond(_req, res) {
      res.end('continued');
    });

    await request(app).get('/').expect(200, 'continued');
  });

  it('should support rejected Promise-like values', async function () {
    const app = connect();

    app.use(function createError() {
      return {
        then(_onFulfilled, onRejected) {
          onRejected(new Error('boom!'));
        },
      };
    });
    app.use(function handleError(err, _req, res, _next) {
      res.statusCode = 500;
      res.end(`caught: ${err.message}`);
    });

    await request(app).get('/').expect(500, 'caught: boom!');
  });

  describe('error middleware', function () {
    it('should pass a rejected promise value', async function () {
      const app = connect();

      app.use(function createError() {
        return Promise.reject(new Error('boom!'));
      });
      app.use(async function handleError(err, _req, _res, _next) {
        throw new Error(`caught: ${err.message}`);
      });
      app.use(function handleErrorAgain(err, _req, res, _next) {
        res.statusCode = 500;
        res.end(`caught again: ${err.message}`);
      });

      await request(app).get('/').expect(500, 'caught again: caught: boom!');
    });

    it('should create an Error for a rejected promise without a value', async function () {
      const app = connect();

      app.use(function createError() {
        return Promise.reject(new Error('boom!'));
      });
      app.use(function handleError(err, _req, _res, _next) {
        assert.equal(err.message, 'boom!');
        return Promise.reject();
      });
      app.use(function handleErrorAgain(err, _req, res, _next) {
        assert.ok(err instanceof Error);
        res.statusCode = 500;
        res.end(`caught again: ${err.message}`);
      });

      await request(app).get('/').expect(500, 'caught again: Rejected promise');
    });

    it('should ignore a resolved promise', async function () {
      const app = connect();
      let unexpected = false;

      app.use(function createError() {
        return Promise.reject(new Error('boom!'));
      });
      app.use(function handleError(err, _req, res, _next) {
        res.statusCode = 500;
        res.end(`caught: ${err.message}`);
        return Promise.resolve('value');
      });
      app.use(function unexpectedErrorMiddleware(_err, _req, _res, _next) {
        unexpected = true;
      });

      await request(app).get('/').expect(500, 'caught: boom!');
      assert.ok(!unexpected, 'Unexpected error middleware invoke');
    });
  });
});
