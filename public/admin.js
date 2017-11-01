// admin page
$(document).on('pageinit', '#admin' ,function(){
  console.log("pageinit admin");
});

$(document).on('pagebeforeshow', '#admin' ,function(){
  console.log("pagebeforeshow admin");
});

$(document).on('pageshow', '#admin' ,function(){
  console.log("pageshow admin");

  var markers = {};
  var map = L.map('map');
  var initialCenter = false;
  var drones = {};
  var admins = {};
  var metrics = {};
  var updates = {};
  var triangulated;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Compatibility shim
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  // PeerJS object
  var peer = new Peer({
    host: window.location.hostname,
    port: config.port,
    secure: config.secure,
    path: '/peerjs',
    debug: 3,
    config: config.peer
  });

  $( "#captureButton" ).bind( "click", function(event, ui) {
    console.log("Capture button clicked");
    if(Object.keys(drones).length >= 3) {
      console.log("3 or more drones available, sending Update action to each drone");
      var date = new Date();
      var timestamp = date.getTime();
      updates[timestamp] = [];
      $.each( drones, function( peer, drone) {
        console.log("Enumerating drone peer " + peer);

        $.each( drones[peer], function( index, conn) {
          console.log("sending Update action to peer " + peer + " index " + index);
          conn.send({
            action: "Update",
            timestamp: timestamp
          });
        });

      });
    } else {
      console.log("We only have " + Object.keys(drones).length + " drones available. Cannot triangulate.");
    }
  });

  function compassHeading( alpha, beta, gamma ) {
    var _x = beta  ? beta  * degtorad : 0; // beta value
    var _y = gamma ? gamma * degtorad : 0; // gamma value
    var _z = alpha ? alpha * degtorad : 0; // alpha value

    var cX = Math.cos( _x );
    var cY = Math.cos( _y );
    var cZ = Math.cos( _z );
    var sX = Math.sin( _x );
    var sY = Math.sin( _y );
    var sZ = Math.sin( _z );

    // Calculate Vx and Vy components
    var Vx = - cZ * sY - sZ * sX * cY;
    var Vy = - sZ * sY + cZ * sX * cY;

    // Calculate compass heading
    var compassHeading = Math.atan( Vx / Vy );

    // Convert compass heading to use whole unit circle
    if( Vy < 0 ) {
      compassHeading += Math.PI;
    } else if( Vx < 0 ) {
      compassHeading += 2 * Math.PI;
    }

    return compassHeading * ( 180 / Math.PI ); // Compass Heading (in degrees)
  }

  function processReceivedData(conn, data) {
    switch (data.action) {
      case "Updated":
        console.log("Updated action received from a drone: " + JSON.stringify(data));

        // If triangulate is enabled and we have been given a timestamp to correlate
        if(config.triangulate.enabled && data.timestamp) {
          console.log("triangulate is enabled");
          console.log("timestamp " + data.timestamp + " received.");

          // Push the Updated message objlob property to the timestamp correlated array
          if(!updates[data.timestamp]) {
            updates[data.timestamp] = [];
          }
          if(data.objlob.hasOwnProperty("lat") && data.objlob.hasOwnProperty("lon") &&
             data.objlob.hasOwnProperty("aob") && data.objlob.hasOwnProperty("angleUnit")) {
	    if(data.objlob["aob"]) {
              console.log("No person was identified by objlob, skipping for [" + conn.peer + "/" + data.timestamp + "]" );
	    } else {
              console.log("Pushing objlob to list for [" + conn.peer + "/" + data.timestamp + "]" );
              updates[data.timestamp].push(data.objlob);
	    }
          } else {
            console.log("WARNING: Disregarded action: Updated did not include both a lat and a lon");
            break;
          }

          // If we have >= 3 updated messages to process, call Triangulate
          if(Object.keys(updates[data.timestamp]).length >= 3) {

            // We have collected >= 3 objlob responses.
            console.log("we have collected >= 3 objlob responses for " + data.timestamp);

            // These are the coords for Triangulate's TargetLocate
            data = {
              "coords": updates[data.timestamp]
            }

	    /*
	    data = {
	      "coords": [
	        {"lat": 27.957261, "lon": -82.436587, "aob": 134.91444444, "angleUnit": "deg"},
		{"lat": 27.956774, "lon": -82.436587, "aob": 38.17583333, "angleUnit": "deg"},
		{"lat": 27.957050, "lon": -82.435950, "aob": 269.50611111, "angleUnit": "deg"}
              ]
	    }*/

            console.log("POSTing to triangulate: " + JSON.stringify(data));

            $.ajax({
              type: "POST",
              url: config.triangulate.url,
              data: JSON.stringify(data),
              timeout: 10000
            }).error(function (jqXHR, textStatus, errorThrown) {
              console.log("triangulate error text: " + textStatus);
              console.log("triangulate error thrown: " + errorThrown);
            }).done(function (result) {
              console.log("triangulate ajax done");

              if(result.hasIntersect) {
                console.log("triangulate intersection found!" + JSON.stringify(result));
                if(triangulated) {
                  var newLatLng = new L.LatLng(result.targetLoc.lat, result.targetLoc.lon);
                  triangulated.setLatLng(newLatLng); 
                  console.log("triangulate map location updated");
                } else {
                  triangulated = L.marker([result.targetLoc.lat, result.targetLoc.lon]).addTo(map);

                  triangulated.bindPopup("Triangulated");
                  console.log("triangulate map location created");
                }
                // Re-center the map to the triangulated latitude/longitude
                map.setView(triangulated.getLatLng(),map.getZoom());

                data = {
                  "lat": result.targetLoc.lat,
                  "lon": result.targetLoc.lon,
                  "identity": "hostile",
                  "dimension": "land-unit",
                  "entity": "military",
                  "type": "E-V-A-T"
                }

                $.ajax({
                  type: "POST",
                  url: config.pushcot.url,
                  data: JSON.stringify(data),
                  timeout: 10000
                }).error(function (jqXHR, textStatus, errorThrown) {
                  console.log("pushcot error text: " + textStatus);
                  console.log("pushcot error thrown: " + errorThrown);
                }).done(function (result) {
                  console.log("pushcot ajax done: " + JSON.stringify(result));
		});
                console.log("pushcot ajax sent");
              } else {
                console.log("No intersection found, no coordinates to plot");
	      }
            });
            console.log("triangulate ajax sent");
          } else {
            console.log("we only have " + Object.keys(updates[data.timestamp]).length + " objlobs for " + data.timestamp);
          } // If we have >= 3 updated messages to process

        } // If triangulate is enabled and we have been given a timestamp to correlate

        break;
      case "Admin":
        console.log("Admin action received from " + conn.peer);
        if(!admins[conn.peer]) {
          admins[conn.peer] = [];
        }
        admins[conn.peer].push(conn);
        break;
      case "Drone":
        console.log("Drone action received from " + conn.peer);
        if(!drones[conn.peer]) {
          drones[conn.peer] = [];
        }
        drones[conn.peer].push(conn);
/*
        if(Object.keys(drones).length >= 3) {
          console.log("3 or more drones, enabling capture button");
          $('#captureButton').removeClass('ui-state-disabled');
        }
*/
        break;
      case "orientation":
        /* Do something with the received x,y,z,absolute,alpha,beta,gamma */
/*
        $( "#" + conn.peer + " td.orientationX").html(data.x);
        $( "#" + conn.peer + " td.orientationY").html(data.y);
        $( "#" + conn.peer + " td.orientationZ").html(data.z);
*/
        if(data.absolute) { $( "#" + conn.peer + " td.orientationAbsolute").html(data.absolute); }
        if(data.alpha) { $( "#" + conn.peer + " td.orientationAlpha").html(data.alpha); }
        if(data.beta) { $( "#" + conn.peer + " td.orientationBeta").html(data.beta); }
        if(data.gamma) { $( "#" + conn.peer + " td.orientationGamma").html(data.gamma); }
        if(data.change) { $( "#" + conn.peer + " td.orientationChange").html(data.change); }
        if(data.compass) { $( "#" + conn.peer + " td.orientationCompass").html(data.compass); }

        // Remember the orientation metrics so we can send them along with an image
        if(!metrics[conn.peer]) {
          metrics[conn.peer] = {};
        }
        if(!metrics[conn.peer].orientation) {
          metrics[conn.peer].orientation = {};
        }
/*
        metrics[conn.peer].orientation.x = data.x;
        metrics[conn.peer].orientation.y = data.y;
        metrics[conn.peer].orientation.z = data.z;
*/
        if(data.absolute) { metrics[conn.peer].orientation.absolute = data.absolute; }
        if(data.alpha) { metrics[conn.peer].orientation.alpha = data.alpha; }
        if(data.beta) { metrics[conn.peer].orientation.beta = data.beta; }
        if(data.gamma) { metrics[conn.peer].orientation.gamma = data.gamma; }
        if(data.change) { metrics[conn.peer].orientation.change = data.change; }
        if(data.compass) { metrics[conn.peer].orientation.compass = data.compass; }
        var marker = markers[conn.peer];
        if(marker) {
          var rotation = data.heading || data.compass || 0;
          marker.setRotationAngle(rotation);
        }
        break;
      case "geolocation":
        //console.log("geolocation: " + conn.peer + ": " + JSON.stringify(data));
        /* Do something with the received latitude, longitude */
        var marker = markers[conn.peer];
        if(marker) {
          var newLatLng = new L.LatLng(data.latitude, data.longitude);
          marker.setLatLng(newLatLng);
          //console.log("geolocation updated marker for " + conn.peer);
        } else {
          var rotation = 0;
          if(metrics.hasOwnProperty(conn.peer) && metrics[conn.peer].hasOwnProperty("orientation")) {
            rotation = metrics[conn.peer].orientation.alpha;
          }
          marker = L.marker([data.latitude, data.longitude],{ rotationAngle: rotation, rotationOrigin: 'bottom center' }).addTo(map);
          marker.bindPopup(conn.peer);
          markers[conn.peer] = marker;
          console.log("geolocation created marker for " + conn.peer);
        }
        if(data.latitude) { $( "#" + conn.peer + " td.geolocationLatitude").html(data.latitude); }
        if(data.longitude) { $( "#" + conn.peer + " td.geolocationLongitude").html(data.longitude); }
        if(data.heading) { $( "#" + conn.peer + " td.geolocationHeading").html(data.heading); }
        if(data.speed) { $( "#" + conn.peer + " td.geolocationSpeed").html(data.speed); }
        if(data.accuracy) { $( "#" + conn.peer + " td.geolocationAccuracy").html(data.accuracy); }

        // Remember the geolocation metrics so we can send them along with an image
        if(!metrics[conn.peer]) {
          metrics[conn.peer] = {};
        }
        if(!metrics[conn.peer].geolocation) {
          metrics[conn.peer].geolocation = {};
        }
        if(data.latitude) { metrics[conn.peer].geolocation.latitude = data.latitude; }
        if(data.longitude) { metrics[conn.peer].geolocation.longitude = data.longitude; }
        if(data.heading) { metrics[conn.peer].geolocation.heading = data.heading; }
        if(data.speed) { metrics[conn.peer].geolocation.speed = data.speed; }
        if(data.accuracy) { metrics[conn.peer].geolocation.accuracy = data.accuracy; }
        break;
      default:
        console.log("Unknown message received from " + conn.peer + ": " + JSON.stringify(data));
    }
  }

  function updateHeader() {
    $( "#my-header" ).html("Orient: Admin: " + peer.id);
    $( "#drones" ).trigger("update");
  }

  peer.on('open', function(id){
    console.log("peer open: my peer id is " + id);
    updateHeader();
    peer.listAllPeers(function(neighbors) {
      $.each( neighbors, function( index, neighbor) {
        if(neighbor != id) {
          console.log("peer open connecting to peer " + neighbor);
          var conn = peer.connect( neighbor, { serialization: "json" });
          conn.on('open', function() {
            console.log("connection outbound open");

            /* Deal with received data from a neighbor that we connected to */
            conn.on('data', function(data) {
              processReceivedData(conn, data);
            });

            /* Tell our new peer that we are an Admin */
            conn.send({
              action: "Admin"
            });

          });
        }
      });
    });
  });

  peer.on('connection', function(conn) {
    console.log("peer connection inbound from " + conn.peer);
    conn.on('open', function() {
      console.log("connection inbound open");

      /* Deal with received data from a neighbor that connected to us */
      conn.on('data', function(data) {
        processReceivedData(conn, data);
      });

      /* Tell our connecting peer that we are an Admin */
      conn.send({
        action: "Admin"
      });
    });
    conn.on('close', function() {
      console.log("connection close");
      $( "#" + conn.peer ).remove();
    });
    conn.on('error', function(err) {
      console.log("connection error: " + err.message);
    });
  });

  // Receiving a call
  peer.on('call', function(call){
    console.log("peer call");
    call.on('stream', function(remoteStream) {
      // Show stream in some video/canvas element.
      console.log("call on answered stream");

      // Add a new collapsible item for this Drone
      var drone = "<div id=\"" + call.peer + "\"><div data-role=collapsible>" + $( "#drone-template" ).html() + "</div></div>";
      $( "#drones" ).append(drone);
      $( "#" + call.peer ).trigger("create");

      // Update the collapsible label
      $( "#" + call.peer + " H4 a" ).html("Drone: " + call.peer);
      $( "#" + call.peer ).trigger("update");

      // Attach the remoteStream to our video tag so we can see it
      $('#' + call.peer + " video").prop('src', URL.createObjectURL(remoteStream));

      if(config.nifi.enabled || config.dta.enabled) {
        console.log("console.nifi.enabled is true");
        var canvas = $("#" + call.peer + " canvas").get(0);
        var video = $("#" + call.peer + " video").get(0);
        var inputCtx = canvas.getContext( '2d' );

        // Send the video to a canvas
        function drawToCanvas() {
          inputCtx.drawImage( video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, video.videoWidth, video.videoHeight );
          var image = canvas.toDataURL('image/jpeg', 1.0);

          console.log('drawToCanvas()');
          if(config.nifi.enabled) {
            console.log('nifi is enabled. Sending data to nifi url: ' + config.nifi.url);
            var data = {
              metrics: metrics[call.peer],
              image: image
            }

            // NIFI
            $.ajax({
              type: "POST",
              url: config.nifi.url,
              data: data,
              timeout: 10000
            }).error(function (jqXHR, textStatus, errorThrown) {
              console.log("nifi error text: " + textStatus);
              console.log("nifi error thrown: " + errorThrown);
            }).done(function () {
              console.log("nifi ajax done");
              //repeat this every time a new frame becomes available using
              //the browser's build-in requestAnimationFrame method
              //window.requestAnimationFrame( drawToCanvas );

            });
            console.log("ajax sent");
          } // config.nifi.enabled

          if(config.dta.enabled) {
            console.log('dta is enabled. Sending data to dta url: ' + config.dta.url);
            var data = {
              image: image,
              compass: metrics[conn.peer].geolocation.heading || metrics[conn.peer].orientation.compass || 0,
              lat: metrics[conn.peer].geolocation.latitude,
              long: metrics[conn.peer].geolocation.longitude,
              fov: 120
            }

            // NIFI
            $.ajax({
              type: "POST",
              url: config.dta.url,
              data: data,
              timeout: 3000
            }).done(function () {
              console.log("dta ajax done");
              //repeat this every time a new frame becomes available using
              //the browser's build-in requestAnimationFrame method
              //window.requestAnimationFrame( drawToCanvas );

              // repeat this drawToCanvas() function every 3 seconds
              setInterval(function(){ drawToCanvas(); }, 3000);
            });
          } // config.nifi.enabled
        }

        console.log('preparing canplay callback');
        video.addEventListener("canplay", function(ev) {
          console.log('canplay event, trigger drone update, start drawToCanvaS()');
          $("#drone" ).trigger("update");

          // repeat this drawToCanvas() function every 3 seconds
          setInterval(function(){ drawToCanvas(); }, 3000);
        });
      } // end of conditional config.nifi.enabled section

    });

    // Answer the call automatically (instead of prompting user) for demo purposes
    call.answer();

  });

  peer.on('close', function(){
    console.log("peer close");
  });

  peer.on('disconnected', function(){
    console.log("peer disconnected");
    setTimeout(function () {
      console.log("peer attempting to reconnect after waiting 3 seconds");
      peer.reconnect();
    }, 3000);
  });

  peer.on('error', function(err){
    console.log("peer error: " + err.type + ": " + err.message);
    switch (err.type) {
      case "network":
      case "disconnected":
      case "server-error":
      case "socket-error":
      case "socket-closed":
        peer.disconnect();
        break;
      default:
        alert(err.message);
    }
  });

  var positionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };

  function positionUpdate(position) {
    var latitude = position.coords.latitude;
    var longitude = position.coords.longitude;
    map.setView([latitude,longitude],13);
    //L.marker([latitude, longitude]).addTo(map).bindPopup(peer.id);
  }

  function positionError(err) {
    console.warn('errorPosition: ' + err.code + ': ' + err.message);
    map.setView([27.9562929,-82.4376212],16);
  }

  if ( navigator.geolocation ) {
    navigator.geolocation.getCurrentPosition(positionUpdate, positionError, positionOptions);
  }

  $("#mapid").height($(window).height()).width($(window).width());

  map.refresh = function(timeout) {
    window.setTimeout( function() {
      map.invalidateSize();
      console.log("map.invalidateSize()");
    }, timeout);
  };

  $( "#map-container" ).collapsible({
    expand: function( event, ui ) {
      map.invalidateSize();
      console.log("map.invalidateSize()");
    }
  });
});

