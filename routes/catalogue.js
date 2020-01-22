var mongoose = require('mongoose');
var GeoJSON = require('mongoose-geojson-schema');
var mongoosePaginate = require('mongoose-paginate');
var wkt = require('wellknown');
var https = require('https');
var request = require('request-promise');
var cheerio = require('cheerio');
const {URL, URLSearchParams} = require('url');
var htmlparser = require('htmlparser2');
var AdmZip = require('adm-zip');
var Converter = require("csvtojson").Converter;
var outputFormaters = require("./outputFormaters");
var inputFormaters = require("./inputFormaters");
var rangeCriteria = require("./openSearchEORangeCriteria");
var odata = require('odata-v4-mongodb');
var Promise = require("bluebird");
//var parse = require('url-parse')

//var converter = new Converter({delimiter: "\t"});
// Use native promises
mongoose.Promise = Promise;


var promise = mongoose.connect('mongodb://localhost:27017/products', {
  useMongoClient: true,
  /* other options */
});
//mongoose.connect('localhost',"products", 27017);
promise.then(function(db) {

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
});




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
			type: {$type: String,	default: "Feature", required: true},
			id: { $type: String,	index: true, required: true, unique: true},
			geometry: mongoose.Schema.Types.Geometry,
    	properties: {
    		date: { $type: String},
    		updated: { $type: Date, index:true, default: Date.now}, // date when product is made available
    		title: {$type: String},
    		links: {
    			data: [{
    				href: {$type: String},
						title: {$type: String},
						type: {$type: String},
						length: {$type: Number}
    			}]
    		},
	    	earthObservation: {
					parentIdentifier: {$type: String, index:true},
					status: {$type: String},
	    		acquisitionInformation: [{
	    			platform: {
	    				platformShortName: {$type: String},
	    				platformSerialIdentifier: {$type: String}
	    			},
	    			sensor: {
	    				instrument: {$type: String},
	    				operationalMode: {$type: String},
	    				polarisationMode: {$type: String},
	            		polarisationChannels: {$type: String}
	    			},
	    			acquisitionParameter: {
	    				acquisitionStartTime: { $type: Date, index: true},
	    				acquisitionStopTime: { $type: Date, index: true},
	    				relativePassNumber: { $type: Number},
	    				orbitNumber: { $type: Number},
	    				startTimeFromAscendingNode: { $type: Number},
	    				stopTimeFromAscendingNode: { $type: Number},
	    				orbitDirection: { $type: String}
	    			}
	    		}],
	    		productInformation: {
	    			productType: {$type: String},
	    			timeliness: {$type: String},
					size: { $type: Number},
					cloudCoveragePercentage: { $type: Number}
	    		}
	    	}

    	}
}, { typeKey: '$type' });

productSchema.index({ 'geometry': '2dsphere' });
//productSchema.path('geometry').index({ type: '2dsphere'});

productSchema.plugin(mongoosePaginate);
var Product = mongoose.model('Product', productSchema);





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
	productionStatus: product or acquisition status (ARCHIVED | ACQUIRED | PLANNED)
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


		// set start stop criteria
		if(req.query.start && !req.query.stop) req.query.stop = "2050-12-12T23:59:59.999Z";
		if(!req.query.start && req.query.stop) req.query.start = "1970-01-01T00:00:00.000Z";
		if(req.query.start && req.query.stop) {
			filters.push(
				{"properties.earthObservation.acquisitionInformation.acquisitionParameter.acquisitionStartTime":
					{$lt: new Date(req.query.stop)}
			});
			filters.push(
				{"properties.earthObservation.acquisitionInformation.acquisitionParameter.acquisitionStopTime":
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
		if(req.query.productionStatus) filters.push({"properties.earthObservation.status" : req.query.productionStatus});

		if(dataset && dataset != '*') filters.push({"properties.earthObservation.parentIdentifier" : dataset});

		// set track range criteria
		var track;
		if(req.query.wlog) track = req.query.wlog;
		if(req.query.track) track = req.query.track;
		if(track) {
			filters.push(rangeCriteria.parse(track,"properties.earthObservation.acquisitionInformation.acquisitionParameter.relativePassNumber",false)	);
		}
		if(req.query.availabilityTime) {
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
    	Product.findOne({"id": id},function(err,results) {
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
	try {
		var products = req.body.map(function(a) {return inputFormaters.mapFromEOCat(a,dataset,Product);});
		console.log('Adding '+ req.body.length +' products in dataset "'+req.query.dataset+'"');
		save(products,Product,"id").then(
			function(bulkRes){
				console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
				res.send({'report':bulkRes});
			},
			function(err) {
				console.log("Bulk insert error");
			});
	}
	catch(err) {
		res.send({'error':"Error updating data"});
	}
}

exports.addProductFromNgEO = function(req, res) {
	var dataset = req.query.dataset;
	var products = req.body.map(function(a) {return inputFormaters.mapFromngEO(a,dataset,Product);});
	//console.log(JSON.stringify(products));
	console.log('Adding '+ req.body.length +' products in dataset "'+req.query.dataset+'"');
	save(products,Product,"id").then(function(bulkRes){
	console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
	res.send({'report':bulkRes});
	});
}

exports.addProductFromHub = function(req, res) {
	var products = req.body.map(function(a) {return inputFormaters.mapFromHub(a,req.query.dataset,Product);});
	//console.log(JSON.stringify(products));
	console.log('Adding '+ req.body.length +' products in dataset "'+req.query.dataset+'"');

	save(products,Product,"id").then(function(bulkRes){
	console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
	res.send({'report':bulkRes});
	});
}




exports.updateProduct = function(req, res) {
	var id = req.params.id;
	var product = req.body;
	console.log('Updating product: ' + id);
	console.log(JSON.stringify(product));
	Product.update({'id':id}, product, {safe:true}, function(err, result) {
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
	Product.remove({'id':id}, {safe:true}, function(err, result) {
	            if (err) {
            		res.send({'error':'An error has occurred - ' + err});
            	} else {
            		console.log('' + result + ' document(s) deleted');
                		res.send(req.body);
            	}
        	});
}

exports.describe = function(req, res) {


	Product.aggregate([
		[
			{
				$facet: {
					byPlatformSerialIdentifier: [
						{
							$group: {
								_id: {
									dataset: "$properties.earthObservation.parentIdentifier",
									//start: "$start",
									//end: "$end",
									//count: "$count",
									platformSerialIdentifier: "$properties.earthObservation.acquisitionInformation.platform.platformSerialIdentifier"
								},
								count: { "$sum": 1 },
								//platformSerialIdentifiers: {$push:{ platformSerialIdentifier: "$platformSerialIdentifier"}}
							}
						},
						{
							$group: {
								_id: "$_id.dataset",
								platformSerialIdentifiers: {$addToSet: {platformSerialIdentifier: "$_id.platformSerialIdentifier", count: "$count"}},
							}
						},
						{
							$group: {
								_id: {
									dataset: "$_id",
									platformSerialIdentifiers: "$platformSerialIdentifiers",
								}
							}
						},
					],
					byProductType: [
						{
							$group: {
								_id: {
									dataset: "$properties.earthObservation.parentIdentifier",
									//start: "$start",
									//end: "$end",
									//count: "$count",
									productType: "$properties.earthObservation.productInformation.productType"
								},
								count: { "$sum": 1 },
								//platformSerialIdentifiers: {$push:{ platformSerialIdentifier: "$platformSerialIdentifier"}}
							}
						},
						{
							$group: {
								_id: "$_id.dataset",
								productTypes: {$addToSet: {productType: "$_id.productType", count: "$count"}},
							}
						},
						{
							$group: {
								_id: {
									dataset: "$_id",
									productTypes: "$productTypes",
								}
							}
						},
					],
					byTimeliness: [
						{
							$group: {
								_id: {
									dataset: "$properties.earthObservation.parentIdentifier",
									//start: "$start",
									//end: "$end",
									//count: "$count",
									timeliness: "$properties.earthObservation.productInformation.timeliness"
								},
								count: { "$sum": 1 },
							}
						},
						{
							$group: {
								_id: "$_id.dataset",
								timelinesses: {$addToSet: {timeliness: "$_id.timeliness", count: "$count"}},
							}
						},
						{
							$group: {
								_id: {
									dataset: "$_id",
									timelinesses: "$timelinesses",
								}
							}
						},
					],
					byDataset: [
						{
							$group: {
								_id: "$properties.earthObservation.parentIdentifier",
								count: { $sum: 1 },
								start: { $min: "$properties.earthObservation.acquisitionInformation.acquisitionParameter.acquisitionStartTime" },
								end: { $max: "$properties.earthObservation.acquisitionInformation.acquisitionParameter.acquisitionStartTime" },
							}
						},
						{$unwind: "$start"},
						{$unwind: "$end"},
						{
							$group: {
								_id: {
									dataset: "$_id",
									count: "$count"
								},
								start: { $min: "$start" },
								end: { $max: "$end" },
							}
						},
						{
							$group: {
								_id: "$_id.dataset",
								stats: {$addToSet: {count: "$_id.count", start: "$start", end: "$end"}},
							}
						},
						{
							$group: {
								_id: {
									dataset: "$_id",
									stats: "$stats",
								}
							}
						},
					]

				}
			},
			{
				$group : {
					_id: { $setUnion: [ "$byPlatformSerialIdentifier", "$byProductType", "$byTimeliness", "$byDataset" ] },
				}
			},
			{$unwind: "$_id"},
			{
				$group : {
					_id: "$_id._id.dataset",
					productTypes: {$addToSet: "$_id._id.productTypes"},
					timelinesses: {$addToSet: "$_id._id.timelinesses"},
					platformSerialIdentifiers: {$addToSet: "$_id._id.platformSerialIdentifiers"},
					stats: {$addToSet: "$_id._id.stats"},
				}
			},
			{$unwind: "$productTypes"},
			{$unwind: "$timelinesses"},
			{$unwind: "$platformSerialIdentifiers"},
			{$unwind: "$stats"},
			{
				$group : {
					_id: {
						dataset: "$_id",
						productTypes: "$productTypes",
						timelinesses: "$timelinesses",
						platformSerialIdentifiers: "$platformSerialIdentifiers",
						count: "$stats.count",
						start: "$stats.start",
						end: "$stats.end",
					}
				}
			},
			{$unwind: "$_id.start"},
			{$unwind: "$_id.end"},
			{$unwind: "$_id.start"},
			{$unwind: "$_id.end"},
			{$unwind: "$_id.count"},
		]
	],
	function(err,result) {
		if (err) {
			res.send({'error':'Description failed - ' + err});
		} else {
			var description = [];
			for(var i=0;i<result.length;i++) {
				console.log(result[i]._id.dataset)
				description.push(result[i]._id);
			}

			res.send({datasets: description});
			//res.send(result);
	 	}
	}
	);

}

exports.odata2 = function(req, res) {
	try {
		var query = odata.createQuery(req.query);

		console.log(query);
		console.log(query.limit);


		Product.find(
        query.query,
        query.projection,
        query.skip,
        query.limit
    ).exec(function(err, result) {
			if (!err) {
				var response
				console.log("format: "+format);
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





		//res.send({filter: filter});
	}
	catch (err) {
		console.log("ERROR: Cannot create odata filter");
		res.send({'error':'Cannot create odata filter - ' + err});
	}

}



exports.odata = function(req, res) {
	try {
		var filter = odata.createFilter(req.query.$filter);
		console.log("filter: ");
		console.log(filter);
		console.log("req: ");
		console.log(req);

		/*
		Product.find(filter, function(err, data){
				res.json({
					'@odata.context': req.protocol + '://' + req.get('host') + '/odata/$metadata#products',
					value: data
				});
		});
		*/

		var offset = (req.query.$skip)?parseInt(req.query.$skip):0;
		var sorting = "desc";
		var limit = (req.query.$top)?parseInt(req.query.$top):100;
		var format = req.query.$format;
		//var orderby = (req.query.$orderby)?req.query.$orderby:'desc';

		Product.paginate(filter, { sort: {'properties.start': 'desc'}, offset: offset, limit: limit }, function(err, result) {
			if (!err) {
				var response
				console.log("format: "+format);
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





		//res.send({filter: filter});
	}
	catch (err) {
		console.log("ERROR: Cannot create odata filter");
		res.send({'error':'Cannot create odata filter - ' + err});
	}

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
				//for(var i = 0; i<indexFileList.length; i++) processIndexFile(dataset,baseUrl,indexFileList[i]);
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
						var products = result.map(function(a) {return inputFormaters.mapFromIndex(a,dataset);});
						console.log(products.length +' products found in Index file ');
						if(products.length > 0) {
							save(products,Product,"id").then(function(bulkRes){
		      			console.log("Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
								if((cursor + 1) < indexFileList.length) {
									processIndexFilesRecusively(dataset,baseUrl,indexFileList,cursor+1);
								} else console.log("Harvesting completed !");
							});

						} else {
							if((cursor + 1) < indexFileList.length) {
								processIndexFilesRecusively(dataset,baseUrl,indexFileList,cursor+1);
							} else console.log("Harvesting completed !");

						}
					});
				});
			}


		}
	);

}


exports.harvestDHUS = async function(ws, req) {
	var csvArray = [];
	
	if(req.query.url) {
		console.log("Base URL for Harvesting: "+req.query.url);
		var csvArray = await recursiveGetCsv(req.query.url,ws);

		console.log("Found " + csvArray.length + " CSV file to harvest.");
		ws.send("Found " + csvArray.length + " CSV file to harvest.");
		
		//ws.send("First csv: "+csvArray[0]);

	} else {
		ws.send("Please provide a URL !");
		ws.close();
	
	}
}

async function getHTTPDir(url,ws) {
	var linksArray = [];
	
	//console.log("Url: "+url);
	await request(
		{
			uri: url,
			transform: function (body) {
				return cheerio.load(body);
			}
		}
		)
	.then(
		function ($) {

			$("a").each(function ()	{
				
				if(!this.attribs.href.includes("?") && this.attribs.href[0] != '/' && !url.includes(this.attribs.href)) {
					ws.send(this.attribs.href);
					linksArray.push(this.attribs.href);
				}
			});
			
		}
	)
	.catch(function (error) {
		console.log('Error contacting server: ', error);
	});

	return linksArray;
	
}

async function recursiveGetCsv(url,ws) {
	let links = await getHTTPDir(url,ws);
	let csvArray = links.map(link => {
		return !link.includes(".csv") ? recursiveGetCsv(url+"/"+link,ws) : url+"/"+link;
	});
	return Array.prototype.concat(...(await Promise.all(csvArray)));
}
	

exports.harvestDHUSQuery = async function(ws, req) {
	
	let result = {};
	try {
		let parsedUrl = new URL(req.query.url);
		let statusMessage = "";
		let offset = parseInt(parsedUrl.searchParams.get('start'))?parseInt(parsedUrl.searchParams.get('start')):0;
		let rows = parseInt(parsedUrl.searchParams.get('rows'))?parseInt(parsedUrl.searchParams.get('rows')):100;
		do {
			parsedUrl.searchParams.set('start', offset);
			parsedUrl.searchParams.set('rows', rows);
			console.log("Search url:"+parsedUrl.href);
			result = await getDHUSQuery(parsedUrl.href,ws);
			statusMessage = offset + " to " 
				+ (offset+rows<result.feed["opensearch:totalResults"]?offset+rows:result.feed["opensearch:totalResults"]) 
				+ " of " + result.feed["opensearch:totalResults"]
				+ ":  " + result.feed.entry.length + " items to ingest";
			ws.send(statusMessage);
			var products = result.feed.entry.map(function(a) {return inputFormaters.mapFromHubOpenSearch(a,req.query.dataset,Product);});

			save(products,Product,"id").then(function(bulkRes){
				ws.send(statusMessage + "    ====> Bulk complete: Updated: "+bulkRes.nModified+"  Inserted: "+bulkRes.nUpserted);
			});

			offset += rows;
			
		}
		while (offset < result.feed["opensearch:totalResults"]);
	}
	catch (err) {
		ws.send("Harvesting Error: "+err.message);
	}

}

async function getDHUSQuery(url,ws) {
	var entries = [];
	await request(
		{
			uri: url,
			json: true
		}
	)
	.then(
		function (result) {
			
			entries = result;
		}
	)
	.catch(
		function (error) {
			console.log('Error contacting server: ', error.message);
		}
	);
	return entries;
}