import { beforeEach, describe, it } from 'rstack/test';

import { connect } from '../dist/index.js';
import rawrequest from './support/rawagent.js';

describe('app.use()', function () {
  var app;

  beforeEach(function () {
    app = connect();
  });

  it('should not obscure FQDNs', async function () {
    app.use(function (req, res) {
      res.end(req.url);
    });

    await rawrequest(app)
      .get('http://example.com/foo')
      .expect(200, 'http://example.com/foo');
  });

  describe('with a connect app', function () {
    it('should ignore FQDN in search', async function () {
      app.use('/proxy', function (req, res) {
        res.end(req.url);
      });

      await rawrequest(app)
        .get('/proxy?url=http://example.com/blog/post/1')
        .expect(200, '/?url=http://example.com/blog/post/1');
    });

    it('should ignore FQDN in path', async function () {
      app.use('/proxy', function (req, res) {
        res.end(req.url);
      });

      await rawrequest(app)
        .get('/proxy/http://example.com/blog/post/1')
        .expect(200, '/http://example.com/blog/post/1');
    });

    it('should adjust FQDN req.url', async function () {
      app.use('/blog', function (req, res) {
        res.end(req.url);
      });

      await rawrequest(app)
        .get('http://example.com/blog/post/1')
        .expect(200, 'http://example.com/post/1');
    });

    it('should adjust FQDN req.url with multiple handlers', async function () {
      app.use(function (req, res, next) {
        next();
      });

      app.use('/blog', function (req, res) {
        res.end(req.url);
      });

      await rawrequest(app)
        .get('http://example.com/blog/post/1')
        .expect(200, 'http://example.com/post/1');
    });

    it('should adjust FQDN req.url with multiple routed handlers', async function () {
      app.use('/blog', function (req, res, next) {
        next();
      });
      app.use('/blog', function (req, res) {
        res.end(req.url);
      });

      await rawrequest(app)
        .get('http://example.com/blog/post/1')
        .expect(200, 'http://example.com/post/1');
    });
  });
});
