// This modules parses a range criteria and returns the corresponding mongoose search filter
// parameters:
//    - rangeString: the range criteria string to parse (mathematical range notation)
//    - attribute: the attribute of the schema this criteria should be applied to
//    - date:   (optional boolean)  if true, the criteria is handled as a date (if false: number)

exports.parse = function(rangeString,attribute,date) {
  var filter = {};
  var notation = rangeString.replace(/[^\[\]\{\}]+/g,"x");
  var minmaxString = rangeString.replace(/[\[\]\{\}]+/g,"").split(",");
  var minmax = [];
  for(var i =0;i<minmaxString.length;i++) {
    //minmax[i] = "new Date('"+minmax[i]+"')";
    minmax[i] = (date)?new Date(minmaxString[i]):parseInt(minmaxString[i]);
  }

  console.log("min: "+minmax[0]);
  console.log("max: "+minmax[1]);

  switch (notation) {
    case "[x]":
      filter[attribute] = {$lte: minmax[1], $gte: minmax[0] };
      //filter = JSON.parse('{"'+attribute+'":{"$lte": '+minmax[1]+',"$gte": '+minmax[0]+'}}');
      break;
    case "]x[":
      filter[attribute] = {$lt: minmax[1], $gt: minmax[0] };
      //filter = JSON.parse('{"'+attribute+'":{"$lt": '+minmax[1]+',"$gt": '+minmax[0]+'}}');
      break;
    case "[x":
      filter[attribute] = {$gte: minmax[0] };
      //filter = JSON.parse('{"'+attribute+'":{"$gte": '+minmax[0]+'}}');
      break;
    case "]x":
      filter[attribute] = {$gt: minmax[0]};
      //filter = JSON.parse('{"'+attribute+'":{"$gt": '+minmax[0]+'}}');
      //filter[attribute] = {"$gt": new Date(minmaxString[0])};

      break;
    case "x[":
      filter[attribute] = {$lt: minmax[0] };
      //filter = JSON.parse('{"'+attribute+'":{"$lt": '+minmax[0]+'}}');
      break;
    case "x]":
      filter[attribute] = {$lte: minmax[0]};
      //filter = JSON.parse('{"'+attribute+'":{"$lte": '+minmax[0]+'}}');
      break;
    case "]x]":
      filter[attribute] = {$lte: minmax[1], $gt: minmax[0] };
      //filter = JSON.parse('{"'+attribute+'":{"$lte": '+minmax[1]+',"$gt": '+minmax[0]+'}}');
      break;
    case "[x[":
      filter[attribute] = {$lt: minmax[1], $gte: minmax[0] };
      //filter = JSON.parse('{"'+attribute+'":{"$lt": '+minmax[1]+',"$gte": '+minmax[0]+'}}');
      break;
    case "{x}":
      var flist = [];
      for(var i = 0;i<minmax.length;i++) {
        filter[attribute] = {$eq: minmax[i]};
        console.log(JSON.stringify(filter));
        flist.push(filter);
      }
      filter = {$or: flist};
      break;
    case "x":
      filter[attribute] = minmax[0];
      //filter = JSON.parse('{"'+attribute+'": '+minmax[0]+'}');
      break;
  }



	return filter;
}
