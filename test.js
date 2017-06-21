require('dotenv').config();
const assert = require('assert');
const request = require('request');
const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
  host: `localhost:${process.env.ELASTICSEARCH_PORT}`,
});

var base_url = `http://localhost:${process.env.APP_PORT}`;
console.log('base url:',base_url);



describe('Non-existing routes', function() {
	describe('GET /', function() {
		it('Should return 404', function(done) {
		  request.get(base_url, function(err, res, body) {
		    assert.equal(404, res.statusCode);
		    done();
		  });
		});
	});

	describe('GET /does/not/exist', function() {
		it('Should return 404', function(done) {
		  request.get(base_url+'/does/not/exist', function(err, res, body) {
		    assert.equal(404, res.statusCode);
		    done();
		  });
		});
	});
});



describe('Requests to API endpoint with invalid name', function() {
	describe('Missing name parameter in query string', function() {
		it('Should return 400', function(done) {
		  request.get(base_url+'/api/v1/doctors/search', function(err, res, body) {
		    assert.equal(400, res.statusCode);
		    done();
		  });
		});
	});

	describe('Empty name parameter in query string', function() {
		it('Should return 400', function(done) {
		  request.get(base_url+'/api/v1/doctors/search?name=', function(err, res, body) {
		    assert.equal(400, res.statusCode);
		    done();
		  });
		});
	});
});



describe('Requests to API endpoint with valid name', function() {
	// Clear the cache before running these tests
	before(function(done) {
    client.indices.delete({
    	index: process.env.ELASTICSEARCH_INDEX
    }, function(error, response) {
    	client.indices.create({
    		index: process.env.ELASTICSEARCH_INDEX
    	}, function(error, response) {
    		done();
    	})
    });
  });

  // Ensure enough time between new searches
  beforeEach(function(done) {
  	setTimeout(function() {
  		done();
  	}, 1600);
  });


  describe('Search for a name with no results', function() {
  	it('Should return status 200 and 0 results', function(done) {
		  request.get(base_url+'/api/v1/doctors/search?name=seuss', function(err, res, body) {
		    assert.equal(200, res.statusCode);
		    let data = JSON.parse(body).data;
		    assert.equal(0, data.length);
		    done();
		  });
  	});
  });

  let newLength, cachedLength;

  describe('New search for a name with results', function() {
  	it('Should return status 200 and >0 results', function(done) {
		  request.get(base_url+'/api/v1/doctors/search?name=stringer', function(err, res, body) {
		    assert.equal(200, res.statusCode);
		    let data = JSON.parse(body).data;
		    newLength = data.length;
		    assert.ok(data.length > 0);
		    done();
		  });
  	}).timeout(30000);
  });

  describe('Search for a name with cached results', function() {
  	it('Should return status 200 and >0 results (faster)', function(done) {
		  request.get(base_url+'/api/v1/doctors/search?name=stringer', function(err, res, body) {
		    assert.equal(200, res.statusCode);
		    let data = JSON.parse(body).data;
		    cachedLength = data.length;
		    assert.ok(data.length > 0);
		    done();
		  });
  	}).timeout(30000);
  })

  describe('Compare results of new vs. cached search', function() {
  	it('Should have same number of results for previous identical requests', function() {
  		assert.equal(newLength, cachedLength);
  	});
	});
});



describe('Rate limiting of API requests', function() {
	beforeEach(function(done) {
  	setTimeout(function() {
  		done();
  	}, 1600);
  });

	describe('Two new searches in a row, encounters rate limiting', function() {
  	it('Should return status 429 for second request', function(done) {
		  request.get(base_url+'/api/v1/doctors/search?name=house', function(err, res, body) {
		  	//
		  });

		  setTimeout(function() {
		  	request.get(base_url+'/api/v1/doctors/search?name=strange', function(err, res, body) {
			    assert.equal(429, res.statusCode);
			    done();
			  });
		  }, 500);
  	}).timeout(30000);
  });

  describe('Two cached searches in a row, bypassing rate limiting', function() {
  	it('Should return status 200 for both requests', function() {
  		request.get(base_url+'/api/v1/doctors/search?name=stringer', function(err, res, body) {
	  		request.get(base_url+'/api/v1/doctors/search?name=stringer', function(err, res, body) {
		  		assert.equal(200, res.statusCode);
		  		done();
		  	});
	  	});
  	});
  });
});
