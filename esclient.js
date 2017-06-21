// Elasticsearch client

// Environment variables
var api_key = process.env.API_KEY;
var es_index = process.env.ELASTICSEARCH_INDEX;
var es_type = process.env.ELASTICSEARCH_TYPE;

console.log('Using index:',es_index);
console.log('Using type:',es_type);



// Dependencies
const elasticsearch = require('elasticsearch');
const request = require('request');



// Elasticsearch client
const client = new elasticsearch.Client({
  host: `localhost:${process.env.ELASTICSEARCH_PORT}`,
  //log: 'trace'
});



// Mutex lock since we only have one API key
var lock = false;



// Request external API to search
function bdsearch(params, callback) {
  let {name, skip=0, data=[]} = params;

  console.log(`*** external API search: ${name} (skip: ${skip})`);

  // Make the request to the external API
  request({
    method: 'GET',
    uri: 'https://api.betterdoctor.com/2016-03-01/doctors',
    qs: {
      'name': name,
      'skip': skip,
      'limit': 100,
      'user_key': api_key
    }
  }, function(error, response, raw_body) {
    if (error) {
      // There was an error with the request itself, could be due to various reasons (ex. no internet connection)
      console.log('!!! error on request:', error);

      lock = false;
      callback(500, 'Request to external API failed');
    } else {
      if (response.statusCode === 200) {
        // Request succeeded, parse data and continue
        let body = JSON.parse(raw_body);
        data = data.concat(body.data)

        // If no results found, return immediately
        if (body.meta.total === 0) {
          console.log('*** no results found');

          lock = false;
          return callback(200, data);
        }

        // Our current total count of items queried
        let total_count = body.meta.count + body.meta.skip;

        // Set delay for next request to either 0.5s interval or 40 per 60s, depending on total
        let delay = (body.meta.total < 4000) ? 500 : 1500;

        // If their total is greater than max limit of 100, we need to make multiple requests
        if (body.meta.total > total_count) {
          // Need more data, request again after the delay
          setTimeout(function() {
            bdsearch({
              name: name,
              skip: total_count,
              data: data
            }, callback);
          }, delay);
        } else {
          // Finished getting all items, update our cache and return results
          // Store results in our cache with bulk index
          let bulk_body = [];
          for (let i=0, im=data.length; i<im; i++) {
            bulk_body.push({ index:  { _index: es_index, _type: es_type, _id: i+1 } });
            bulk_body.push(data[i]);
          }

          client.bulk({
            body: bulk_body
          }, function (err, res) {
            // After all operations done, unlock after delay
            setTimeout(function() {
              lock = false;

              // Log any errors with cache attempt
              if (err) {
                console.log('!!! error on bulk index:',err);
              }

              // Return results in callback
              callback(200, data);
            }, delay);
          });
        }
      } else {
        // The external API returned a non 200 status code
        console.log('!!! error, request returned statusCode:', response.statusCode);
        console.log(raw_body);

        lock = false;
        callback(500, 'Request to external API returned error');
      }
    }
  });
}




// Search by name. First checks cache, then requests from external API if no results were found in cache
exports.searchByName = function(name, callback) {
  let query_string = name.split(' ').map(function(word) {
    return word+'*';
  }).join(' AND ');

  // First check our own elasticsearch cache
  client.search({
    index: es_index,
    type: es_type,
    size: 1000,
    body: {
      query: {
        query_string: {
          query: query_string,
          fields: ['profile.*_name']
        }
      }
    }
  }, function(err, res) {
    if (err) {
      console.log('!!! error on cache check:', err);
      callback(500, 'Cache check failed')
    } else {
      if (res.hits.total > 0) {
        // Got results in cache, return the data
        let data = res.hits.hits.map(function(obj) {
          return obj._source;
        });

        callback(200, data, true);
      } else {
        // No results in cache, make requests to external API
        // Check lock to avoid making too many requests
        if (lock) {
          console.log('!!! error, already processing a search');
          callback(429, 'Another request is currently being processed');
        } else {
          // If lock is open, attempt to request external API to search
          lock = true;
          bdsearch({name:name}, callback);
        }
      }
    }
  });
}

