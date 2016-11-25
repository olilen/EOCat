#!/bin/bash
rm ssl/*
rmdir ssl
mkdir ssl
pwgen 50 1 -s
#openssl genrsa -des3 -out ssl/ca.key 1024
#openssl req -new -key ssl/ca.key -out ssl/ca.csr
#openssl x509 -req -days 365 -in ssl/ca.csr -out ssl/ca.crt -signkey ssl/ca.key
openssl genrsa -des3 -out ssl/server.key 1024
openssl req -new -key ssl/server.key -out ssl/server.csr
cp ssl/server.key ssl/server.key.passphrase
openssl rsa -in ssl/server.key.passphrase -out ssl/server.key
openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt
