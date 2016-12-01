// 4 Formaters functions for decoding the inputs for insertion/updates:
// 		mapItem(): for items provided in native format (i.e. conformant with the EOCat product schema)
//		mapFromngEO: for items returned from ngEO catalogue (via ngEO Web server, i.e. in "geojson")
//		mapFromHub: for items returned from a search on the Copernicus SciHub (non-standard/ad-hoc json)
//		mapFromOADS: for items listed in the OADS index files
exports.mapFromEOCat = function(item,dataset,model) {
	try {
		var newItem = item;
		if(!dataset) {
			item.properties.earthObservation.parentIdentifier = "native_"
				+item.properties.earthObservation.acquisitionInformation[0].platform.platformShortName
				+"_"
				+item.properties.earthObservation.acquisitionInformation[0].sensor.instrument
				+"_"
				+item.properties.earthObservation.acquisitionInformation[0].sensor.operationalMode;
		} else {
			item.properties.earthObservation.parentIdentifier = dataset;
		}
		try {
			var testi = new model(item);
		} catch (err) {
			console.log("error: "+err.message);
		}

		var testio = testi.toObject();
		//console.log(testio.properties.start);
		delete testio._id;
		//newItem.properties.start  = new Date(item.properties.start);
		//newItem.properties.stop  = new Date(item.properties.stop);
		return testio;
	} catch (err) {
		console.log("error: "+err.message);
		return null;
	}
}


exports.mapFromngEO = function(item,dataset,model) {

	try{
	// if dataset is not provided, build a default one
		if(!dataset) {
			dataset = "ngEO_"
				+item.properties.EarthObservation.procedure.EarthObservationEquipment.platform.Platform.shortName
				+"_"
				+item.properties.EarthObservation.procedure.EarthObservationEquipment.instrument.Instrument.shortName
				+"_"
				+item.properties.EarthObservation.procedure.EarthObservationEquipment.sensor.Sensor.operationalMode['#text'];
		}

      var newItem = {
            id: item.properties.EarthObservation.metaDataProperty.EarthObservationMetaData.identifier,
            geometry: item.geometry,
            properties: {
                  updated: new Date(item.properties.EarthObservation.resultTime.TimeInstant.timePosition),
                  title: item.properties.title,
                  date: item.properties.EarthObservation.phenomenonTime.TimePeriod.beginPosition  +'/'+  item.properties.EarthObservation.phenomenonTime.TimePeriod.endPosition,
									/*
                  links: {
                        data: [{
                              href: (item.properties.links.length > 2)?item.properties.links[2]['@href']:"",
															title: (item.properties.links.length > 2)?item.properties.title,"",
															length:
                        }]
                  },
									*/
                  earthObservation: {
												parentIdentifier: dataset,
												status: item.properties.EarthObservation.metaDataProperty.EarthObservationMetaData.status,
                        acquisitionInformation: [{
                              platform: {
                                    platformShortName: item.properties.EarthObservation.procedure.EarthObservationEquipment.platform.Platform.shortName,
                                    platformSerialIdentifier: item.properties.EarthObservation.procedure.EarthObservationEquipment.platform.Platform.serialIdentifier
                              },
                              sensor: {
                                    instrument: item.properties.EarthObservation.procedure.EarthObservationEquipment.instrument.Instrument.shortName,
                                    operationalMode: item.properties.EarthObservation.procedure.EarthObservationEquipment.sensor.Sensor.operationalMode['#text'],
                                    polarisationMode: item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.polarisationMode,
                                    polarisationChannels: item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.polarisationChannels
                              },
                              acquisitionParameter: {
                                    acquisitionStartTime: new Date(item.properties.EarthObservation.phenomenonTime.TimePeriod.beginPosition),
                                    acquisitionStopTime: new Date(item.properties.EarthObservation.phenomenonTime.TimePeriod.endPosition),
																		relativePassNumber: parseInt(item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.wrsLongitudeGrid['#text']),
																		orbitNumber: parseInt(item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.orbitNumber),
																		startTimeFromAscendingNode: (item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.startTimeFromAscendingNode)?
																			parseInt(item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.startTimeFromAscendingNode['#text']):null,
																		stopTimeFromAscendingNode: (item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.completionTimeFromAscendingNode)?
																			parseInt(item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.completionTimeFromAscendingNode['#text']):null,
																		orbitDirection: item.properties.EarthObservation.procedure.EarthObservationEquipment.acquisitionParameters.Acquisition.orbitDirection

                              }
                        }],
                        productInformation: {
                              productType: item.properties.EarthObservation.metaDataProperty.EarthObservationMetaData.productType,
                              timeliness: (item.properties.EarthObservation.result)?
																item.properties.EarthObservation.result.EarthObservationResult.product.ProductInformation.timeliness:'',
															size: (item.properties.EarthObservation.result)?
																parseInt(item.properties.EarthObservation.result.EarthObservationResult.product.ProductInformation.size['#text']):null
                        }
                  }
            }
					};
			// add link.data attribute if there's a product URL
			if (item.properties.links.length > 2) {
				newItem.properties.links = {
					data: [{
						href: item.properties.links[2]['@href'],
						title: item.properties.title,
						type: "application/x-binary",
						length: (item.properties.EarthObservation.result)?
							parseInt(item.properties.EarthObservation.result.EarthObservationResult.product.ProductInformation.size['#text']):null
					}]
				};
			}
			return newItem;
		} catch (err) {
			return null;
		}


}

exports.mapFromHub = function(item,dataset,model) {
			//console.log(item.footprint[0][0] + "---");
			var type = '';
			var coord = [];

	try {
			if(item.footprint.length > 1) {  // hub returns a none valid geojson coordinate array for footprints over the dateline
				type = "MultiPolygon";
				coord[0] = [item.footprint[0]];
				coord[1] = [item.footprint[1]];
			} else {
				type = "Polygon";
				coord = item.footprint;
			}

			var itemGeometry = {
					type: type,
					coordinates: coord
				}
			var indexes = [[]];
			var subIndex = [];
			for(var i=0; i < item.indexes.length; i++) {
				//console.log(item.indexes[i].name);
				subIndex = [];
				for(var j=0; j < item.indexes[i].children.length; j++) {
					//console.log(item.indexes[i].children[j].name + ": " + item.indexes[i].children[j].value);
					subIndex[item.indexes[i].children[j].name] = item.indexes[i].children[j].value;
					//indexes[item.indexes[i].name.replace(/\s+/g,"_")][item.indexes[i].children[j].name.replace(/\s+/g,"_")] = item.indexes[i].children[j].value;
				}
				indexes[item.indexes[i].name] = subIndex;
			}

			// if dataset is not provided, build a default one
			if(!dataset) {
				dataset = "hub_"
					+indexes["summary"]["Satellite"]+"_"
					+indexes["summary"]["Instrument"]+"_"
					+indexes["summary"]["Mode"];
			}


			var sizeArray = indexes["summary"]["Size"].split(" ");
			var sizeInBytes;
			switch (sizeArray[1]) {
				case "B":
					sizeInBytes = Math.round(parseFloat(sizeArray[0]));
					break;
				case "MB":
					sizeInBytes = Math.round(parseFloat(sizeArray[0])*1024);
					break;
				case "GB":
					sizeInBytes = Math.round(parseFloat(sizeArray[0])*1024*1024);
					break;
				case "TB":
					sizeInBytes = Math.round(parseFloat(sizeArray[0])*1024*1024*1024);
					break;
			}
			console.log("hub size in bytes: "+sizeInBytes);

      var newItem = {
            id: indexes["summary"]["Identifier"],
            geometry: itemGeometry,
            properties: {
                  updated: new Date(indexes["product"]["Ingestion Date"]),
                  title: indexes["summary"]["Identifier"],
                  date: indexes["product"]["Sensing start"]  +'/'+  indexes["product"]["Sensing stop"],
                  links: {
                        data: [{
                              href: "https://server/"+indexes["summary"]["Filename"],
                        }]
                  },
                  earthObservation: {
												parentIdentifier: dataset,
												status: indexes["product"]["Status"],
                        acquisitionInformation: [{
                              platform: {
                                    platformShortName: indexes["summary"]["Satellite"],
                                    platformSerialIdentifier: indexes["platform"]["Satellite number"]
                              },
                              sensor: {
                                    instrument: indexes["summary"]["Instrument"],
                                    operationalMode: indexes["summary"]["Mode"],
                                    polarisationMode: indexes["product"]["Product class"],
                                    polarisationChannels: indexes["product"]["Polarisation"]
                              },
                              acquisitionParameter: {
                                    acquisitionStartTime: new Date(indexes["product"]["Sensing start"]),
                                    acquisitionStopTime: new Date(indexes["product"]["Sensing stop"]),
																		relativePassNumber: parseInt(indexes["product"]["Relative orbit (start)"]),
																		orbitNumber: parseInt(indexes["product"]["Orbit number (start)"]),
																		startTimeFromAscendingNode: null,
																		stopTimeFromAscendingNode: null,
																		orbitDirection: indexes["product"]["Pass direction"]

                              }
                        }],
                        productInformation: {
                              productType: indexes["product"]["Product type"],
                              timeliness: indexes["product"]["Timeliness Category"],
															size: sizeInBytes
                        }
                  }
            }
      };

      return newItem;
		} catch (err) {
			return null;
		}
}

exports.mapFromIndex = function(item,dataset) {

	try {
		//console.log("Mapping: \n"+JSON.stringify(item));
		var itemGeometry;
		var geoArray = item.footprint.split(' ');
		var coord =[];
		for(var i=0;i<geoArray.length;i+=2) {
			coord.push([parseFloat(geoArray[i+1]),parseFloat(geoArray[i])])
		}
		itemGeometry = {
			type: "Polygon",
			coordinates: [coord]
		}

		// if dataset is not provided, build a default one
		if(!dataset) {
			dataset = "oads_"
				+item.platformShortName+"_"
				+item.instrumentShortName+"_"
				+item.operationalMode;
		}


	      var newItem = {
	            identifier: item.productId,
	            geometry: itemGeometry,
	            properties: {
	                  updated: new Date(item.availabilityTime),
	                  title: item.productId,
	                  date: item.beginAcquisition  +'/'+  item.endAcquisition,
	                  links: {
	                        data: [{
	                              href: item.productURI
	                        }]
	                  },
	                  earthObservation: {
													parentIdentifier: dataset,
													status: "ARCHIVED",
	                        acquisitionInformation: [{
	                              platform: {
	                                    platformShortName: item.platformShortName,
	                                    platformSerialIdentifier: item.platformSerialIdentifier
	                              },
	                              sensor: {
	                                    instrument: item.instrumentShortName,
	                                    operationalMode: item.operationalMode,
																			polarisationMode: (item.polarisationMode)?item.polarisationMode:null,
																			polarisationChannels: (item.polarisationMode)?item.polarisationChannels:null,
	                              },
	                              acquisitionParameter: {
	                                    acquisitionStartTime: new Date(item.beginAcquisition),
	                                    acquisitionStopTime: new Date(item.endAcquisition),
																			orbitNumber: parseInt(item.orbitNumber),
																			orbitDirection: item.orbitDirection,
																			relativePassNumber: (item.wrsLongitudeGrid)?parseInt(item.wrsLongitudeGrid):null

	                              }
	                        }],
	                        productInformation: {
	                              productType: item.productType,
	                        }
	                  }
	            }
	      };
	      //console.log("To: \n" +JSON.stringify(newItem));
	      return newItem;
			} catch (err) {
				return null;
			}
}
