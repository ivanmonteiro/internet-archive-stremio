var Stremio = require("stremio-addons");
var ia = require('internet-archive');

// Enable server logging for development purposes
process.env.STREMIO_LOGGING = true; 

// Define manifest object
var manifest = { 
    // See https://github.com/Stremio/stremio-addons/blob/master/docs/api/manifest.md for full explanation
    id: "org.stremio.internetarchive",
    version: "1.0.1",

    name: "InternetArchive",
    description: "Stremio addon for Internet Archive Videos found at https://archive.org",
    //webDescription: "<p>Stremio addon for Internet Archive Videos found at <a href='https://archive.org'>archive.org</a></p>",
    icon: "https://ivancantalice.files.wordpress.com/2018/05/internetarchivelogo256x256.png",
    logo: "https://ivancantalice.files.wordpress.com/2018/05/internetarchivelogo256x256.png",
    background: "https://ivancantalice.files.wordpress.com/2018/05/camera-wallpaper.jpeg", 

    // Properties that determine when Stremio picks this add-on
    types: ["movie"], // your add-on will be preferred for those content types
    idProperty: ['iav_id'], // the property to use as an ID for your add-on; your add-on will be preferred for items with that property; can be an array
    // We need this for pre-4.0 Stremio, it's the obsolete equivalent of types/idProperty
    filter: { "query.iav_id": { "$exists": true }, "query.type": { "$in": ["movie"] } },

    // Adding a sort would add a tab in Discover and a lane in the Board for this add-on
    sorts: [ {prop: "popularities.internetarchive", name: "InternetArchive", types: ["movie"]}],
    
    endpoint: "https://internetarchivestremio.herokuapp.com/stremioget/stremio/v1",
    isFree : true,
    contactEmail: "ivanmonteiroc@gmail.com",
};

function loadPoster(identifier) {
    return "https://archive.org/services/get-item-image.php?identifier=" + identifier;
}

//gets poster from files array
function getPoster(identifier, results) {
    var posters = results.files.filter(function(f) { return f.format ==  "Thumbnail" && f.name.endsWith(".jpg") && f.size < 100 });
    if (posters.size > 0) {
        return "https://archive.org/download/" + identifier + "/" + posters[0].name;
    }
    else {
        return null;
    }
}


function toMetaFindResult(row) {
    return {
        id: 'iav_id:' + row.identifier, // unique ID for the media, will be returned as "basic_id" in the request object later
        name: row.title,     // title of media
        poster: loadPoster(row.identifier),    // image link
        //posterShape: 'regular',                                       // can also be 'landscape' or 'square'
        //banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
        genre: ['Entertainment'],
        isFree: 1,                                                    // some aren't
        popularity: row.downloads,                                             // the larger, the more popular this item is
        popularities: { internetarchive: row.downloads },                                // same as 'popularity'; use this if you want to provide different sort orders in your manifest
        type: 'movie'                                                 // can also be "tv", "series", "channel"
    }
}


function getItemMetadata(identifier, callback) {
    ia.metadata(identifier, function(err, results){
        if (err) console.error(err);
        callback(err, results);
    });
}


function findStream(identifier, callback) {
    var results = getItemMetadata(identifier, function(err, results) {
        //console.log(JSON.stringify(results, null, 2));

        var streams = [];

        var mpeg4Streams = results.files.filter(function(f) { return f.name.endsWith(".mpeg4") });
        if (mpeg4Streams != null && mpeg4Streams.length > 0) {
            streams.push({
                availability: 1,
                url: "https://archive.org/download/" + identifier + "/" + mpeg4Streams[0].name,
                title: mpeg4Streams[0].name,
                tag: ['mp4'],
                isFree: 1,
                iav_id: identifier//args.query.twitch_id
            });
        }

        var mp4Streams = results.files.filter(function(f) { return f.name.endsWith(".mp4") });
        if (mp4Streams != null && mp4Streams.length > 0) {
            streams.push({
                availability: 1,
                url: "https://archive.org/download/" + identifier + "/" + mp4Streams[0].name,
                title: mp4Streams[0].name,
                tag: ['mp4'],
                isFree: 1,
                iav_id: identifier//args.query.twitch_id
            });
        }
            
        console.log(JSON.stringify(streams, null, 2));
        
        callback(null, streams);
    });
}


var dataset = {};

var methods = { };

var addon = new Stremio.Server({
    "stream.find": function(args, callback) {
        console.log("received request from stream.find", args)
        // callback expects array of stream objects
        findStream(args.query.iav_id, callback);
    },
    "meta.find": function(args, callback) {
        console.log("received request from meta.find", args)
        // callback expects array of meta object (primary meta feed)
        // it passes "limit" and "skip" for pagination
        /*
        args:
        {
            query: {
              type: 'movie',                     // can also be "tv", "series", "channel"
              'popularities.basic': { '$gt': 0 }
            },
            popular: true,
            complete: true,
            sort: {
              'popularities.basic': -1 // -1 for descending, 1 for ascending
            },
            limit: 70,                           // limit length of the response array to "70"
            skip: 0                              // offset, as pages change it will progress to "70", "140", ...
        }*/
        var params = {
            q: 'mediatype:movies',
            rows: args.limit,//limit
            page: (args.skip/args.limit) + 1,//formula: (args.skip/args.limit) + 1
            fl: ['identifier,title,collection,downloads,description,date'],//fields returned
            "sort[]": "downloads desc"
        };
    
        ia.advancedSearch(params, function(err, results) {
            if (err) console.error(err);
            //console.log(JSON.stringify(results.response, null, 2));
            var response = results.response.docs.map(toMetaFindResult);
            //console.log(JSON.stringify(response, null, 2));
            callback(null, response);
        });  
        /*
        response:
        [
            {
                id: 'basic_id:opa2135',                                       // unique ID for the media, will be returned as "basic_id" in the request object later
                name: 'basic title',                                          // title of media
                poster: 'http://thetvdb.com/banners/posters/78804-52.jpg',    // image link
                posterShape: 'regular',                                       // can also be 'landscape' or 'square'
                banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
                genre: ['Entertainment'],
                isFree: 1,                                                    // some aren't
                popularity: 3831,                                             // the larger, the more popular this item is
                popularities: { basic: 3831 },                                // same as 'popularity'; use this if you want to provide different sort orders in your manifest
                type: 'movie'                                                 // can also be "tv", "series", "channel"
            },
            ...
            
        ]
        */

    },
    "meta.get": function(args, callback) {
        console.log("received request from meta.get", args)
        // callback expects one meta element
        /*
        args:
        {
            query: {
              basic_id: 'opa2135' // based on what you set as "id" in the previous responses
            }
        }*/
        var results = getItemMetadata(args.query.iav_id, function(err, results) {
            //console.log(JSON.stringify(results, null, 2));

            var response = {
                id: 'iav_id:' + results.metadata.identifier,                                       // unique ID for the media, will be returned as "basic_id" in the request object later
                name: results.metadata.title,                                          // title of media
                poster: getPoster(args.query.iav_id, results),    // image link
                //posterShape: 'regular',                                       // can also be 'landscape' or 'square'
                //banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
                genre: ['Entertainment'],
                isFree: 1,                                                    // some aren't
                popularity: 3831,                                             // the larger, the more popular this item is
                popularities: { internetarchive: 3831 },                                // same as 'popularity'; use this if you want to provide different sort orders in your manifest
                type: 'movie'                                                 // can also be "tv", "series", "channel"
            };

            //console.log(JSON.stringify(response, null, 2));
            callback(err, response);
        });
        /*
        response:
        {
            id: 'basic_id:opa2135',                                       // unique ID for the media, will be returned as "basic_id" in the request object later
            name: 'basic title',                                          // title of media
            poster: 'http://thetvdb.com/banners/posters/78804-52.jpg',    // image link
            posterShape: 'regular',                                       // can also be 'landscape' or 'square'
            banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
            genre: ['Entertainment'],
            isFree: 1,                                                    // some aren't
            popularity: 3831,                                             // the larger, the more popular this item is
            popularities: { basic: 3831 },                                // same as 'popularity'; use this if you want to provide different sort orders in your manifest
            type: 'movie'                                                 // can also be "tv", "series", "channel"
          }
          */        
    },
    "meta.search": function(args, callback) {
        console.log("received request from meta.search", args)
        // callback expects array of search results with meta objects
        // does not support pagination      
        /*
        args:
        {
            query: 'baseball season', // search query
            limit: 10                 // limit length of the response array to "10"
        }*/        
        var params = {
            q: args.query + ' AND mediatype:movies',
            rows: args.limit,//limit
            page: "1",//formula: (offset/limit) + 1
            fl: ['identifier,title,collection,downloads,description,date']//fields returned
        };
    
        ia.advancedSearch(params, function(err, results) {
            if (err) console.error(err);
            //console.log(JSON.stringify(results.response, null, 2));
            var response = results.response.docs.map(toMetaFindResult);
            //console.log(JSON.stringify(response, null, 2));
            callback(null, response);
        });  
        /*
        response:
        {
            query: 'baseball season', // return the query from the response
            results: [ // Array of Metadata objects
              {
                id: 'basic_id:opa2135',                                       // unique ID for the media, will be returned as "basic_id" in the request object later
                name: 'basic title',                                          // title of media
                poster: 'http://thetvdb.com/banners/posters/78804-52.jpg',    // image link
                posterShape: 'regular',                                       // can also be 'landscape' or 'square'
                banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
                genre: ['Entertainment'],
                isFree: 1,                                                    // some aren't
                popularity: 3831,                                             // the larger, the more popular this item is
                popularities: { basic: 3831 },                                // same as 'popularity'; use this if you want to provide different sort orders in your manifest
                type: 'movie'                                                 // can also be "tv", "series", "channel"
              },
              ...
            ],
          } 
          */            
    },
}, manifest);

if (require.main===module) var server = require("http").createServer(function (req, res) {
    addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
}).on("listening", function()
{
    var port = server.address().port;
    console.log("Sample Stremio Addon listening on "+port);
    console.log("You can test this add-on via the web app at: http://app.strem.io/#/discover/movie?addon="+encodeURIComponent('http://localhost:'+port))
}).listen(process.env.PORT || 7000);

// Export for local usage
module.exports = addon;