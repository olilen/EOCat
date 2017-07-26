#!/bin/bash
rm ssl/*
rmdir ssl
mkdir ssl


# This generates a self-signed certificate

#openssl genrsa -des3 -out ssl/server.key 1024
#openssl req -new -key ssl/server.key -out ssl/server.csr
#cp ssl/server.key ssl/server.key.passphrase
#openssl rsa -in ssl/server.key.passphrase -out ssl/server.key
#openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt



# This generates a non signed certificate

openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365
# Following line can be commented if the passphrase option line is uncommented in eocatserver.js
openssl rsa -in ssl/key.pem -out ssl/newkey.pem && mv ssl/newkey.pem ssl/key.pem
