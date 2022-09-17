# AWSjs

A library useful for deploying web assets to S3

## Features

AWS s3 bucket uploader with:
- maximum upload performance
  - files upload in parallel
  - with max-worker pool-size to control maximum parallelism
- regex based white and blacklisting of filenames to include
- cachecontrol
- local filesystem recursive directory traversal

Methods exposed:
- uploadFileData
- uploadDir
- listObjects
- deleteObjects
- clearBucket

## Usage
Example `upload.js` script, used to deploy a web app to s3
```
const aws = require('./aws')

// look in ~/.aws/credentials for which profile to use
var credentials = new aws.AWS.SharedIniFileCredentials({profile: 'myprofile'});
aws.AWS.config.credentials = credentials;

let s3 = aws.createS3(
  "mys3bucketname",
  "us-west-2",
);

(async () => {
  let subdir = ""; // dirname, no trailing slash. "" for root dir

  // clear the entire bucket of any object prefixed with ${subdir}
  // note: if we ever share bucket with other uploader scripts, we'll add white/blacklist items so we dont blow away resources from those other scripts
  await s3.clearBucket( { whitelist: [`^${subdir}`], blacklist: [] })

  // upload the entire local filesystem "dist/" directory (e.g. some webpack bundle) to s3://mys3bucketname/${subdir}
  await s3.uploadDir( "dist/", `${subdir}${subdir != "" ? '/' : ''}`, {
    cache: true,
    batch_size: 8,
    whitelist: [],
    blacklist: [],
    nocache_patterns: ['index.html$', 'index.html.gz$']
  });

  // upload the [src] buffer to 2 s3 objects:  'foldername' and 'foldername/index.html', without caching
  let src = "some data that I put here"
  await www.uploadFileData( src, "text/html", [`foldername`, `foldername/index.html`], { cache: false } );
})();
```

