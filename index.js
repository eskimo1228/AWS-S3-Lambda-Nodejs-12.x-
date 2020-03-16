var async = require('async');
var path = require('path');
var AWS = require('aws-sdk');
var sharp = require('sharp');
var util = require('util');
// get reference to S3 client
var s3 = new AWS.S3();
exports.handler = async (event, context) => {
    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {
        depth: 5
    }));
    var srcBucket = event.Records[0].s3.bucket.name;
    // Object key may have spaces or unicode non-ASCII characters.
    var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    var dstBucket = "delikatesskungen-cdn-frankfurt";
    // Sanity check: validate that source and destination are different buckets.
    if (srcBucket == dstBucket) {
        console.error("Destination bucket must not match source bucket.");
        return;
    }
    console.log(srcBucket);
    console.log(srcKey);

    // Infer the image type.
    var typeMatch = srcKey.match(/\.([^.]*)$/);
    var fileName = path.basename(srcKey);
    if (!typeMatch) {
        console.error('unable to infer image type for key ' + srcKey);
        return;
    }
    var imageType = typeMatch[1].toLowerCase();
    if (imageType != "jpg" && imageType != "png") {
        console.log('skipping non-image ' + srcKey);
        return;
    }
    try {
        console.time("downloadImage");
        console.log("download");
        
        const image = await s3.getObject({ Bucket: srcBucket, Key: srcKey }).promise();
        console.timeEnd("downloadImage");

        console.time("convertImage");
        console.log("Reponse content type : " + image.ContentType);
        console.log("Conversion");

        const imageMetadata = await sharp(image.Body).metadata();
        var scalingFactor = Math.min(500 / imageMetadata.width, 500 / imageMetadata.height);

        console.log("scalingFactor : " + scalingFactor);
        
        var width = scalingFactor * imageMetadata.width;
        var height = scalingFactor * imageMetadata.height;
        width = Math.round(width);
        height = Math.round(height);

        console.log("new width : " + width);
        console.log("new height : " + height);

        const resizedImage = await sharp(image.Body).resize(width, height).toFormat('jpeg').toBuffer();

        console.timeEnd("convertImage");

        console.time("uploadImage");
        console.log("upload to path : /uploads/" + fileName.slice(0, -4) + ".jpg");
        // Stream the transformed image to a different folder.
        await s3.putObject({
            Bucket: dstBucket,
            Key: srcKey.slice(0, -4) + ".jpg",//same directory with srcBucket directory
            Body: resizedImage,
            ContentType: 'JPG'
        }).promise();

        context.succeed();
    } catch (e) {
        context.fail(`Error resizing files: ${e}`)
    }
};