var version = "v1.0";
var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');
var child_process = require('child_process');
var products = require('./routes/catalogue');
var bodyParser = require('body-parser');


// start mongodb
/*
console.log(shell.pwd().stdout);
if (shell.exec('mongod --config ./conf/mongod.conf &').code !== 0) {
  console.log('Error: Failed to start mongodb');
}
*/
/*
var mongoProcess = child_process.spawn('mongod',['--config','./conf/mongod.conf'], {async:true});
mongoProcess.stdout.on('data', function(data) {
  console.log(data);
});
*/
var app = express();

var credentials = {
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.crt'),
    //ca: fs.readFileSync('./ssl/ca.crt'),
    //requestCert: true,
    rejectUnauthorized: false
};

var protocol = (process.argv[2])?process.argv[2]:'http';
var port = (process.argv[3])?process.argv[3]:'3000';

app.use(bodyParser.json({limit:10000000}));

//app.get('/products', products.findAll);
app.get('/:dataset/search', products.search);
app.get('/harvestOADS', products.harvestOADS);
app.get('/products/:id', products.findById);
app.post('/products', products.addProduct);
app.post('/ngEOproducts', products.addProductFromNgEO);
app.post('/hubProducts', products.addProductFromHub);
app.put('/products/:id', products.updateProduct);
app.delete('/products/:id', products.deleteProduct);

if(protocol == 'https') {
  https.createServer(credentials, app).listen(port, function() {console.log("EOCat "+version+" is listening HTTPS on port "+port+"...");});
} else {
  http.createServer(app).listen(port, function() {console.log("EOCat "+version+" is listening HTTP on port "+port+"...");});
}
