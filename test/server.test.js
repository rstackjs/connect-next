import assert from 'node:assert';
import http from 'node:http';
import { beforeEach, describe, it } from 'rstack/test';
import request from 'supertest';

import { connect } from '../dist/index.js';
import rawrequest from './support/rawagent.js';

describe('app', function () {
  var app;

  beforeEach(function () {
    app = connect();
  });

  it('should inherit from event emitter', async function () {
    await new Promise(function executor(resolve) {
      app.on('foo', resolve);
      app.emit('foo');
    });
  });

  it('should work in http.createServer', async function () {
    var app = connect();

    app.use(function (req, res) {
      res.end('hello, world!');
    });

    var server = http.createServer(app);

    await request(server).get('/').expect(200, 'hello, world!');
  });

  it('should be a callable function', async function () {
    var app = connect();

    app.use(function (req, res) {
      res.end('hello, world!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res);
    }

    var server = http.createServer(handler);

    await request(server).get('/').expect(200, 'oh, hello, world!');
  });

  it('should invoke callback if request not handled', async function () {
    var app = connect();

    app.use('/foo', function (req, res) {
      res.end('hello, world!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res, function () {
        res.end('no!');
      });
    }

    var server = http.createServer(handler);

    await request(server).get('/').expect(200, 'oh, no!');
  });

  it('should invoke callback on error', async function () {
    var app = connect();

    app.use(function (req, res) {
      throw new Error('boom!');
    });

    function handler(req, res) {
      res.write('oh, ');
      app(req, res, function (err) {
        res.end(err.message);
      });
    }

    var server = http.createServer(handler);

    await request(server).get('/').expect(200, 'oh, boom!');
  });

  it('should work as middleware', async function () {
    // custom server handler array
    var handlers = [
      connect(),
      function (req, res, next) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Ok');
      },
    ];

    // execute callbacks in sequence
    var n = 0;
    function run(req, res) {
      if (handlers[n]) {
        handlers[n++](req, res, function () {
          run(req, res);
        });
      }
    }

    // create a non-connect server
    var server = http.createServer(run);

    await request(server).get('/').expect(200, 'Ok');
  });

  it('should escape the 500 response body', async function () {
    app.use(function (req, res, next) {
      next(new Error('error!'));
    });

    await request(app)
      .get('/')
      .expect(/Error: error!<br>/)
      .expect(/<br> &nbsp; &nbsp;at/)
      .expect(500);
  });

  describe('404 handler', function () {
    it('should escape the 404 response body', async function () {
      await rawrequest(app)
        .get("/foo/<script>stuff'n</script>")
        .expect(
          404,
          />Cannot GET \/foo\/%3Cscript%3Estuff&#39;n%3C\/script%3E</,
        );
    });

    it('shoud not fire after headers sent', async function () {
      var app = connect();

      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(next);
      });

      await request(app).get('/').expect(200);
    });

    it('shoud have no body for HEAD', async function () {
      var app = connect();

      await request(app).head('/').expect(404).expect(shouldHaveNoBody());
    });
  });

  describe('error handler', function () {
    it('should have escaped response body', async function () {
      var app = connect();

      app.use(function (req, res, next) {
        throw new Error('<script>alert()</script>');
      });

      await request(app)
        .get('/')
        .expect(500, /&lt;script&gt;alert\(\)&lt;\/script&gt;/);
    });

    it('should use custom error code', async function () {
      var app = connect();

      app.use(function (req, res, next) {
        var err = new Error('ack!');
        err.status = 503;
        throw err;
      });

      await request(app).get('/').expect(503);
    });

    it('should keep error statusCode', async function () {
      var app = connect();

      app.use(function (req, res, next) {
        res.statusCode = 503;
        throw new Error('ack!');
      });

      await request(app).get('/').expect(503);
    });

    it('shoud not fire after headers sent', async function () {
      var app = connect();

      app.use(function (req, res, next) {
        res.write('body');
        res.end();
        process.nextTick(function () {
          next(new Error('ack!'));
        });
      });

      await request(app).get('/').expect(200);
    });

    it('shoud have no body for HEAD', async function () {
      var app = connect();

      app.use(function (req, res, next) {
        throw new Error('ack!');
      });

      await request(app).head('/').expect(500).expect(shouldHaveNoBody());
    });
  });
});

function shouldHaveNoBody() {
  return function (res) {
    assert.ok(res.text === '' || res.text === undefined);
  };
}
