#!/bin/bash
#trap "" SIGCHLD

pkill node; sleep 1; 
for i in $(seq 100 100 1000)
do 
  (cd ../freedom-social-quiver-server; npm start >/dev/null) &
  sleep 1
  ./single-client.js -c $i -m 10 http://localhost:8080
  pkill -INT node
  sleep 5
done

