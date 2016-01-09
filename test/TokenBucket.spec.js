var chai = require('chai');
var async = require('async');
var expect = chai.expect;

var Redis = require('redis');
var TokenBucket = require('../lib/TokenBucket');

var rateLimiter;
var client;


describe('TokenBucket', function() {

  before(function(done) {
    client = Redis.createClient(6379, 'localhost');
    client.on('error', function(err) {
      console.error('Error on redis connection', err);
    });

    client.on('ready', function() {
      rateLimiter = new TokenBucket({ redis: client });
      done();
    });
  });

  describe('rateLimitReset', function() {
    it('should return true when resetting', function(done) {

      var testKey = 'API:limits:testing:0:';

      rateLimiter.clearRateLimitWithKey(testKey, function(err, data) {
        expect(err).to.equal(null);
        expect(data).to.be.true;
        done();
      });
    });
  });

  describe('rateLimit', function() {

    beforeEach(function(done) {
      client.eval('return redis.call("del", unpack(redis.call("keys", KEYS[1])))', 1, 'API:limits:testing:*', function(err, res) {
        done();
      });
    });

    it('should return the the pool max minus the cost after being reset', function(done) {
      var testKey = 'API:limits:testing:1:';

      rateLimiter.rateLimit(testKey, 10, 250, 240, function(err, data) {
        expect(data).to.equal(240);
        done();
      });
    });

    //
    // Numeric tests
    //

    it('should allow 250 hits out of 250 over 2 seconds at a cost of 1', function(done) {
      this.timeout(4000);

      testRateLimit(250, 240, 250, 2000, 1, function(err, data) {
        var passed = data.filter(function(item) {return item >= 0;}).length;
        expect(passed).to.equal(250);
        done();
      });
    });

    it('should allow 172 hits out of 250 over 2 seconds at a cost of 1.5', function(done) {
      this.timeout(4000);

      testRateLimit(250, 240, 250, 2000, 1.5, function(err, data) {
        var passed = data.filter(function(item) {return item >= 0;}).length;
        expect(passed).to.equal(172);
        done();
      });
    });

    it('should allow 258 hits out of 500 over 2 seconds at a cost of 1', function(done) {
      this.timeout(4000);

      testRateLimit(250, 240, 500, 2000, 1, function(err, data) {
        var passed = data.filter(function(item) {return item >= 0;}).length;
        expect(passed).to.equal(258);
        done();
      });
    });

    it('should allow 254 hits out of 500 over 1 seconds at a cost of 1', function(done) {
      this.timeout(4000);

      testRateLimit(250, 240, 500, 1000, 1, function(err, data) {
        var passed = data.filter(function(item) {return item >= 0;}).length;
        expect(passed).to.equal(254);
        done();
      });
    });
  });
});

function testRateLimit(poolMax, fillRate, hits, time, cost, cb) {
  //Expected pass amount is poolMax + time(ms) / fillRate / cost

  var functions = [];
  var key = 'API:limits:testing:';

  async.times(hits, function(i, done) {
    setTimeout(function() {
      rateLimiter.rateLimit(key, cost, poolMax, fillRate, done);
    }, (time / hits) * i);
  }, cb);
}
