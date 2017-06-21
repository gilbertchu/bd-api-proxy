// Fetch environment variables from .env
require('dotenv').config();
if (typeof process.env.API_KEY === 'undefined') {
  throw new Error('Missing API key!');
}



// Dependencies
const esclient = require('./esclient.js');
const express = require('express');



// Express application
const app = express();



// App route (the API endpoint)
app.get('/api/v1/doctors/search', function (req, res) {
  console.log('\nNew request:',req.path,req.query);

  // Get parameters from query string
  let qs = req.query;

  // Check for required parameter name
  if (typeof qs.name === 'undefined') {
    res.status(400).json({
      status: 400,
      data: 'Missing required parameter name'
    });
  } else {
    let name = qs.name.trim();

    // Disallow empty value for name
    if (name === '') {
      res.status(400).json({
        status: 400,
        data: 'Parameter name cannot be empty'
      });
    } else {
      // Request has proper name value, continue the search
      esclient.searchByName(name, function(status, data, cached) {
        // Return search results in response
        let response_body = {
          status: status,
          data: data
        };

        // Log some results to console if you want
        console.log(`Searched: ${name}, status ${status}`);
        if (status===200) console.log('Results found:',data.length);
        if (typeof cached !== 'undefined') {
          console.log("CACHE HIT!!!");
        }

        // Return the json response
        res.status(status).json(response_body);
      });
    }
  }
});



// Make the app start listening
app.listen(process.env.APP_PORT, function () {
  console.log(`Listening on port ${process.env.APP_PORT}`);
});

