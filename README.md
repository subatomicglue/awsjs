# AWSjs

A library useful for deploying web assets to S3

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

