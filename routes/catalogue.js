var mongoose = require('mongoose');
var GeoJSON = require('mongoose-geojson-schema');
var mongoosePaginate = require('mongoose-paginate');
var wkt = require('wellknown');
var https = require('https');
var request = require('request');
var url = require('url');
var htmlparser = require('htmlparser2');
var AdmZip = require('adm-zip');
var Converter = require("csvtojson").Converter;
var outputFormaters = require("./outputFormaters");
var inputFormaters = require("./inputFormaters");
var rangeCriteria = require("./openSearchEORangeCriteria");

//var converter = new Converter({delimiter: "\t"});



mongoose.connect('localhost',"products", 27017);
// Use native promises
mongoose.Promise = global.Promise;



//  schema used for products stored in the database. It's basically a geojson feature with the additional attributes:
//		- date, updated, title, links: required for OWS context
//		- parentIdentifier, earthObservation: mapping the o&m metadata
// ToDo:
//			- add missing attributes from the O&M data model
//			- OWS Context is missing a "published" date (from Atom). This concept is needed to implement a subscription or a catalogue feed  (i.e. download/show what's new since a given date)
//								* Is this the "date" attribute ? -> should date be mapped from o&m "resultTime" ?
//			- start and stop attributes are added for search convenience: they are indexed and map the OpenSearch criterii start and stop
//								* TBD: start and stop attributes should be instanciated at ingestion time by
//									aggregating the acquisitionStartTime and acquisitionStopTime attributes of the acquisitionInformation array
//									or
//									start and stop attributes should be removed from the schema, and the OpenSearch criterii start and stop should directly be mapped to the
//									acquisitionStartTime and acquisitionStopTime attributes (the latter being indexed).
//			- earthObservation.productInformation.status to be moved one level up, under earthObservation.status (as status PLANNED could qualify a single acquisition)
//
// this data model assumes that a product is always derived from at least one acquisition.
// Following cases are supported:
// 					- a product derived from one acquisition only, i.e. derived from the data acquired by one sensor/mode of one platform)
//					- a product derived from more than one acquisition (synergetic products), i.e:
//									* derived from the data acquired by several sensor/mode of one platform (not necessarily simutaneously)
//									* derived from the data acquired by different platforms
//					- a single acquisition (no productInformation)

var productSchema = mongoose.Schema({
			identifier: { type: String,	index: true},
    	geometry: mongoose.Schema.Types.GeoJSON,
    	properties: {
    		parentIdentifier: {type: String},
    		date: { type: String},
    		start: { type: Date, index: true}, // for products derived from multiple acquisitions, start/stop is an aggregation of the various acquisition dates
    		stop: { type: Date, index: true},
    		updated: { type: Date, index:true, default: Date.now}, // date when product is made available
    		title: String,
    		links: {
    			data: [{
    				href: {type: String},
						title: {type: String},
						type: {type: String},
						length: {type: Number}
    			}]
    		},
	    	earthObservation: {
	    		acquisitionInformation: [{
	    			platform: {
	    				platformShortName: {type: String},
	    				platformSerialIdentifier: {type: String}
	    			},
	    			sensor: {
	    				instrument: {type: String},
	    				operationalMode: {type: String},
	    				polarisationMode: {type: String},
	            polarisationChannels: {type: String}
	    			},
	    			acquisitionParameter: {
	    				acquisitionStartTime: { type: Date},
	    				acquisitionStopTime: { type: Date},
	    				relativePassNumber: { type: Number},
	    				orbitNumber: { type: Number},
	    				startTimeFromAscendingNode: { type: Number},
	    				stopTimeFromAscendingNode: { type: Number},
	    				orbitDirection: { type: String}
	    			}
	    		}],
	    		productInformation: {
	    			productType: {type: String},
	    			status: {type: String},
	    			timeliness: {type: String},
						size: { type: Number}
	    		}
	    	}

    	}
});

//productSchema.index({ 'geometry': '2dsphere' });
productSchema.path('geometry').index({ type: '2dsphere'});

productSchema.plugin(mongoosePaginate);
var Product = mongoose.model('Product', productSchema);


var db = mongoose.connection;
db.on('error', function() {
	console.log('EOCat could not connect to mongo database via port 27017. Stopping...');
	process.exit(1);
});
db.once('open', function() {
 	console.log("EOCat connected to mongo database via port 27017");
 	Product.count({ }, function (err, count) {
  		console.log('🌍🛰'+'\tFound %d products in the catalogue.', count);

	});
});


exports.search = function(req, res) {

/**
Search requests are "compliant" with EO OpenSearch requests.
Typical search URL is https://server/<dataset>/search?<param>
	where <dataset> is matched to the product parentIdentifier attribute
	if <dataset> is set to "*", search will be done across all datasets
The following search criteria can be used as <param>:
	start: 						e.g. "2016-12-05T16:41:25.000Z", "2016-12-05".   Special values "today+<n>" or "today-<n>" where <n> is a number of days
	stop: 						same constrains as for start
	geom:  						a geomtery in wkt. e.g. "&geom=POLYGON((-118.31 45.82,-113.84 45.83,-113.42 42.35,-119.04 42.39,-120.27 44.42,-118.31 45.82)""
	bbox: 						a lowerLeft/TopRight box, e.g. "&bbox=-180,-90,180,90"
	operationalMode | sensorMode:
	instrument:
	platformShortName:
	platformSerialIdentifier:
	productType:
	parentIdentifier:
	wlog | track:			track number (range notation supported)
	orbitNumber:			orbit number (range notation supported)
	productionStatus:
	orbitDirection:
	availabilityTime: date when product was made available (range notation supported)
	sort:							sorting by start date of the result items. Allowed values: asc | ascending | 1 (Ascending) or desc | descending | -1 (Descending)
**/


	var dataset = req.params.dataset;
	var format = req.query.format;
	var count;
	var geo = null;
	var query;

	// Hack: for the time being, set dataset to value "*" so it is not used as search criteria on parentIdentifier
	// This should be removed once the parentIdentifier is systematically used (mandatory in the schema)
	//dataset = "*";

	// limit number of results to 5000 max
	if(!req.query.count) {
		count = 200;
	} else {
		count = (parseInt(req.query.count) > 2000)?2000:parseInt(req.query.count)
	}

	if(req.query.geom) {
		geo = wkt(req.query.geom);
	} else {
		if(req.query.bbox) {
			console.log("bbox: "+req.query.bbox);
			if(req.query.bbox == '-180,-90,180,90') {
				geo = null;
			} else {
				var bbox = req.query.bbox.split(',');
				console.log("bbox vertex: "+bbox.length);
				//geo.coordinates = [[[bbox[0],bbox[1]],[bbox[2],bbox[1]],[bbox[2],bbox[3]],[bbox[0],bbox[3]],[bbox[0],bbox[1]]]];
				//geo.type = "Polygon";

				geo = {
					type: "Polygon",
					coordinates: [ [[bbox[0],bbox[1]],[bbox[2],bbox[1]],[bbox[2],bbox[3]],[bbox[0],bbox[3]],[bbox[0],bbox[1]]] ],
					// use mongodb custom  crs to allow searching big polygon. This also allows search area defined as a clockwise polygon.
					// see https://www.mongodb.com/blog/post/mongodb-30-features-big-polygon
					crs: {
						type: "name",
						properties: { name: "urn:x-mongodb:crs:strictwinding:EPSG:4326" }
					}
				}
			}
		}
	}

	var filters = [];

	// set geometry criteria
	if(geo) filters.push(
		{ "geometry":
			{
				"$geoIntersects": {
					$geometry: geo
	            		}
			}
		});


		// set start criteria
		if(req.query.start && req.query.stop) {
			filters.push(
				{"properties.start":
					{$lt: new Date(req.query.stop)}
			});
		}

		// set stop criteria
		if(req.query.start && req.query.stop) {
			filters.push(
				{"properties.stop":
					{$gt: new Date(req.query.start)}
			});
		}

		// set other criteria (TBD: should be completed with other attributes)
		if(req.query.operationalMode) filters.push({"properties.earthObservation.acquisitionInformation.sensor.operationalMode" : req.query.operationalMode});
		if(req.query.sensorlMode) filters.push({"properties.earthObservation.acquisitionInformation.sensor.operationalMode" : req.query.sensorlMode});
		if(req.query.instrument) filters.push({"properties.earthObservation.acquisitionInformation.sensor.instrument" : req.query.instrument});
		if(req.query.platformShortName) filters.push({"properties.earthObservation.acquisitionInformation.platform.platformShortName" : req.query.platformShortName});
		if(req.query.platformSerialIdentifier) filters.push({"properties.earthObservation.acquisitionInformation.platform.platformSerialIdentifier" : req.query.platformSerialIdentifier});
		if(req.query.productType) filters.push({"properties.earthObservation.productInformation.productType" : req.query.productType});
		if(req.query.parentIdentifier) filters.push({"properties.parentIdentifier" : req.query.parentIdentifier});
		if(req.query.orbitNumber) filters.push(rangeCriteria.parse(req.query.orbitNumber,"properties.earthObservation.acquisitionInformation.acquisitionParameter.orbitNumber",false));

		if(dataset && dataset != '*') filters.push({"properties.parentIdentifier" : dataset});

		// set track range criteria
		var track;
		if(req.query.wlog) track = req.query.wlog;
		if(req.query.track) track = req.query.track;
		if(track) {
			console.log("track: "+track);
			filters.push(rangeCriteria.parse(track,"properties.earthObservation.acquisitionInformation.acquisitionParameter.relativePassNumber",false)	);
		}
		if(req.query.availabilityTime) {
			console.log("availabilityTime: "+req.query.availabilityTime);
			filters.push(rangeCriteria.parse(req.query.availabilityTime,"properties.updated",true));
		}

		var criteria = (filters.length >= 1)?{$and: filters}:{};

	/*
	var criteria = { };

	// set geometry criteria
	if(geo) criteria.geometry =
		{
			"$geoIntersects": {
				$geometry: geo
            		}
		};

	// set acquisition date citeria
	if(req.query.start && req.query.stop) {
		criteria["properties.start"] = {$lt: new Date(req.query.stop)};
		criteria["properties.stop"] = {$gt: new Date(req.query.start)};
	}

	// TBD: use the accquisitionDates instead


	// set other criteria (TBD: should be completed with other attributes)
	if(req.query.operationalMode) criteria["properties.earthObservation.acquisitionInformation.sensor.operationalMode"] = req.query.operationalMode;
	if(req.query.sensorlMode) criteria["properties.earthObservation.acquisitionInformation.sensor.operationalMode"] = req.query.sensorlMode;
	if(req.query.instrument) criteria["properties.earthObservation.acquisitionInformation.sensor.instrument"] = req.query.instrument;
	if(req.query.platformShortName) criteria["properties.earthObservation.acquisitionInformation.platform.platformShortName"] = req.query.platformShortName;
	if(req.query.platformSerialIdentifier) criteria["properties.earthObservation.acquisitionInformation.platform.platformSerialIdentifier"] = req.query.platformSerialIdentifier;
	if(req.query.productType) criteria["properties.earthObservation.productInformation.productType"] = req.query.productType;
	if(req.query.parentIdentifier) criteria["properties.parentIdentifier"] = req.query.parentIdentifier;

	if(dataset && dataset != '*') criteria["properties.parentIdentifier"] = dataset;

	var track;
	if(req.query.wlog) track = req.query.wlog;
	if(req.query.track) track = req.query.track;
	if(track) {
		console.log("track: "+track);
		criteria["properties.earthObservation.acquisitionInformation.acquisitionParameter.relativePassNumber"] = rangeCriteria.parse(track,parseInt);
	}
*/

	console.log("Query: "+JSON.stringify(criteria));

	//var paginatedQuery = Product.find(criteria).sort({'properties.start': 'desc'}).skip(parseInt(req.query.startIndex-1)).limit(count);
	//var countQuery = Product.count(criteria);

	var offset = parseInt(req.query.startIndex-1);
	var sorting = (req.query.sort)?req.query.sort:'desc';


	Product.paginate(criteria, { sort: {'properties.start': sorting}, offset: offset, limit: count }, function(err, result) {
		if (!err) {
			var response
			switch (format) {
				case "eocat":
					response = {
						type: "FeatureCollection",
						properties: {
							title: "EOCat search response (features as stored natively in EOCat database)",
							updated: new Date(),
							totalResults: result.total.toString(),
							startIndex: (result.offset)?result.offset:1,
							itemsPerPage: result.limit.toString(),
						},
						//features: result.docs.map(outputFormaters.nativeFormat)
						features: result.docs.map(function(a) {return outputFormaters.nativeFormat(a,Product);})
					};
					break;
				case "ngeo":
				case "json":
					response = {
						type: "FeatureCollection",
						id: req.url,
						properties: {
							totalResults: result.total.toString(),
							startIndex: (result.offset)?result.offset:1,
							itemsPerPage: result.limit.toString(),
							title: "EOCat search response (simulating ngEO)",
							updated: new Date()
						},
						features: result.docs.map(function(a) {return outputFormaters.ngeoFormat(a,Product);}),
					};
					break;
				case "owc":
				default:
					response = {
						type: "FeatureCollection",
						id: req.url,
						properties: {
							totalResults: result.total.toString(),
							startIndex: (result.offset)?result.offset:1,
							itemsPerPage: result.limit.toString(),
							links: {
								profiles: [{
									href: "http://www.opengis.net/spec/owc-geojson/1.0/req/core",
									title: "This file is compliant with version 1.0 of OGC Context"
								}]
							},
							lang: "en",
							title: "EOCat search response (as a geojson OWS Context)",
							updated: new Date()
						},
						features: result.docs.map(function(a) {return outputFormaters.owcFormat(a,Product);}),
					};
					break;
			}


			res.send(response);
		} else {
			res.send( err);
		}
	});
};



exports.findById = function(req, res) {
    	var id = req.params.id;
    	console.log('Retrieving product: ' + id);
    	Product.findOne({"identifier": id},function(err,results) {
		if (!err) {
			res.send(results);
		} else {
			res.send( err);
		}
	});
};




function save(records, Model, match){
  match = match || 'id';
  return new Promise(function(resolve, reject){
    var bulk = Model.collection.initializeUnorderedBulkOp();
    records.forEach(function(record){
      var query = {};
      query[match] = record[match];
      bulk.find(query).upsert().updateOne( record );
    });
    bulk.execute(function(err, bulkres){
        if (err) return reject(err);
        resolve(bulkres);
    });
  });
}






exports.addProduct = function(req, res) {
	var dataset = req.query.dataset;
	var products = req.body.map(function(a) {return inputFormaters.mapFromEOCat(a,dataset,Product);});
	console.log('Adding '+ req.body.length +' products in dataset '+req.query.dataset);
	save(products,Product,"identifier").then(
		function(bulkRes){
			console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
			res.send({'report':bulkRes});
		},
		function(err) {
			console.log("Bulk insert error");
		});
}

exports.addProductFromNgEO = function(req, res) {
	var dataset = req.query.dataset;
	var products = req.body.map(function(a) {return inputFormaters.mapFromngEO(a,dataset,Product);});
	//console.log(JSON.stringify(products));
	console.log('Adding '+ req.body.length +' products in dataset '+req.query.dataset);
	save(products,Product,"identifier").then(function(bulkRes){
	console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
	res.send({'report':bulkRes});
	});
}

exports.addProductFromHub = function(req, res) {
	var products = req.body.map(function(a) {return inputFormaters.mapFromHub(a,req.query.dataset,Product);});
	//console.log(JSON.stringify(products));
	console.log('Adding '+ req.body.length +' products in dataset '+req.query.dataset);

	save(products,Product,"identifier").then(function(bulkRes){
	console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
	res.send({'report':bulkRes});
	});


}


exports.updateProduct = function(req, res) {
	var id = req.params.id;
	var product = req.body;
	console.log('Updating product: ' + id);
	console.log(JSON.stringify(product));
	Product.update({'identifier':id}, product, {safe:true}, function(err, result) {
            	if (err) {
                		console.log('Error updating product: ' + err);
                		res.send({'error':'An error has occurred'});
            	} else {
                		console.log('' + result + ' document(s) updated');
                		res.send(product);
            	}
        	});
}

exports.deleteProduct = function(req, res) {
	var id = req.params.id;
	console.log('Deleting product: ' + id);
	Product.remove({'identifier':id}, {safe:true}, function(err, result) {
	            if (err) {
            		res.send({'error':'An error has occurred - ' + err});
            	} else {
            		console.log('' + result + ' document(s) deleted');
                		res.send(req.body);
            	}
        	});
}

exports.harvestOADS = function(req, res) {
	request(
		{
		url: req.query.url,
		rejectUnauthorized: false

		},
		function (error, response, body) {
		 	if (!error && response.statusCode == 200) {
		    		//console.log(body) // Show the HTML

		    var indexFileList = [];
				var message  = 'I will harvest these files: \n';
				var parsedata = new htmlparser.Parser(
					{
					onopentag: function(name, attribs){
			    			if(name === "a"){
			        				indexFileList.push(attribs.href)
			        				message = message+'\t'+attribs.href+'\n';
			    			}
			    		}
			    	});
				parsedata.write(body);
				parsedata.end();
				console.log(indexFileList.length + " Index files to process...");
				processIndexFilesRecusively(req.query.dataset, req.query.url, indexFileList, 0);
				res.send(message);


		 	}
		}
	);
}

var processIndexFilesRecusively = function(dataset,baseUrl,indexFileList,cursor) {

	console.log("File " + cursor + ": "+baseUrl+indexFileList[cursor]);
	request(
		{
		url: (baseUrl+'/'+indexFileList[cursor]),
		rejectUnauthorized: false,
		encoding: null
		},
		function (error, response, body) {
		 	if (!error && response.statusCode == 200) {

				var zip = new AdmZip(body);
				var zipEntries = zip.getEntries();
				zipEntries.forEach(function (zipEntry) {
					//console.log(zipEntry.getData().toString('utf8'));
					var converter = new Converter({delimiter: "\t"});
					converter.fromString(zipEntry.getData().toString('utf8'), function(err,result){
						addProductFromIndex(dataset,result);
					});
				});
				if((cursor + 1) < indexFileList.length) {
					processIndexFilesRecusively(dataset,baseUrl,indexFileList,cursor+1);
				}
			}


		}
	);

}



var addProductFromIndex = function(dataset,data) {
	//console.log(JSON.stringify(data));
	var products = data.map(function(a) {return inputFormaters.mapFromIndex(a,dataset);});
	//console.log(JSON.stringify(data));
	console.log(products.length +' products found in Index file ');
	//console.log('Adding products: ' + JSON.stringify(products));

        	save(products,Product,"identifier").then(function(bulkRes){
      		console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
      		//res.send({'report':bulkRes});
	});


}
