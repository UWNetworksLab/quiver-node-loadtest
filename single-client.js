#!/ulg/bin/node
var io = require("socket.io-client");
var process = require("process");
var argv = require('yargs')
    .usage('Usage: $0 [-m measurements] [-c count] [-i interval] server_url')
    .default('measurements', 0)
    .default('count', 1)
    .alias('m', 'measurements')
    .alias('c', 'count')
    .alias('i', 'interval')
    .demand(1)
    .argv;

var socket1, socket2;
var client1, client2;
var host = argv._[0];

function configure_sock(sock) {
    sock.on('connect_error', function(error) {
        console.log("Connection failed:" + JSON.stringify(error));
    });
    return sock;
}

var connectOptions = {
    'transports': ['polling'],  // Force XHR so we can domain-front
    'forceNew': true  // Required for login-after-logout to work
};


//console.log("Connecting to ", host);
for (var i = 0; i < argv.count; i++) {
    socket1 = configure_sock(io.connect(host, connectOptions));
//    console.log(i + ": Connect 1/2");
    socket2 = configure_sock(io.connect(host, connectOptions));
//    console.log(i + ": Connect 2/2");
    client1 = "X_" + i
    client2 = "Y_" + i

    socket1.emit('join', client1);
    socket2.emit('join', client2);
//    console.log(i + ": Done");
}
process.stdout.write(argv.count + " pairs: ");
//console.log("Queued connection of " + argv.count + " pairs");
var latencies = [];
if (argv.measurements > 0) {
//    console.log("Measuring...");
    var start_time = [];
    // prints a given latency in something reasonable, milliseconds.
    function print_lat(lat) {
        return (lat / 1000000.0) + "ms";
    }
    function on_message(event) {
        // hrtime returns a [sec, nsec] pair.
        var end_time = process.hrtime();
        var latency_ns = ((end_time[0] - start_time[0]) * 1000000000) + (end_time[1] - start_time[1]);
//        console.log("Latency is " + print_lat(latency_ns) + ", on event: " + JSON.stringify(event));
        latencies.push(latency_ns);
        if (latencies.length < argv.measurements) {
            socket1.emit('emit', { 'rooms':[client2], 'msg':'Foo' });
        } else {
            // report stats on latencies.
            latencies.sort();
            var min = 1000000000000000.0;
            var max = -1.0;
            var sum = 0;
            for (var idx in latencies) {
                var lat = latencies[idx];
                if (lat < min) { min = lat; }
                if (lat > max) { max = lat; }
                sum = sum + lat;
            }
            var med_idx = 0;
            if (latencies.length % 2 == 1 && latencies.length > 1) {
                med_idx = 1 + Math.floor(latencies.length / 2);
            } else {
                med_idx = Math.floor(latencies.length / 2);
            }
            process.stdout.write("Min: " + print_lat(min) + " \tMedian: " + print_lat(latencies[med_idx]) +
                                 " \tMean: " + print_lat(sum / latencies.length) + " \tMax: " + print_lat(max) + "\n");
            process.exit();
        }
    };
//    socket1.on('message', on_message);
    socket2.on('message', on_message);
//    console.log("Sending message");
    start_time = process.hrtime();
    socket1.emit('emit', { 'rooms':[client2], 'msg':'Foo' });
}


