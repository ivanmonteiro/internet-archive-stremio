var Stremio = require("stremio-addons");
var ia = require('internet-archive');
var isUrl = require('is-url')

// Enable server logging for development purposes
process.env.STREMIO_LOGGING = true; 

// Define manifest object
var manifest = { 
    // See https://github.com/Stremio/stremio-addons/blob/master/docs/api/manifest.md for full explanation
    id: "org.stremio.internetarchive",//TODO: change back
    version: "1.0.10",
    name: "InternetArchive",

    description: "Stremio addon for Internet Archive videos at https://archive.org",
    webDescription: "<p>Stremio addon for Internet Archive videos at <a href='https://archive.org'>archive.org</a></p>",
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
    email: "ivanmonteiroc@gmail.com"
};

function loadPoster(identifier) {
    return "https://archive.org/services/img/" + identifier;
}

function toMetaFindResult(row) {
    return {
        id: 'iav_id:' + row.identifier, // unique ID for the media, will be returned as "basic_id" in the request object later
        name: row.title, // title of media
        poster: loadPoster(row.identifier), // image link
        //posterShape: 'regular', // can also be 'landscape' or 'square'
        //banner: 'http://thetvdb.com/banners/graphical/78804-g44.jpg', // image link
        genre: ['Entertainment'],
        isFree: 1, // some aren't
        popularity: row.downloads, // the larger, the more popular this item is
        popularities: { internetarchive: row.downloads }, // same as 'popularity'; use this if you want to provide different sort orders in your manifest
        type: 'movie' // can also be "tv", "series", "channel"
    }
}

const iaAdvancedSearch = function (params) {
    //Promise wrapper of inernet archive advancedsearch api - used to avoid chashes using this api
    return new Promise(function(resolve, reject) {
        ia.advancedSearch(params, function(err, results) {
            if (err) {
                console.log(err);
                reject(new Error('Error loading from Internet Archive Advanced Search API'));
            } else {
                resolve(results);
            }
        });
    });
} 

function iaGetItemMetadata(identifier) {
    //Promise wrapper of inernet archive metadata api - used to avoid chashes using this api
    return new Promise(function (resolve, reject) {
        ia.metadata(identifier, function(err, results) {
            if (err) {
                console.log(err);
                reject(new Error('Error loading from Internet Archive Metadata Api'));
            } else {
                resolve(results);
            }
        });
    });
}


function streamFind(args, callback) {
    console.log("received request from stream.find", args);
    // callback expects array of stream objects
    var identifier = args.query.iav_id;

    if (identifier === undefined) {
        console.log("Id not supported");
        return callback(new Error("Internal error - Id not supported"));
    }

    iaGetItemMetadata(identifier)
        .then(function (results) {
            var streams = [];

            var mpeg4Streams = results.files.filter(function(f) { return f.name.endsWith(".mpeg4") });
            
            if (mpeg4Streams != null && mpeg4Streams.length > 0) {
                streams.push({
                    availability: 1,
                    url: "https://archive.org/download/" + identifier + "/" + mpeg4Streams[0].name,
                    title: mpeg4Streams[0].name,
                    tag: ['mp4'],
                    isFree: 1,
                    iav_id: identifier
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
                    iav_id: identifier
                });
            }

            console.log(JSON.stringify(streams, null, 2)); 
            callback(null, streams);
        })
        .catch(function (error) {
            if (error) {
                console.log(error);
                return callback(error);
            }
        });
    
}

function metaFind(args, callback) {
    console.log("received request from meta.find", args);
    // callback expects array of meta object (primary meta feed)
    // it passes "limit" and "skip" for pagination
    if (args.limit === undefined || args.limit === 0) {
        return callback(new Error("Invalid limit argument"));
    }

    var params = {
        q: 'collection:moviesandfilms AND mediatype:movies',
        rows: args.limit,//limit
        page: ((args.skip === undefined ? 0 : args.skip)/args.limit) + 1,//formula: (args.skip/args.limit) + 1
        //fl: ['identifier,title,collection,downloads,description,date'],//fields returned
        fl: ['identifier,title,downloads'],//fields returned
        "sort[]": "downloads desc"
    };

    iaAdvancedSearch(params)
        .then(function (results) {
            var response = results.response.docs.map(toMetaFindResult);
            callback(null, response);
        })
        .catch(function (error) {
            console.error(error);
            callback(error);
        });
}

function metaGet(args, callback) {
    console.log("received request from meta.get", args);
    // callback expects one meta element
    var identifier = args.query.iav_id;

    if (identifier === undefined) {
        console.log("Id not supported");
        return callback(new Error("Id not supported"));
    }
    
    iaGetItemMetadata(identifier)
        .then(function (results) {
            //console.log(JSON.stringify(results, null, 2));
            var response = {
                id: 'iav_id:' + args.query.iav_id, // unique ID for the media, will be returned as "basic_id" in the request object later
                name: results.metadata.title, // title of media
                poster: loadPoster(args.query.iav_id),// getPoster(args.query.iav_id, results),    // image link               
                genre: ['Entertainment'],
                isFree: 1, // some aren't
                popularity: 3831, // the larger, the more popular this item is
                popularities: { internetarchive: 3831 }, // same as 'popularity'; use this if you want to provide different sort orders in your manifest
                type: 'movie' // can also be "tv", "series", "channel"
            };            
            //console.log(JSON.stringify(response, null, 2));
            callback(null, response);
        })
        .catch(function (error) {
            if (error) {
                console.log(error);
                callback(error);
            }
        });
    
}

function getCleanQuery(query) {        
    var cleanQuery = query.toLowerCase();
    //cleanQuery = cleanQuery.replace(/\W/g, '');
    if (cleanQuery.length > 30) {        
        cleanQuery = cleanQuery.substring(0, 30);//limit query size
    }
    return cleanQuery;
}
/*
function prepareQuery(query) {
    return new Promise(function(resolve, reject) {
    });
}*/

function metaSearch(args, callback) {
    console.log("received request from meta.search", args)
    // callback expects array of search results with meta objects
    // does not support pagination
    if (args.query === undefined || args.query.length === 0) {
        return callback(new Error("Invalid query argument"));
    }

    //check if query is url
    if (isUrl(args.query)) {
        console.log("Cant process url as search query, sending error to callback...");
        return callback(new Error("Cant process url query"));
    }

    var cleanQuery = getCleanQuery(args.query);

    if (cleanQuery.length === 0) {
        return callback(new Error("Invalid query argument"));
    }

    if (args.limit === undefined || args.limit === 0) {
        //checks limit for 0 and sends error
        console.log("Invalid limit argument");
        return callback(new Error("Invalid limit argument"));
    }

    console.log("clean query: " + cleanQuery);
    
    var params = {
        q: 'mediatype:movies AND collection:moviesandfilms AND title:"' + cleanQuery + '"',
        rows: args.limit,
        page: "1",
        fl: ['identifier,title,,downloads']//fields returned
    };

    iaAdvancedSearch(params)
        .then(function (results) {
            //console.log(JSON.stringify(results.response, null, 2));
            if (results === undefined || results.response === undefined || results.response.docs === undefined) {
                var message = "The response has undefined properties";
                console.log(message);
                return callback(new Error(message));
            }
            var response = results.response.docs.map(toMetaFindResult);
            //console.log(JSON.stringify(response, null, 2));
            callback(null, response);
        })
        .catch(function (error) {
            console.log(error);
            callback(error);
        });
}

var addon = new Stremio.Server({
    "stream.find": streamFind,
    "meta.find": metaFind,
    "meta.get": metaGet,
    "meta.search": metaSearch,
}, manifest);

if (require.main===module) {
    var server = require("http").createServer(function (req, res) {
        addon.middleware(req, res, function() { res.end() }); // wire the middleware - also compatible with connect / express
    }).on("listening", function()
    {
        var port = server.address().port;
        console.log("Stremio Addon listening on "+port);
        console.log("You can test this add-on via the web app at: http://app.strem.io/#/discover/movie?addon="+encodeURIComponent('http://localhost:'+port))
    }).listen(process.env.PORT || 7000);
}
// Export for local usage
module.exports = addon;