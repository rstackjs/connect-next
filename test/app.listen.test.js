import assert from 'node:assert';
import { describe, it } from 'rstack/test';
import request from 'supertest';

import { connect } from '../dist/index.js';

describe('app.listen()', function () {
  it('should wrap in an http.Server', async function () {
    var app = connect();

    app.use(function (req, res) {
      res.end();
    });

    var server = await new Promise(function executor(resolve) {
      var listening = app.listen(0, function () {
        resolve(listening);
      });
    });

    try {
      assert.ok(server);
      await request(server).get('/').expect(200);
    } finally {
      await new Promise(function executor(resolve) {
        server.close(resolve);
      });
    }
  });
});
