var peer = require('peer');
var express = require('express');
var bodyParser = require('body-parser')
var request = require('request');

var app = express();
var ExpressPeerServer = peer.ExpressPeerServer;

var http_port = parseInt(process.env.HTTP_PORT) || parseInt(process.env.PORT) || 9999;
var https_port = parseInt(process.env.HTTPS_PORT) || 9998;
var port = http_port;
var secure = false;

var options = {
  debug: true,
  allow_discovery: true
}

var server;

// Handle HTTP or HTTPS operation
if(process.env.SSL_KEY_FILE && process.env.SSL_CERT_FILE) {
  const https = require('https');
  const fs = require('fs');

  var privateKey = fs.readFileSync( process.env.SSL_KEY_FILE );
  var certificate = fs.readFileSync( process.env.SSL_CERT_FILE );

  server = https.createServer({
    key: privateKey,
    cert: certificate
  }, app).listen(https_port, function() {
    console.log(`HTTPS Listening on ${https_port}`)
  });

  // Also support HTTP alongside HTTPS. Helps with reverse proxy deployments.
  app.listen(http_port, function () {
    console.log(`HTTP Listening on ${http_port}`)
  });

  port = https_port;
  secure = true;
} else {
  server = app.listen(http_port, function () {
    console.log(`HTTP Listening on ${http_port}`)
  });
  port = http_port;
  secure = false;
}

if(process.env.SECURE_PORT) {
  port = parseInt(process.env.SECURE_PORT);
  secure = true;
}

// CORS
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


// Peer.js WebSocket service
app.use('/peerjs', ExpressPeerServer(server, options));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
// parse application/json
app.use(bodyParser.json({limit: '10mb'}));

var peer_config=process.env.PEER_CONFIG || "{}";
var nifi_config=process.env.NIFI_CONFIG || "{ enabled: false }";
var dta_config=process.env.DTA_CONFIG || "{ enabled: false }";
var objlob_config=process.env.OBJLOB_CONFIG || "{ enabled: false }";
var triangulate_config=process.env.TRIANGULATE_CONFIG || "{ enabled: false }";
var pushcot_config=process.env.PUSHCOT_CONFIG || "{ enabled: false }";
var media_config=process.env.MEDIA_CONFIG || '{ audio: true, video: { width: { min: 640, max: 1920 }, height: { min: 480, max: 1080 }, frameRate: { ideal: 5 }, facingMode: { ideal: "environment" } } }';
var staoi_url=process.env.STAOI_URL;

app.post('/nifi', function (req, res) {
  console.log("nifi: " + JSON.stringify(req.body));

  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ result: "OK" }));

  if(staoi_url) {
    try {
      var received = JSON.parse(req.body);
      request.post(staoi_url,
        {
          json: {
            lat: received.latitude,
            long: received.longitude,
            compass: received.heading,
	    image: received.image
          }
        },
        function (error, response, body) {
          console.log('post to staoi responded with status code: ' + response.statusCode);
        }
      );
    } catch(e) {
      console.log("nifi: JSON parse caught exception: " + e);
    }
  }

});

// Allow 12-factor config to browser from server environment variables
app.get('/config.js', function (req, res) {
  var output = "var config = { secure:" + secure + ", port: " + port;

  output = output + `, peer: ${peer_config}`;
  output = output + `, nifi: ${nifi_config}`;
  output = output + `, dta: ${dta_config}`;
  output = output + `, objlob: ${objlob_config}`;
  output = output + `, triangulate: ${triangulate_config}`;
  output = output + `, pushcot: ${pushcot_config}`;
  output = output + `, media: ${media_config}`;
  output = output + " };\n";

  res.setHeader('Content-Type', 'application/javascript');
  res.send(output);
});

// Serve static content from public/ folder
app.use(express.static('public'));

