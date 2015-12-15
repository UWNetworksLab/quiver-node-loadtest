var io = require("socket.io-client");
var process = require("process");
var util = require("util");
var argv = require('yargs')
    .usage('Usage: $0 [-m measurements] [-p pairs] [-w wait_ms] server_url')
    .default('measurements', 0)
    .default('pairs', 1)
    .default('wait', 0)
    .alias('m', 'measurements')
    .alias('p', 'pairs')
    .alias('w', 'wait')
    .demand(1)
    .argv;

var sprintf = require("sprintf").sprintf;

var host = argv._[0];
var attempted_connect_count = 0;
var connected_count = 0;
var connect_interval_id = 0;
var first_connect_time;
var failures = 0;
var now_measuring = 0;
var client_stack = [];

function save_client_stack(socket1, socket2, client1, client2, index) {
    // Due to the way save_client_stack is called, 'index' should also
    // be the index into client_stack.
    client_stack.push( {
        "socket1" : socket1,
        "socket2" : socket2,
        "client1" : client1,
        "client2" : client2,
        "index" : index,
        "failures" : 0,
        "successes" : 0
    } );
}

function print_lat(lat) {
    return sprintf("%8.3fms", (lat / 1000000.0));
}

function lat_diff_ns(end, start) {
    return ((end[0] - start[0]) * 1000000000) + (end[1] - start[1]);
}

var failure_counts={};
function status_text() {
    return connected_count + " successes, " + failures + " total failures. (" + (connected_count + failures) + " total)";
}
// returns true if this is the first failure of this kind.
function add_failure(failure) {
    var name = JSON.stringify(failure);
    failures++;
    process.stdout.write("\r" + status_text());
    if (failure_counts[name] === undefined) {
        failure_counts[name] = 1;
        return true;
    } else {
        failure_counts[name]++;
        return false;
    }
}

// On the last connected socket, run start_measurement().
function configure_sock(sock, index) {
    sock.index = index;
    function sock_failure(error) {
        if (now_measuring > 0) {
            console.log("\n\n Getting more results than requests\n");
        }
        if (add_failure(error)) {
            process.stdout.write("\rNew failure: " + JSON.stringify(error) + "                                             \n");
        }
        client_stack[index].failures++;
        if (failures + connected_count == 2*argv.pairs) {
            now_measuring++;
            start_measurement(lat_diff_ns(process.hrtime(), first_connect_time));
        }
    };
    function sock_success() {
        if (now_measuring > 0) {
            console.log("\n\n Getting more results than requests\n");
        }
        connected_count++;
        process.stdout.write("\r" + status_text());
        client_stack[index].successes++;
        if (failures + connected_count == 2 * argv.pairs) {
            now_measuring++;
            start_measurement(lat_diff_ns(process.hrtime(), first_connect_time));
        }
    }
    sock.on('connect', sock_success);
    sock.on('connect_error', sock_failure);
    sock.on('connect_timeout', sock_failure);
    return sock;
}

var connectOptions = {
    'transports': ['polling'],  // Force XHR so we can domain-front
    'forceNew': true,  // Required for login-after-logout to work
    'reconnection': false
};


function connect_pair() {
    if (attempted_connect_count >= argv.pairs) {
        clearInterval(connect_interval_id);
        return;
    } else {
        var socket1, socket2;
        var client1, client2;

        socket1 = configure_sock(io.connect(host, connectOptions), attempted_connect_count);
        socket2 = configure_sock(io.connect(host, connectOptions), attempted_connect_count);

        client1 = "X_" + attempted_connect_count;
        client2 = "Y_" + attempted_connect_count;

        socket1.emit('join', client1);
        socket2.emit('join', client2);
        // Save these objects for later retrieval -- we have to figure
        // out which one to use for measurement, and that'll be the
        // last pair that has both sides successfully connected.
        save_client_stack(socket1, socket2, client1, client2, attempted_connect_count);
        attempted_connect_count++;
    }
}

first_connect_time = process.hrtime();
connect_interval_id = setInterval(connect_pair, argv.wait);

var latencies = [];
function start_measurement(lat_ns) {
    if (argv.measurements > 0) {
        // Find the highest-numbered pair where both sides work.
        var index = client_stack.length - 1;
        var socket1, socket2, client2;
        while (index >= 0 && client_stack[index].successes < 2) {
            index--;
        }
        if (index < 0) {
            console.log("\n\nFAILED: No successfully-connected pairs available to use for measurement.");
            return;
        } else {
            process.stdout.write("\nSkipped " + (client_stack.length - 1 -index) + " socket pairs to find " +
                                 "one that connected successfully.\n");
            socket1 = client_stack[index].socket1;
            socket2 = client_stack[index].socket2;
            client2 = client_stack[index].client2;
        }

        // Print out a timing, failure, and argument report before doing the measurement.
        process.stdout.write("Took " + print_lat(lat_ns) + " for " + status_text());
        if (Object.keys(failure_counts).length > 0) {
            process.stdout.write(", with failures:\n");
            for (var k in failure_counts) {
                if (failure_counts.hasOwnProperty(k)) {
                    process.stdout.write(k + ": " + failure_counts[k] + "\n");
                }
            }
        } else {
            process.stdout.write("\n");
        }
        process.stdout.write(argv.pairs + " pairs (" + (2*argv.pairs) + " clients) w/" + argv.wait + "ms wait\n  ");

        // Start the measurement
        var start_time = [];
        // prints a given latency in something reasonable, milliseconds.
        function on_message(event) {
            // hrtime returns a [sec, nsec] pair.
            var end_time = process.hrtime();
            var latency_ns = lat_diff_ns(end_time, start_time);
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
                process.stdout.write("\tMin: " + print_lat(min) + " \tMedian: " + print_lat(latencies[med_idx]) +
                                     " \tMean: " + print_lat(sum / latencies.length) + " \tMax: " + print_lat(max) + "\n");
                process.exit();
            }
        };
        //    socket1.on('message', on_message);
        socket2.on('message', on_message);
        //    console.log("Sending message");
        start_time = process.hrtime();
        socket1.emit('emit', { 'rooms':[client2], 'msg':'Foo' });
    } else {
        process.stdout.write("\n");
    }
}

