const { addonBuilder } = require("stremio-addon-sdk");
const csv = require('csv-parser');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');


const manifest = {
  "id": "org.yofardev.letterboxd",
  "version": "1.0.0",

  "name": "Watchlist",
  "description": "Import Letterboxd watchlist from CSV file",

  // set what type of resources we will return
  "resources": [
    "catalog",
    "stream"
  ],

  "types": ["movie", "series"], // your add-on will be preferred for those content types

  // set catalogs, we'll be making 2 catalogs in this case, 1 for movies and 1 for series
  "catalogs": [
    {
      type: 'movie',
      id: 'letterboxd-watchlist-movies'
    },
    {
      type: 'series',
      id: 'letterboxd-watchlist-series'
    }
  ],

  // prefix of item IDs (ie: "tt0032138")
  "idPrefixes": ["tt"]

};


async function initDataset(scrapUpdate) {
  const list = [];
  const username = "yofaraway";
  if (scrapUpdate) {
    if ((fs.existsSync(username + ".csv"))) {
      const l = await scrapWatchlist(username);
      const ll = await getAdditionalData(username, l);
      saveCsv(username, ll);
      list.push(...ll);
    } else {
      console.log("No Letterboxd CSV found (need to be named {username}.csv and place at the root of the addon's folder");
    }
  }
  else {
    const l = await getMoviesFromCSV(username + ".csv");
    saveCsv(username, l);
    list.push(...l);
  }
  console.log(list.length + " movies found");
  dataset = list.reduce((map, movie) => {
    movie.type = 'movie';
    map[movie.imdbId] = movie;
    return map;
  }, {});
}

initDataset(false);


async function getAdditionalData(username, movies) {
  const inCache = await getMoviesFromCSV(username + ".csv");
  let j = 0;
  for (i in movies) {
    j += 1;
    if (inCache.some(obj => obj.filmId === movies[i].filmId)) {
      console.log("In cache : " + movies[i].title + " (" + j + "/" + movies.length + ")");
    } else {
      movies[i]['imdbId'] = await getImdbIdFromLetterboxdURI(movies[i].letterboxdUri);
      movies[i]['title'] = await getTitleFromLetterboxdURI(movies[i].letterboxdUri);
      console.log("Fetched : " + movies[i].title + " (" + j + "/" + movies.length + ")");
    }
  }

  // To remove movies which are not in the playlist anymore
  const inCacheUpdated = inCache.filter(obj1 =>
    movies.some(obj2 => obj2.filmId === obj1.filmId)
  );

  movies.concat(inCacheUpdated);
  return movies;
}

function saveCsv(username, movies) {
  const header = ['Name', 'Letterboxd URI', 'Id', 'IMDB Id'];
  const rows = movies.map(movie => [movie.title, movie.letterboxdUri, movie.filmId, movie.imdbId]);
  const csvData = [header, ...rows];
  const csvString = csvData.map(row => row.join(';')).join('\n');
  fs.writeFileSync(username + '.csv', csvString);
  console.log("File saved : " + username + ".csv");
}

async function scrapWatchlist(username) {
  const baseUrl = "https://letterboxd.com/" + username + "/watchlist/page/";
  try {
    const response = await axios.get(baseUrl + 1);
    const $ = cheerio.load(response.data);

    const totalMovies = parseInt($('.js-watchlist-content').attr('data-num-entries'), 10);
    const maxMoviesPerPage = 28;
    const totalPages = Math.ceil(totalMovies / maxMoviesPerPage);
    const allMovies = [];

    for (let i = 1; i <= totalPages; i++) {
      const pageUrl = baseUrl + i;
      const pageResponse = await axios.get(pageUrl);
      const $page = cheerio.load(pageResponse.data);
      const movieElements = $page('.film-poster');
      let films = [];
      movieElements.each((i, el) => {
        let filmId = $page(el).attr('data-film-id');
        let filmSlug = $page(el).attr('data-film-slug');
        films.push({ filmId: filmId, letterboxdUri: "https://letterboxd.com" + filmSlug });
      });
      allMovies.push(...films);
    }
    return allMovies;

  } catch (error) {
    console.error(`Wrong username ? : ${baseUrl} - ${error.message}`);
    return {};
  }
}

async function getMoviesFromCSV(csvFile) {
  const movies = [];
  let lineCount = 0;
  let totalLines = await getTotalLines(csvFile);
  return new Promise((resolve) => {
    fs.createReadStream(csvFile)
      .pipe(csv({ separator: ';' }))
      .on('data', async (data) => {
        const uri = data['Letterboxd URI'];
        let filmId;
        let imdbId;
        if (data['Id'] === undefined) {
          filmId = await getIdFromLetterboxdURI(uri);
        } else {
          filmId = data['Id'];
        }
        if (data['IMDB Id'] === undefined) {
          imdbId = await getImdbIdFromLetterboxdURI(uri)
        }
        else {
          imdbId = data['IMDB Id'];
        }

        const movie = {
          title: data['Name'],
          letterboxdUri: uri,
          filmId: filmId,
          imdbId: imdbId,
        };
        lineCount += 1;
        movies.push(movie);
        console.log(movie.title + " (" + lineCount + ")");
        if (lineCount === totalLines) {
          resolve(movies);
        }
      })
  });
}

async function getImdbIdFromLetterboxdURI(uri) {
  try {
    const response = await axios.get(uri);
    const $ = cheerio.load(response.data);
    const imdbLink = $('a.track-event[data-track-action="IMDb"]').attr('href');
    const imdbId = imdbLink ? imdbLink.match(/\/title\/([a-z0-9]+)/i)[1] : '';
    return imdbId;
  } catch (error) {
    console.error(`Error fetching IMDb ID for URI: ${uri}`);
    return '';
  }
}

async function getTitleFromLetterboxdURI(uri) {
  try {
    const response = await axios.get(uri);
    const $ = cheerio.load(response.data);
    const scriptContent = $('script:contains("var filmData")').html();
    const filmDataString = scriptContent.match(/var filmData = {[^}]*}/)[0];
    eval(filmDataString);
    const movieTitle = filmData.name;
    return movieTitle;
  } catch (error) {
    console.error(`Error fetching Title for URI: ${uri}`);
    return '';
  }
}

async function getIdFromLetterboxdURI(uri) {
  try {
    const response = await axios.get(uri);
    const $ = cheerio.load(response.data);
    const scriptContent = $('script:contains("var filmData")').html();
    const filmDataString = scriptContent.match(/var filmData = {[^}]*}/)[0];
    eval(filmDataString);
    const id = filmData.id;
    return id;
  } catch (error) {
    console.error(`Error fetching Title for URI: ${uri}`);
    return '';
  }
}

function getTotalLines(csvFile) {
  return new Promise((resolve) => {
    i = 0;
    fs.createReadStream(csvFile)
      .pipe(csv({ separator: ',' })) // Use tab as the separator
      .on('data', (data) => {
        i += 1;
      }).on('end', () => {
        resolve(i);
      })
  });
}

function generateMetaPreview(value, key) {
  const METAHUB_URL = "https://images.metahub.space";
  const imdbId = key.split(":")[0];
  const url = METAHUB_URL + "/poster/medium/" + imdbId + "/img";
  return {
    id: imdbId,
    type: value.type,
    name: value.name,
    poster: url,
  }

}


const builder = new addonBuilder(manifest);
let dataset;

// Streams handler
builder.defineStreamHandler(async function (args) {
  if (dataset[args.id]) {
    return Promise.resolve({ streams: [dataset[args.id]] });
  } else {
    return Promise.resolve({ streams: [] });
  }
})





builder.defineCatalogHandler(async function (args, cb) {
  const metas = Object.entries(dataset)
    .map(([key, value]) => generateMetaPreview(value, key))
  return Promise.resolve({ metas: metas })

})

module.exports = builder.getInterface()