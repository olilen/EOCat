var version = "v1.0";
var express = require('express');
var https = require('https');
var http = require('http');
var fs = require('fs');
var child_process = require('child_process');
var products = require('./routes/catalogue');
var bodyParser = require('body-parser');


var app = express();


var protocol = (process.argv[2])?process.argv[2]:'http';
var port = (process.argv[3])?process.argv[3]:'3000';

app.use(bodyParser.json({limit:10000000}));
app.use(express.static('public'));

//app.get('/products', products.findAll);
app.get('/:dataset/search', products.search);
app.get('/harvestOADS', products.harvestOADS);
app.get('/products/:id', products.findById);
app.post('/products', products.addProduct);
app.post('/ngEOproducts', products.addProductFromNgEO);
app.post('/hubProducts', products.addProductFromHub);
app.put('/products/:id', products.updateProduct);
app.delete('/products/:id', products.deleteProduct);
app.get('/describe', products.describe);

if(protocol == 'https') {
  try {
    var credentials = {
        key: fs.readFileSync('./ssl/server.key'),
        cert: fs.readFileSync('./ssl/server.crt'),
        rejectUnauthorized: false
    };
  }
  catch (err) {
    console.log("Could not read the server key or certificate in the ./ssl folder.");
  }
  https.createServer(credentials, app).listen(port, function() {console.log("EOCat "+version+" is listening HTTPS on port "+port+"...");});
} else {
  http.createServer(app).listen(port, function() {console.log("EOCat "+version+" is listening HTTP on port "+port+"...");});
}
