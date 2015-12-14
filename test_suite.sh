#!/bin/bash
#trap "" SIGCHLD
WAIT=${1:-10}
NCLIENTS=${2:-1000}

pkill node; sleep 1;
for i in $(seq 100 $(((NCLIENTS-100) / 10)) $NCLIENTS)
do
    (cd ../freedom-social-quiver-server; npm start >/dev/null) &
    sleep 1
    node single-client.js -p $i -m 10 -w $WAIT http://localhost:8080
    pkill -INT node
    sleep 5
done

