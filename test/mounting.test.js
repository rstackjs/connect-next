import assert from 'node:assert';
import http from 'node:http';
import { beforeEach, describe, it } from 'rstack/test';
import request from 'supertest';

import { connect } from '../dist/index.js';

describe('app.use()', function () {
  var app;

  beforeEach(function () {
    app = connect();
  });

  it('should match all paths with "/"', async function () {
    app.use('/', function (req, res) {
      res.end(req.url);
    });

    await request(app).get('/blog').expect(200, '/blog');
  });

  it('should match full path', async function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    await request(app).get('/blog').expect(200, '/');
  });

  it('should match left-side of path', async function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    await request(app).get('/blog/article/1').expect(200, '/article/1');
  });

  it('should match up to dot', async function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    await request(app).get('/blog.json').expect(200);
  });

  it('should not match shorter path', async function () {
    app.use('/blog-o-rama', function (req, res) {
      res.end(req.url);
    });

    await request(app).get('/blog').expect(404);
  });

  it('should not end match in middle of component', async function () {
    app.use('/blog', function (req, res) {
      res.end(req.url);
    });

    await request(app).get('/blog-o-rama/article/1').expect(404);
  });

  it('should be case insensitive (lower-case route, mixed-case request)', async function () {
    var blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/blog', blog);

    await request(app).get('/BLog').expect('blog');
  });

  it('should be case insensitive (mixed-case route, lower-case request)', async function () {
    var blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/BLog', blog);

    await request(app).get('/blog').expect('blog');
  });

  it('should be case insensitive (mixed-case route, mixed-case request)', async function () {
    var blog = http.createServer(function (req, res) {
      assert.equal(req.url, '/');
      res.end('blog');
    });

    app.use('/BLog', blog);

    await request(app).get('/blOG').expect('blog');
  });

  it('should ignore fn.arity > 4', async function () {
    var invoked = [];

    app.use(function (req, res, next, _a, _b) {
      invoked.push(0);
      next();
    });
    app.use(function (req, res, next) {
      invoked.push(1);
      next(new Error('err'));
    });
    app.use(function (err, req, res, next) {
      invoked.push(2);
      res.end(invoked.join(','));
    });

    await request(app).get('/').expect(200, '1,2');
  });

  describe('with a connect app', function () {
    it('should mount', async function () {
      var blog = connect();

      blog.use(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog', blog);

      await request(app).get('/blog').expect(200, 'blog');
    });

    it('should retain req.originalUrl', async function () {
      var app = connect();

      app.use('/blog', function (req, res) {
        res.end(req.originalUrl);
      });

      await request(app).get('/blog/post/1').expect(200, '/blog/post/1');
    });

    it('should adjust req.url', async function () {
      app.use('/blog', function (req, res) {
        res.end(req.url);
      });

      await request(app).get('/blog/post/1').expect(200, '/post/1');
    });

    it('should strip trailing slash', async function () {
      var blog = connect();

      blog.use(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog/', blog);

      await request(app).get('/blog').expect('blog');
    });

    it('should set .route', function () {
      var blog = connect();
      var admin = connect();
      app.use('/blog', blog);
      blog.use('/admin', admin);
      assert.equal(app.route, '/');
      assert.equal(blog.route, '/blog');
      assert.equal(admin.route, '/admin');
    });

    it('should not add trailing slash to req.url', async function () {
      app.use('/admin', function (req, res, next) {
        next();
      });

      app.use(function (req, res, next) {
        res.end(req.url);
      });

      await request(app).get('/admin').expect('/admin');
    });
  });

  describe('with a node app', function () {
    it('should mount', async function () {
      var blog = http.createServer(function (req, res) {
        assert.equal(req.url, '/');
        res.end('blog');
      });

      app.use('/blog', blog);

      await request(app).get('/blog').expect('blog');
    });
  });

  describe('error handling', function () {
    it('should send errors to airty 4 fns', async function () {
      app.use(function (req, res, next) {
        next(new Error('msg'));
      });
      app.use(function (err, req, res, next) {
        res.end('got error ' + err.message);
      });

      await request(app).get('/').expect('got error msg');
    });

    it('should skip to non-error middleware', async function () {
      var invoked = false;

      app.use(function (req, res, next) {
        next(new Error('msg'));
      });
      app.use(function (req, res, next) {
        invoked = true;
        next();
      });
      app.use(function (err, req, res, next) {
        res.end(invoked ? 'invoked' : err.message);
      });

      await request(app).get('/').expect(200, 'msg');
    });

    it('should start at error middleware declared after error', async function () {
      app.use(function (err, req, res, next) {
        res.end('fail: ' + err.message);
      });
      app.use(function (req, res, next) {
        next(new Error('boom!'));
      });
      app.use(function (err, req, res, next) {
        res.end('pass: ' + err.message);
      });

      await request(app).get('/').expect(200, 'pass: boom!');
    });

    it('should stack error fns', async function () {
      app.use(function (req, res, next) {
        next(new Error('msg'));
      });
      app.use(function (err, req, res, next) {
        res.setHeader('X-Error', err.message);
        next(err);
      });
      app.use(function (err, req, res, next) {
        res.end('got error ' + err.message);
      });

      await request(app)
        .get('/')
        .expect('X-Error', 'msg')
        .expect(200, 'got error msg');
    });

    it('should invoke error stack even when headers sent', async function () {
      var invoked = new Promise(function executor(resolve) {
        app.use(function (req, res, next) {
          res.end('0');
          next(new Error('msg'));
        });
        app.use(function (err, req, res, next) {
          resolve();
        });
      });

      request(app)
        .get('/')
        .end(function () {});

      await invoked;
    });
  });
});
