const fs = require('fs');
const AWS = require('aws-sdk');
const mime = require('mime-types')
const Work = require('workjs/work');
let work = new Work();

let nondestructive = false;


// S3 Methods supplied here:
//
// s3.uploadFileData( data, mime, destName, options = { cache: true, nocache_patterns: ['index.html$', 'index.html.gz$'] } ) : Promise
// s3.uploadFile( fileName, destName, options = { cache: true, nocache_patterns: ['index.html$', 'index.html.gz$'] } ) : Promise
// s3.uploadDir( dirName, destName, options = { cache: true, batch_size: 8, whitelist: [], blacklist: [], nocache_patterns: ['index.html$', 'index.html.gz$'] } ) : Promise
// s3.listObjects( params, out = [] ) : Promise
// s3.deleteObjects( params ) : Promise
// s3.clearBucket( options = { whitelist: [], blacklist: [] } ) : Promise
//
// Note: the white/blacklisting is a pretty convenient way to upload/delete huge batches of things in a targeted way
//
function S3Proto( _s3, _bucketname ) {
  let s3 = _s3;
  let bucketname = _bucketname;

  // upload data to a filename in s3
  this.uploadFileData = async (data, mime, destName, options = { gendirobj: true, cache: true, nocache_patterns: ['index.html$', 'index.html.gz$'] }) => new Promise(async (rs, rj) => {
    if (data == undefined) {
      console.log( "uploadFileData called with data undefined")
      return rs(undefined);
    }
    options = Object.assign( { gendirobj: true, cache: true, nocache_patterns: ['index.html$', 'index.html.gz$'] }, options );
    // array of destnames
    destName = "string" === typeof destName ? [destName] : destName;
    for (let d of destName) {
      const params = {
        Key: d, // file will be saved as testBucket/${destName}
        Body: data,
        ACL: 'public-read',
        'ContentType': mime || 'application/octet-stream',
      };

      if (
        // if user disabled cache outright, or
        !options.cache ||
        // disable cache if file matches certain file patterns
        options.nocache_patterns.filter( nc => d.match( new RegExp( nc ) ) ).length > 0
      ) {
        console.log( "disable cache control for " + d );
        // When max-age=0 is used, the browser will use the last version when
        // viewing a resource on a back/forward press. If no-cache is used,
        // the resource will be refetched.
        params['CacheControl'] = 'public,max-age=0';
        //params['CacheControl'] = 'no-cache';
        params['Expires'] = 0;
      } else {
        params['CacheControl'] = `max-age=${60}`; // 1 minute
        //params['CacheControl'] = `max-age=${60 * 60}`; // 1 hour
        //params['CacheControl'] = `max-age=${60 * 60 * 24}`; // 1 day
        //params['CacheControl'] = `max-age=${60 * 60 * 24 * 4.333}`; // 1 mo
      }

      if (!nondestructive) {
        s3.upload(params, function(s3Err, data) {
          if (data == undefined || s3Err) return rj( s3Err );
          console.log(`File uploaded successfully at ${data && data.Location ? data.Location : ""}`)
          return rs(data.Location);
        });

        // auto-generate directory object [dir] and [dir/] if it's a subdir [dir/index.html]
        if (options.gendirobj && d.match(/\/index.html$/)) {
          //// let html =  `<meta http-equiv="refresh" content="0; URL='http://${bucketname}.s3-website-us-west-2.amazonaws.com/${d}'" />`;
          let dest1 = d.replace( /\/index.html?$/, '' ); // subdir
          // let dest2 = d.replace( /index.html?$/, '' );   // subdir/
          try {
            console.log( "Uploading:", d, "as", dest1 );
            let res1 = await this.uploadFileData( data /*html*/, "text/html", [dest1], { cache: false } );
            console.log(`     uploaded successfully at ${res1} (${d})`)

            // console.log( "Uploading:", d, "as", dest2 );
            // let res2 = await this.uploadFileData( html, "text/html", [dest2], { cache: false } );
            // console.log(`     uploaded successfully at ${res2} (${d})`)
          } catch (err) {}
        }
      } else {
        console.log(`File uploaded successfully at ${destName}`)
        return rs(destName)
      }
    }
  });

  // usage: uploadFile( "src/index.html", "index.html" );
  this.uploadFile = async (fileName, destName, options = { gendirobj: true, cache: true, nocache_patterns: ['index.html$', 'index.html.gz$'] } ) => new Promise((rs, rj) => {
    options = Object.assign( { gendirobj: true, cache: true }, options );
    fs.readFile(fileName, async (err, data) => {
      if (err) rj(err);
      rs( await this.uploadFileData( data, mime.lookup(fileName), destName, options ) );
    });
  });

  // usage: uploadDir( "dist/", "" );
  this.uploadDir = async (dirName, destName, options = { gendirobj: true, cache: true, batch_size: 8, whitelist: [], blacklist: [], nocache_patterns: ['index.html$', 'index.html.gz$'] }) => new Promise( async (rs, rj) => {
    options = Object.assign( { gendirobj: true, cache: true, batch_size: 8, whitelist: [], blacklist: [] }, options );

    // if it's a file, hand it off to the file upload
    if (!fs.statSync( dirName ).isDirectory()) {
      await this.uploadFile( dirName, destName, options );
      rs( dirName );
      return;
    }

    // if dirname doesn't have a trailing slash, add one
    if (dirName[dirName.length-1] !== '/') dirName = dirName + '/';
    //if (destName[destName.length-1] !== '/') destName = destName + '/';

    //console.log( `Uploading ${dirName}: ${fs.existsSync(dirName)} to ${destName}` );
    if (fs.existsSync(dirName) == false) {
      console.log( `${dirName} not found`)
      process.exit(-1)
    }
    let files = fs.readdirSync(dirName);
    let dirs = [];
    for (let file of files) {
      let wl = options.whitelist.length === 0 || options.whitelist.filter( r => file.match( new RegExp( r ) ) ).length !== 0;
      let bl = options.blacklist.length > 0 && options.blacklist.filter( r => file.match( new RegExp( r ) ) ).length !== 0;
      //console.log( `Uploading ${dirName + file}: wl:${wl} bl:${bl} wl:${options.whitelist} bl:${options.blacklist} dir:${fs.statSync(dirName + file).isDirectory()}` );
      if (wl && !bl) {
        if (fs.statSync(dirName + file).isDirectory()) {
          dirs.push( file );
        }
        else {
          if (!dirName.match(/^dist\/download\//))
            work.push( async () => await this.uploadFile( dirName + file, destName + file, options ) );
        }
      }
    }
    await work.process( options.batch_size );
    for (let file of dirs) {
      await this.uploadDir(dirName + file + '/', destName + file + '/', options );
    }
    rs(dirName);
  });


  // list all objects from a bucket
  // give:
  // let params = {
  //   Bucket: bucketname,
  //   MaxKeys: 1,   // s3 max is 1000
  // };
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property
  this.listObjects = async (params, out = []) => new Promise((resolve, reject) => {
    let amt = 0; // respect MaxKeys and bail if we've uploaded the max number
    s3.listObjectsV2(params).promise()
      .then(({Contents, IsTruncated, NextContinuationToken}) => {
        amt += Contents.length
        out.push(...Contents);
        !IsTruncated || amt >= params.MaxKeys ?
          resolve(out) :
          resolve(this.listObjects(Object.assign(params, {ContinuationToken: NextContinuationToken}), out));
      })
      .catch(reject);
  });

  // delete object array such as:  [ { Key: 'STRING_VALUE' }, ... ]
  // give:
  // let params = {
  //   Bucket: bucketname,
  //   Delete: {
  //     Objects: objs,
  //   },
  // };
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property
  this.deleteObjects = async (params) => {
    // basic <1000 object deleter
    let __deleteObjects = async (params) => new Promise( ( rs, rj ) => {
      if (!nondestructive) {
        s3.deleteObjects(params, function(err, data) {
          if (err) { console.log( err ); console.log( err.stack ); console.log( params ); rj( {err: err, stack: err.stack} ); } // error
          else     rs( data );             // successful response
        })
      } else {
        rs(params.Delete.Objects)
      }
    });

    // respect aws 1000 object max limit...
    //let origobjects = params.Delete.Objects.slice(0);
    let objects = params.Delete.Objects.slice(0);
    while (0 < objects.length) {
      let num = Math.min( 1000, objects.length );
      let objs = objects.slice(0, num);
      await __deleteObjects( {
        Bucket: params.Bucket,
        Delete: {
          Objects: objs,
          Quiet: params.Delete.Quiet
        },
      });
      objects = objects.slice(num, objects.length);
    }
  }






  // clear an entire s3 bucket (or files from a bucket)
  // whitelist - only delete objects in this whitelist
  // blacklist - dont delete any objects prefixed with any in this blacklist
  // e.g.
  //    whitelist: [`^installed`]
  //    blacklist: [`^__bots`]
  this.clearBucket = async ( options = { whitelist: [], blacklist: [] } ) => {
    options = Object.assign( { whitelist: [], blacklist: [] }, options );
    console.log( `Clear Bucket (options: ${JSON.stringify( options )})` );
    console.log( `listing all objects from ${bucketname}` );
    let objs = await this.listObjects({
      Bucket: bucketname,
      //MaxKeys: 1, // s3 max is 1000
    });
    objs = objs.map( r => { return { Key: r.Key } } );
    objs = objs.filter( r => options.blacklist.filter( b => r.Key.match( new RegExp(`${b}`) ) ).length === 0 );
    objs = objs.filter( r => options.whitelist.length === 0 || options.whitelist.filter( w => r.Key.match( new RegExp(`${w}`) ) ).length !== 0 );
    console.log( objs );

    if (0 < objs.length) {
      console.log( `deleting ${objs.length} s3 objects from ${bucketname}...` );
      await this.deleteObjects({
        Bucket: bucketname,
        Delete: {
          Objects: objs,
          Quiet: false
        },
      });
      console.log( "...done" );
    } else {
      console.log( "...nothing to delete...done" );
    }
  }
}

// this module exports a single object "s3" which has methods on it like uploadDirs uploadFile clearBucket, etc...
//
// const aws = require('./aws')
//
// // look in ~/.aws/credentials for which profile to use
// var credentials = new aws.AWS.SharedIniFileCredentials({profile: 'myprofile'});
// aws.AWS.config.credentials = credentials;
//
// let s3 = aws.createS3(
//   "mys3bucketname",
//   "us-west-2",
// );
//
// (async () => {
//   let subdir = ""; // dirname, no trailing slash. "" for root dir
//
//   // clear the entire bucket of any object prefixed with ${subdir}
//   // note: if we ever share bucket with other uploader scripts, we'll add white/blacklist items so we dont blow away resources from those other scripts
//   await s3.clearBucket( { whitelist: [`^${subdir}`], blacklist: [] })
//
//   // upload the entire local filesystem "dist/" directory (e.g. some webpack bundle) to s3://mys3bucketname/${subdir}
//   await s3.uploadDir( "dist/", `${subdir}${subdir != "" ? '/' : ''}`, {
//     cache: true,
//     batch_size: 8,
//     whitelist: [],
//     blacklist: [],
//     nocache_patterns: ['index.html$', 'index.html.gz$']
//   });
//
//   // upload the [src] buffer to 2 s3 objects:  'foldername' and 'foldername/index.html', without caching
//   let src = "some data that I put here"
//   await www.uploadFileData( src, "text/html", [`foldername`, `foldername/index.html`], { cache: false } );
// })();
module.exports.createS3 = (
    bucketname,
    region = "us-west-2",
    accessKeyId = undefined,
    secretAccessKey = undefined
    ) => {

  let options = {
    sslEnabled: true,
    computeChecksums: true,
    apiVersion: '2006-03-01',
    params: {Bucket: bucketname},
    region: region
  };
  if (accessKeyId) options.accessKeyId = accessKeyId;
  if (secretAccessKey) options.secretAccessKey = secretAccessKey;
  const s3 = new AWS.S3( options );
  return s3 ? new S3Proto( s3, bucketname ) : undefined;
}

module.exports.AWS = AWS;
