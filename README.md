# EOCat
###EOCat is a simple Earth Observation Catalogue server based on node.js express and mongoose.

EOCat supports product search requests compliant with the “OpenSearch for EO” standard (OGC-13-126) and returns search results in the form of an OGC OWS Context document encoded in geoJson (OGC-14-055) (experimental).


Web Site: https://obarois.github.io/EOCat-v1/

Setup Instructions:

Set-up on macos (tested on v10.11+)

1- Install node :
> https://nodejs.org

2- install homebrew package manager:
> /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

3- install mongodb:
> brew install mongodb

4- change dir to the root directory of EOCat (where this INSTALL file is located)

5- install all node module dependencies required by EOCat (this creates a dir ./node_modules)
> npm install

6- generate server key and certificate (needed if using https)
> ./utilities/generate_ssl_keycert.sh


7- You should now be OK to go... Use the provided eocat script to operate the EOCat server:
Usage: ./eocat  OPTIONS
OPTIONS:
   -h      Show this message
   -c      Check status of EOcat server and mongod processes
   -s      Start the EOCat server and mongodb
   -p port Set port number the catalogue server will listen too (default 3000)
   -S      use https protocol (default http)
   -e      Stop the EOCat server and mongodb

Should it not find them, the eocat script creates the folders ../eocatdata/mongodb (mongodb database) and ../eocatdata/log (mongodb log file).
The script first starts the mongodb database (on port 27017), then the EOCat server, and finally opens the EOCat server home page in your default Browser application



Examples:
  - Start an EOCat server listening to https on port 3443: > ./eocat -s -S -p 3443
  - Start an EOCat server listening to http on port 8080: > ./eocat -s  -p 8080
  - Start an EOCat server listening to http on port 3000: > ./eocat -s


8- Testing
Assuming EOCat was started with command ./eocat -s

Populate the catalogue with 1 test product:
> curl -H "Content-Type: application/json" --data @./test-data/testProduct.json http://localhost:3000/products?dataset=test%20Dataset

Find it (use a web browser):
http://localhost:3000/*/search
http://localhost:3000/testDataset/search

Get product by its id:
http://localhost:3000/products/test%20product%201

To clean things up after testing:
> ./eocat -e
> rm -R ../eocatdata

To populate the database with more data, use the Harvester utility (link on top of the server home page)


