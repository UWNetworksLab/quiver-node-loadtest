#!/bin/bash
#trap "" SIGCHLD
DEFAULT_WAIT=10
WAIT=${1:-$DEFAULT_WAIT}

pkill node; sleep 1; 
for i in $(seq 100 100 1000)
do 
  (cd ../freedom-social-quiver-server; npm start >/dev/null) &
  sleep 1
  node single-client.js -p $i -m 10 -w $WAIT http://localhost:8080
  pkill -INT node
  sleep 5
done

