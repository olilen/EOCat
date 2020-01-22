# EOCat
EOCat is a simple Earth Observation Catalogue server based on node.js express and mongoose.<br>

EOCat supports product search requests compliant with the “OpenSearch for EO” standard (OGC-13-126) and returns search results in the form of an OGC OWS Context document encoded in geoJson (OGC-14-055) (experimental).


Web Site: https://obarois.github.io/EOCat-v1/

## Setup Instructions:

>These are instructions for macos (tested on v10.11+)<br>
Refer to https://www.mongodb.com fot installing Mongodb on other platform and skip step 2 and 3


1. Install node :
```
https://nodejs.org
```

2. install homebrew package manager:
```
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

3. install mongodb:
```
brew install mongodb
```

4. change dir to the root directory of EOCat (where this INSTALL file is located)
```
cd <eocat dir>
```

5. install all node module dependencies required by EOCat (this creates a dir ./node_modules)
```
npm install
```

6. generate server key and certificate (needed if using https)
```
./utilities/generate_ssl_keycert.sh
```


7. You should now be OK to go... <br>

Use the provided eocat script to start the EOCat server. To see options, use `./eocat`<br>

To start an EOCat server listening to https on port 3443:
```
./eocat -s -S -p 3443
```
To start an EOCat server listening to http on port 8080:
```
./eocat -s  -p 8080
```
To start an EOCat server listening to http on port 3000:
```
./eocat -s
```
<br>
The script first starts the mongodb database (on port 27017), then the EOCat Web server, and finally opens the EOCat home page in your default Browser application.

Should it not find them, the eocat script creates the folders __../eocatdata/mongodb__ (mongodb database) and __../eocatdata/log__ (mongodb log file).


8. Try it out

>Assuming EOCat was started with command __./eocat -s__

Populate the catalogue with 1 test product:
```
curl -H "Content-Type: application/json" --data @./test-data/testProduct.json http://localhost:3000/products?dataset=test%20Dataset
```

Find it (use a web browser):
```
http://localhost:3000/*/search
http://localhost:3000/testDataset/search
```

Get product by its id:
```
http://localhost:3000/products/test%20product%201
```

Get the catalogue population (experimental):
```
http://localhost:3000/describe
```

9. Clean things up

To clean things up after trying out:

Stop the server and MongoDB database:
```
./eocat -e
```

Delete the entire Mongodb database:
```
rm -R ../eocatdata
```

To populate the database with Sentinel metadata from ESA's Datahub, use the Harvester utility:
> Note: The eocat server must be started in __https__

Go through step 6 and start server with `./eocat -s -S -p 3443`

Use the harvester:
```
https://localhost:3443/harvester.html
```


