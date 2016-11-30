// This modules parses a range criteria and returns the corresponding mongoose search filter

exports.parse = function(rangeString,attribute,cast) {
  var filter = {};
  var notation = rangeString.replace(/[^\[\]\{\}]+/g,"x");
  var minmax = rangeString.replace(/[\[\]\{\}]+/g,"").split(",");
  console.log("min: "+minmax[0]);
  console.log("max: "+minmax[1]);

  switch (notation) {
    case "[x]":
      //filter[attribute] = {$lte: minmax[1], $gte: minmax[0] };
      filter = JSON.parse('{"'+attribute+'":{"$lte": '+minmax[1]+',"$gte": '+minmax[0]+'}}');
      break;
    case "]x[":
      //filter[attribute] = {$lt: minmax[1], $gt: minmax[0] };
      filter = JSON.parse('{"'+attribute+'":{"$lt": '+minmax[1]+',"$gt": '+minmax[0]+'}}');
      break;
    case "[x":
      //filter[attribute] = {$gte: minmax[0] };
      filter = JSON.parse('{"'+attribute+'":{"$gte": '+minmax[0]+'}}');
      break;
    case "]x":
      //filter[attribute] = {$gt: minmax[0]};
      filter = JSON.parse('{"'+attribute+'":{"$gt": '+minmax[0]+'}}');
      break;
    case "x[":
      //filter[attribute] = {$lt: minmax[0] };
      filter = JSON.parse('{"'+attribute+'":{"$lt": '+minmax[0]+'}}');
      break;
    case "x]":
      //filter[attribute] = {$lte: minmax[0]};
      filter = JSON.parse('{"'+attribute+'":{"$lte": '+minmax[0]+'}}');
      break;
    case "]x]":
      //filter[attribute] = {$lte: minmax[1], $gt: minmax[0] };
      filter = JSON.parse('{"'+attribute+'":{"$lte": '+minmax[1]+',"$gt": '+minmax[0]+'}}');
      break;
    case "[x[":
      //filter[attribute] = {$lt: minmax[1], $gte: minmax[0] };
      filter = JSON.parse('{"'+attribute+'":{"$lt": '+minmax[1]+',"$gte": '+minmax[0]+'}}');
      break;
    case "{x}":
      var flist = [];
      for(var i = 0;i<minmax.length;i++) {
        console.log("{'"+attribute+"':{'$eq': "+minmax[i]+"}}");
        flist.push(JSON.parse('{"'+attribute+'":{"$eq": '+minmax[i]+'}}'));
      }
      filter = {$or: flist};
      break;
    case "x":
      filter = JSON.parse('{"'+attribute+'": '+minmax[0]+'}');
      break;
  }



	return filter;
}
