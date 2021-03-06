// drone page
$(document).on('pagebeforeshow', '#drone' ,function(){
  console.log("pagebeforeshow drone");
});

$(document).on('pageinit', '#drone' ,function(){
  console.log("pageinit drone");
});

$(document).on('pageshow', '#drone' ,function(){
  console.log("pageshow drone");

  var x;
  var y;
  var z;
  var absolute;
  var alpha;
  var beta;
  var gamma;
  var change;
  var heading;
  var compass;
  var latitude;
  var longitude;
  var speed;
  var accuracy;
  var drones = {};
  var admins = {};
  var debounce = {};
  var object_scores;
  var object_found;
  var speed;

  // Compatibility shim
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

  var inputVideo = $( "#my-video" )[0];
  var inputCanvas = $( "#my-canvas" )[0];
  var inputCtx = inputCanvas.getContext( '2d' );

  // Send the video to a canvas
  //function drawToCanvas() {
    // draw the current frame of localVideo onto the canvas,
    // starting at 0, 0 (top-left corner) and covering its full
    // width and heigth
  //  inputCtx.drawImage( inputVideo, 0, 0, inputVideo.videoWidth, inputVideo.videoHeight );
  //
  //}
  //repeat this every time a new frame becomes available using
  //the browser's build-in requestAnimationFrame method
  //window.requestAnimationFrame( drawToCanvas );

  // Prepare the audio/video stream
  navigator.getUserMedia(config.media, function(stream){
    // View our self-view
    $('#my-video').prop('src', URL.createObjectURL(stream));

    // Mute our microphone by disabling the audio track on our local stream
    stream.getAudioTracks()[0].enabled = false;
/*
    inputVideo.addEventListener("canplay", function(ev) {
      console.log("canplay: " + inputVideo.videoWidth + " " + inputVideo.videoHeight);
      $("#my-canvas").width(inputVideo.videoWidth);
      $("#my-canvas").height(inputVideo.videoHeight);
      $("#drone" ).trigger("update");
      drawToCanvas();
    });
    // Remember our self-view stream from canvas rendered from video
    window.localStream = $("#my-canvas")[0].captureStream();
*/
    // Remember our self-view stream directly from video
    window.localStream = stream;
  }, function(e){ console.log("Error in getUserMedia(): " + e.message); });

  // PeerJS object
  var peer = new Peer({
    host: window.location.hostname,
    port: config.port,
    secure: config.secure,
    path: '/peerjs',
    debug: 3,
    config: config.peer
  });

  var degtorad = Math.PI / 180; // Degree-to-Radian conversion

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
      case "Update":
        console.log("Update action received");
	if(debounce[data.timestamp]) {
          console.log("Already processed this Update message, skipiing");
	  break;
	}
	debounce[data.timestamp] = 1;

        // Take a capture of the local stream to a canvas, then send that canvas to obj_lob
        if(config.objlob.enabled) {
          console.log("objlob is enabled");

          inputCtx.drawImage( inputVideo, 0, 0, inputVideo.videoWidth, inputVideo.videoHeight, 0, 0, inputVideo.videoWidth, inputVideo.videoHeight );
          var image = inputCanvas.toDataURL('image/jpeg', 1.0);

          // objlob API POST JSON
          query = {
            "compass": heading || compass,
            "fov": 120,
            "image": image,
            "peer": peer.id,
            "timestamp": data.timestamp,
            "idclass": data.idclass,
            "threshhold": data.threshhold
          };

          $.ajax({
            type: "POST",
            url: config.objlob.url,
            data: JSON.stringify(query),
            timeout: 20000
          }).error(function (jqXHR, textStatus, errorThrown) {
            console.log("objlob error text: " + textStatus);
            console.log("objlob error thrown: " + errorThrown);
          }).done(function ( resp ) {
            console.log("objlob ajax done: " + JSON.stringify(resp));

            // Send the objlob back to Admin as an Updated action
            $.each( admins, function(peer, admin) {
              $.each( admin, function(index, conn) {
                console.log("objlob sending Updated to " + conn.peer);
	        conn.send({
	          action: "Updated",
                  timestamp: data.timestamp,
		  resp: resp,
                  objlob: {
	            lat: latitude,
	            lon: longitude,
                    aob: resp.aob,
	            angleUnit: "deg"
                  }
	        });
	      }); // each conn
	    }); // each admin
          }); // ajax done()
        }
        break;
      case "Drone":
        // We now have a data connection open to a neighboring Drone
	  // Remember all drone connections for this peer
        if(!drones[conn.peer]) {
          drones[conn.peer] = [];
        }
        drones[conn.peer].push(conn);
        break;
      case "Admin":
        console.log("Admin received from " + conn.peer);

	  // Remember this latest Admin connection for this peer
        admins[conn.peer] = [ conn ];

        // Initiate a call to this new Admin
        var call = peer.call(conn.peer, window.localStream);
        // Wait for stream on the call, then set peer video display
        /*call.on('stream', function(stream){
          $('#their-video').prop('src', URL.createObjectURL(stream));
        });*/
        break;
      default:
        console.log("Unknown message " + data.action + " received from " + conn.peer + ": " + JSON.stringify(data));
    }

  }

  function updateHeader() {
    $( "#my-header" ).html("Orient: Drone: " + peer.id);
    $( "#my-header" ).trigger("create");
  }

  peer.on('open', function(id){
    console.log("peer open: my peer id is " + id);
    updateHeader();
    peer.listAllPeers(function(neighbors) {
      $.each( neighbors, function(index, neighbor) {
        if(neighbor != id) {
          console.log("peer open connecting to peer " + neighbor);
          var conn = peer.connect( neighbor, { serialization: "json" });
	    conn.on('open', function(id) {
            console.log("connection open outbound");
 
            /* Deal with received data from a neighbor */
            conn.on('data', function(data) {
              processReceivedData(conn, data);
            });

            /* As we start up, tell our neighbors we are a Drone */
            conn.send({
              action: "Drone"
            });
          });
        }
      });
    });
  });

  peer.on('connection', function(conn) {
    console.log("peer connection inbound from " + conn.peer);
    conn.on('open', function(id) {
      console.log("connection open inbound");
 
      /* Deal with received data from a neighbor */
      conn.on('data', function(data) {
        processReceivedData(conn, data);
      });

      /* As we start up, tell our neighbors we are a Drone */
      conn.send({
        action: "Drone"
      });
    });
    conn.on('close', function() {
      console.log("connection close");
    });
    conn.on('error', function(err) {
      console.log("connection error: " + err.message);
    });
  });

  // Receiving a call
  peer.on('call', function(call){
    console.log("peer call");
    // Answer the call automatically (instead of prompting user) for demo purposes
    call.answer(window.localStream);
    call.on('stream', function(remoteStream) {
      // Show stream in some video/canvas element.
      console.log("call on answered stream");
    });
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

  function handleOrientation(event) {
    alpha = event.alpha; 
    beta = event.beta; 
    gamma = event.gamma; 
    compass = compassHeading(alpha, beta, gamma);

    // Send our DeviceOrientation and DeviceMotion directly to our Admins
    $.each( admins, function( index, conns) {
      $.each( conns, function( index, conn) {
        if(conn.open) {
          conn.send({
            action: "orientation",
            absolute: absolute,
            compass: compass,
            alpha: alpha,
            beta: beta,
            gamma: gamma,
            change: change
          });
        }
      });
    });
  }

  window.addEventListener("deviceorientation", handleOrientation, true);

/*
  function handleMotion(event) {
    // Send our DeviceOrientation and DeviceMotion directly to our Admins
    $.each( admins, function( index, conns) {
      $.each( conns, function( index, conn) {
        if(conn.open) {
          conn.send({
            action: "motion",
            accelleration: event.acceleration,
            accellerationIncludingGravity: event.accelerationIncludingGravity,
            rotationRate: event.rotationRate,
            interval: event.interval
          });
        }
      });
    });
  }

  window.addEventListener("devicemotion", handleMotion, true);
*/

  function positionUpdate(position) {
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    if(position.coords.heading) { heading = position.coords.heading; console.log("heading="+position.coords.heading); }
    if(position.coords.speed) { speed = position.coords.speed; console.log("speed="+position.coords.speed); }
    if(position.coords.accuracy) { accuracy = position.coords.accuracy; }

    // Send our GeoLocation directly to the Admins
    $.each( admins, function( index, conns) {
      $.each( conns, function( index, conn) {
        if(conn.open) {
          conn.send({
            action: "geolocation",
            latitude: latitude,
            longitude: longitude,
            heading: heading,
            speed: speed,
            accuracy: accuracy
          });
        }
      });
    });
  }

  var positionOptions = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0
  };

  function positionError(err) {
    console.warn('errorPosition: ' + err.code + ': ' + err.message);
    navigator.geolocation.watchPosition(positionUpdate, positionError, positionOptions);
  }

  if ( navigator.geolocation ) {
    navigator.geolocation.watchPosition(positionUpdate, positionError, positionOptions);
  } else {
    alert("GeoLocation is not available");
  }

  $( window ).on( "orientationchange", function( event ) {
    change = event.orientation;
    $( "#orientation" ).text( "This device is in " + event.orientation + " mode!" );
  });

  // Trigger an orientationchange event
  $( window ).orientationchange();
});

