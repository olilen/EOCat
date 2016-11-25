// 3 Formater functions for encoding the search respnse:
//	- nativeFormat(): native (as stored in mongodb database)
//	- owcFormat(): compliant with features of a OWS geojson encoded response
//	- ngeoFormat(): ngEO like (mapping to eop like model - to simulate ngEO Web Browser search I/F)

exports.nativeFormat = function(item,model) {
	return item;
}

exports.owcFormat = function(item,model) {
  try {
  	var tempItem = new model(item);
  	var newItem = tempItem.toObject();
  	delete newItem._id;
  	newItem.id = newItem.identifier;
  	delete newItem.identifier;
  	return newItem;

  } catch (err) {
    return ({error: "Item could not be formated"});
  }
}

exports.ngeoFormat = function(item,model) {

  try {

  	var newItem = 	{
  		"id": item.identifier,
  		"properties": {
  			"links": [{
  				"@href": "",
  				"@rel": "self",
  				"@title": "Reference link",
  				"@type": "application/atom+xml"
  			}, {
  				"@href": "",
  				"@rel": "search",
  				"@title": "OpenSearch Description link",
  				"@type": "application/opensearchdescription+xml"
  			}, {
  				"@href": (item.properties.links.data.length > 0)?item.properties.links.data[0].href:'',
  				"@rel": "enclosure",
  				"@title": item.properties.title,
  				"@type": "application/x-binary",
  				"@length": item.properties.earthObservation.productInformation.size
  			}],
  			"updated": item.properties.creationDate,
  			"published": item.properties.creationDate,
  			"title": item.properties.title,
  			"EarthObservation": {
  				"@id": "EarthObservation_"+ item._id,
  				"phenomenonTime": {
  					"TimePeriod": {
  						"@id": "TimePeriod_" + item._id,
  						"beginPosition": item.properties.start,
  						"endPosition": item.properties.stop
  					}
  				},
  				"resultTime": {
  					"TimeInstant": {
  						"@id": "TimeInstant_"+ item._id,
  						"timePosition": item.properties.start,
  					}
  				},
  				"procedure": {
  					"EarthObservationEquipment": {
  						"@id": "EarthObservationEquipment_"+ item._id,
  						"platform": {
  							"Platform": {
  								"shortName": item.properties.earthObservation.acquisitionInformation[0].platform.platformShortName,
  								"serialIdentifier": item.properties.earthObservation.acquisitionInformation[0].platform.platformSerialIdentifier,
  							}
  						},
  						"instrument": {
  							"Instrument": {
  								"shortName": item.properties.earthObservation.acquisitionInformation[0].sensor.instrument
  							}
  						},
  						"sensor": {
  							"Sensor": {
  								//"sensorType": "RADAR",
  								"operationalMode": {
  									"@codeSpace": "urn:eop:SEN1:sensorMode",
  									"#text":  item.properties.earthObservation.acquisitionInformation[0].sensor.operationalMode
  								},
  								//"swathIdentifier": "IW"
  							}
  						},
  						"acquisitionParameters": {
  							"Acquisition": {
  								"orbitNumber": item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.orbitNumber.toString(),
  								"orbitDirection": item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.orbitDirection,
  								"wrsLongitudeGrid": {
  									"@codeSpace": "",
  									"#text": (item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.relativePassNumber)?
                      item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.relativePassNumber.toString():"",
  								},
  								"startTimeFromAscendingNode": {
  									"@uom": "msec",
  									"#text": (item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.startTimeFromAscendingNode)?
                      item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.startTimeFromAscendingNode.toString():"",
  								},
  								"completionTimeFromAscendingNode": {
  									"@uom": "msec",
  									"#text": (item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.stopTimeFromAscendingNode)?
                      item.properties.earthObservation.acquisitionInformation[0].acquisitionParameter.stopTimeFromAscendingNode.toString():"",
  								},
  								"polarisationMode": item.properties.earthObservation.acquisitionInformation[0].sensor.operationalMode.polarisationMode,
  								"polarisationChannels": item.properties.earthObservation.acquisitionInformation[0].sensor.operationalMode.polarisationChannels,
  							}
  						}
  					}
  				},
  				"result": {
  					"EarthObservationResult": {
  						"@id": "EarthObservationResult_"+ item._id,
  						"product": {
  							"ProductInformation": {
  								"fileName": {
  									"ServiceReference": {
  										"@href": (item.properties.links.data.length > 0)?item.properties.links.data[0].href:'',
  										"RequestMessage": null
  									}
  								},
  								"size": {
  									"@uom": "Bytes",
                    "#text": (item.properties.earthObservation.productInformation.size)?item.properties.earthObservation.productInformation.size.toString():""
                    //"#text": item.properties.earthObservation.productInformation.size.toString()
  								},
  								"timeliness": (item.properties.earthObservation.productInformation.timeliness)?item.properties.earthObservation.productInformation.timeliness:''
  							}
  						}
  					}
  				},
  				"metaDataProperty": {
  					"EarthObservationMetaData": {
  						"identifier": item.identifier,
  						"acquisitionType": "NOMINAL",
  						"productType": item.properties.earthObservation.productInformation.productType,
  						"status": item.properties.earthObservation.productInformation.status
  					}
  				},
  			},
  			"identifier": item.identifier
  		},
  		"type": "Feature",
  		"geometry": item.geometry
  	};
	  return newItem;
  } catch (err) {
    return ({error: "Item could not be formated"});
  }


};
