var version = "v1.0";
var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');
var child_process = require('child_process');
var products = require('./routes/catalogue');
var bodyParser = require('body-parser');



var app = express();
var expressWs = require('express-ws');

var protocol = (process.argv[2])?process.argv[2]:'http';
var port = (process.argv[3])?process.argv[3]:'3000';

app.use(bodyParser.json({limit:10000000}));
app.use(express.static('public'));

/*
app.use(function (req, res, next) {
  console.log('middleware');
  return next();
});
*/

var server;
if(protocol == 'https') {
  try {
    var credentials = {
        key: fs.readFileSync('./ssl/key.pem'),
        cert: fs.readFileSync('./ssl/cert.pem'),
        rejectUnauthorized: false
    };
  }
  catch (err) {
    console.log("ERROR: EOCat server not started (Could not read the server key or certificate in the ./ssl folder)");
    process.exit(1);
  }
  server = https.createServer(credentials, app);
  expressWs(app,server);
  server.listen(port, function() {console.log("EOCat "+version+" is listening HTTPS on port "+port+"...");});
} else {
  server = http.createServer(app);
  expressWs(app,server);
  server.listen(port, function() {console.log("EOCat "+version+" is listening HTTP on port "+port+"...");});
}


//app.get('/products', products.findAll);
app.get('/:dataset/search', products.search);
app.get('/odata/products', products.odata);
app.get('/harvestOADS', products.harvestOADS);
app.ws('/harvestDHUS', products.harvestDHUS);
app.ws('/harvestDHUSQuery', products.harvestDHUSQuery);
app.get('/products/:id', products.findById);
app.post('/products', products.addProduct);
app.post('/ngEOproducts', products.addProductFromNgEO);
app.post('/hubProducts', products.addProductFromHub);
app.put('/products/:id', products.updateProduct);
app.delete('/products/:id', products.deleteProduct);
app.get('/describe', products.describe);

