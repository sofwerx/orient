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

  $( ".captureButton" ).bind( "click", function(event, ui) {
    console.log("Capture button clicked");
    if(drones.length >= 3) {
      console.log("3 or more drones available, sending Update action to each drone");
      var date = new Date();
      var timestamp = date.getTime();
      updates[timestamp] = {};
      $.each( drones, function( peer, drone) {
        console.log("Enumerating drone peer " + peer);
        $.each( drones[peer], function( index, conn) {
          console.log("sending Update action to peer " + peer + " index " + index);
          drone.send({
            action: "Update",
	    timestamp: timestamp
	  });
        });
      });
    }
  });

  function processReceivedData(conn, data) {
    switch (data.action) {
      case "Updated":
        console.log("Updated action received from a drone: " + data);

        // If triangulate is enabled and we have been given a timestamp to correlate
	if(config.triangulate.enabled && data.timestamp) {
          console.log("triangulate is enabled");

          // Push the Updated message objlob property to the timestamp correlated array
	  updates[data.timestamp].push(data.objlob);

          // If we have >= 3 updated messages to process, call Triangulate
	  if(Object.keys(updates[data.timestamp]).count >= 3) {

            // We have collected >= 3 objlob responses.

	    // These are the coords for Triangulate's TargetLocate
	    data = {
	      "coords": updates[data.timestamp]
	    }

            $.ajax({
              type: "POST",
              url: config.triangulate.url,
              data: data,
              timeout: 10000
            }).error(function (jqXHR, textStatus, errorThrown) {
              console.log("triangulate error text: " + textStatus);
              console.log("triangulate error thrown: " + errorThrown);
            }).done(function (result) {
              console.log("triangulate ajax done");

             if(result.hasIntersect) {
                console.log("triangulate intersection found!");
               if(triangulated) {
                 var newLatLng = new L.LatLng(result.targetLoc.lat, result.targetLoc.lon);
                 triangulated.setLatLng(newLatLng); 
                 console.log("triangulate map location updated");
               } else {
                 triangulated = L.marker([result.targetLoc.lat, result.targetLoc.lon]).addTo(map);
                 triangulated.bindPopup("Triangulated");
                 console.log("triangulate map location created");
               }
	     }
            });
            console.log("triangulate ajax sent");

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
	if(drones.length >= 3) {
          console.log("3 or more drones, enabling capture button");
          $('#captureButton').removeClass('ui-state-disabled');
	}
        break;
      case "orientation":
        /* Do something with the received x,y,z,absolute,alpha,beta,gamma */
        $( "#" + conn.peer + " td.orientationX").html(data.x);
        $( "#" + conn.peer + " td.orientationY").html(data.y);
        $( "#" + conn.peer + " td.orientationZ").html(data.z);
        $( "#" + conn.peer + " td.motionAbsolute").html(data.absolute);
        $( "#" + conn.peer + " td.motionAlpha").html(data.alpha);
        $( "#" + conn.peer + " td.motionBeta").html(data.beta);
        $( "#" + conn.peer + " td.motionGamma").html(data.gamma);
        $( "#" + conn.peer + " td.heading").html(data.heading);
        $( "#" + conn.peer + " td.speed").html(data.speed);
        $( "#" + conn.peer + " td.accuracy").html(data.accuracy);

        // Remember the orientation metrics so we can send them along with an image
	if(!metrics[conn.peer]) {
	  metrics[conn.peer] = {};
        }
	if(!metrics[conn.peer].orientation) {
	  metrics[conn.peer].orientation = {};
        }
	metrics[conn.peer].orientation.x = data.x;
	metrics[conn.peer].orientation.y = data.y;
	metrics[conn.peer].orientation.z = data.z;
	metrics[conn.peer].orientation.absolute = data.absolute;
	metrics[conn.peer].orientation.alpha = data.alpha;
	metrics[conn.peer].orientation.beta = data.beta;
	metrics[conn.peer].orientation.gamma = data.gamma;
	metrics[conn.peer].orientation.heading = data.heading;
	metrics[conn.peer].orientation.speed = data.speed;
	metrics[conn.peer].orientation.accuracy = data.accuracy;
        break;
      case "geolocation":
        console.log("geolocation: " + conn.peer + ": " + JSON.stringify(data));
        /* Do something with the received latitude, longitude */
        var marker = markers[conn.peer];
        if(marker) {
          var newLatLng = new L.LatLng(data.latitude, data.longitude);
          marker.setLatLng(newLatLng); 
        } else {
          marker = L.marker([data.latitude, data.longitude]).addTo(map);
          marker.bindPopup(conn.peer);
          markers[conn.peer] = marker;
        }
        $( "#" + conn.peer + " td.geolocationLatitude").html(data.latitude);
        $( "#" + conn.peer + " td.geolocationLongitude").html(data.longitude);

        // Remember the geolocation metrics so we can send them along with an image
	if(!metrics[conn.peer]) {
	  metrics[conn.peer] = {};
        }
	if(!metrics[conn.peer].geolocation) {
	  metrics[conn.peer].geolocation = {};
        }
	metrics[conn.peer].geolocation.latitude = data.latitude;
	metrics[conn.peer].geolocation.longitude = data.longitude;
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
          var image = canvas.toDataURL('image/png', 1.0);

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
	      compass: metrics[conn.peer].geolocation.heading,
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
    L.marker([latitude, longitude]).addTo(map).bindPopup(peer.id);
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

