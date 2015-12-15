#!/bin/bash
#trap "" SIGCHLD
WAIT=${1:-10}
NCLIENTS=${2:-1000}
MINCLIENTS=${3:-100}

pkill node; sleep 1;
for i in $(seq $MINCLIENTS $(((NCLIENTS-MINCLIENTS) / 10)) $NCLIENTS)
do
    (cd ../freedom-social-quiver-server; DEBUG=engine npm start ) &
    sleep 1
    node single-client.js -p $i -m 10 -w $WAIT http://localhost:8080
    pkill -INT node
    sleep 5
done

